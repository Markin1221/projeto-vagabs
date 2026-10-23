"""Do PDF lido + eventos do banco + centro de custo escolhido -> linhas do CSV de lançamentos."""
import ast
import calendar
import csv
import io
import os
import re
import operator
import re
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from .leitor_pdf import MESES, norm
from .models import CentroCusto, Evento, EventoApelido

# Colunas EXATAS do CSV de lançamentos (mesma ordem da aba "lancamentos CSV")
COLUNAS = ["titulo", "descricao", "tipo_lancamento", "codigo_centro_de_custo", "numero_conta",
           "codigo_item_despesa", "codigo_fonte_recurso", "id_forma_pagamento", "num_parcelas", "data_inicial",
           "dias_intervalo", "valor", "observacoes", "id_lancamento_grupo", "status_pagamento", "data_liquidacao",
           "banco_liquidacao"]
CONTA, STATUS, BANCO = "1-1", "PAGO", "1-1"  # fixos em todas as linhas da base
# Perfis de folha: "folha" = departamentos (Ativos/Demitidos/Afastados); "conselho" = Sócios/Autônomos (Matriz).
PERFIS = {
    "folha": {"titulo": "Folha {centro}", "obs": "{centro}"},
    "conselho": {"titulo": "Folha Conselho/Diretoria", "obs": "Conselho"},
}
CENTRO_CONSELHO = "ADM01"  # centro de custo padrão da folha dos Sócios (o PDF diz "DEPARTAMENTO UNICO")


def detectar_grupo(df_resumo) -> str:
    """'conselho' se o resumo tem colunas Sócios/Autônomos (e não Ativos); senão 'folha'."""
    cols = {c for c in df_resumo.columns}
    return "conselho" if ("Sócios" in cols and "Ativos" not in cols) else "folha"
_REF = re.compile(r"\{([^{}|]+)(?:\|([^{}]+))?\}")
_OPS = {ast.Add: operator.add, ast.Sub: operator.sub, ast.Mult: operator.mul, ast.Div: operator.truediv}


def montar_fontes(df_resumo, blocos) -> dict:
    """Valores do PDF por nome normalizado. Chaves: (nome, origem) com origem resumo/gps/fgts/darf, e só o nome
    (primeiro que aparecer: resumo, GPS, FGTS, DARF) para as referências de cálculo. Separar a origem evita
    confundir, por ex., o 'IRRF Férias' do resumo com o do bloco DARF IR."""
    cols = [c for c in df_resumo.columns if c not in ("Tipo", "Código", "Nome")]
    total = df_resumo["Total"] if "Total" in cols else df_resumo[cols].sum(axis=1, min_count=1)
    fontes = {}

    def guardar(nome, origem, valores):
        fontes.setdefault((norm(nome), origem), valores)
        fontes.setdefault(norm(nome), valores)

    for i, r in df_resumo.iterrows():
        v = {c: (None if r[c] != r[c] else r[c]) for c in cols}
        v["Total"] = None if total[i] != total[i] else float(total[i])
        guardar(r["Nome"], "resumo", v)
    for chave, origem in (("GPS", "gps"), ("FGTS", "fgts"), ("DARF PIS", "darf")):
        for _, r in blocos[chave].iterrows():
            guardar(r["Nome"], origem, {"Total": None if r["Valor"] != r["Valor"] else float(r["Valor"])})
    return fontes


ORIGEM_DA_SECAO = {"adicional": "resumo", "desconto": "resumo", "total": "resumo",
                   "gps": "gps", "fgts": "fgts", "pis": "darf"}


def _valor_ref(fontes, nome, coluna=None) -> float:
    reg = fontes.get(norm(nome), {})
    return float(reg.get((coluna or "Total").strip()) or 0)


def avaliar(expr: str, fontes: dict) -> float:
    """Avalia '{A} - {B|Ativos} * 2' com as quatro operações; nome ausente vale 0."""
    texto = _REF.sub(lambda m: repr(_valor_ref(fontes, m.group(1), m.group(2))), expr)

    def ev(no):
        if isinstance(no, ast.Expression):
            return ev(no.body)
        if isinstance(no, ast.BinOp) and type(no.op) in _OPS:
            return _OPS[type(no.op)](ev(no.left), ev(no.right))
        if isinstance(no, ast.UnaryOp) and isinstance(no.op, (ast.USub, ast.UAdd)):
            return -ev(no.operand) if isinstance(no.op, ast.USub) else ev(no.operand)
        if isinstance(no, ast.Constant) and isinstance(no.value, (int, float)):
            return no.value
        raise ValueError(f"Expressão inválida: {expr}")
    return ev(ast.parse(texto, mode="eval"))


def valor_do_evento(ev: Evento, fontes: dict):
    """Valor do evento no PDF (nome principal + apelidos) ou calculado; None se não aparece no PDF."""
    if ev.calculo:
        return avaliar(ev.calculo, fontes)
    origem = ORIGEM_DA_SECAO.get(ev.secao)
    achou, soma = False, 0.0
    for nome in [ev.nome_pdf, *[a.nome for a in ev.apelidos]]:
        reg = fontes.get((norm(nome or ""), origem))
        if reg is not None and reg.get("Total") is not None:
            achou, soma = True, soma + reg["Total"]
    return soma if achou else None


def sugerir_centro(db: Session, departamento_pdf: str):
    """Centro de custo (tipo departamento) cujo nome bate com o do cabeçalho do PDF; None se não achar."""
    alvo = norm(departamento_pdf)
    centros = db.scalars(select(CentroCusto).where(CentroCusto.tipo == "departamento")).all()
    return next((c for c in centros if norm(c.nome) == alvo), None) \
        or next((c for c in centros if alvo in norm(c.nome) or norm(c.nome) in alvo), None) \
        or next((c for c in centros if len(os.path.commonprefix([alvo, norm(c.nome)])) >= 6), None)  # Administrativo~Administração


def sugerir_centro_por_arquivo(db: Session, nome_arquivo: str | None):
    """Centro de custo (departamento) citado no NOME do arquivo (ex.: 'Relatório COOPERNORTE Coleta 08-2026.pdf')."""
    if not nome_arquivo:
        return None
    palavras = [p for p in re.split(r"[^a-z0-9]+", norm(os.path.splitext(nome_arquivo)[0])) if len(p) >= 4]
    centros = db.scalars(select(CentroCusto).where(CentroCusto.tipo == "departamento")).all()
    for c in centros:
        alvo = norm(c.nome)
        if any(p == alvo or len(os.path.commonprefix([p, alvo])) >= 6 for p in palavras):
            return c
    return None


def eventos_novos(db: Session, df_resumo, grupo: str = "folha") -> list[dict]:
    """Eventos do PDF (com código) que não existem no banco e têm valor diferente de zero."""
    conhecidos = {norm(n) for n in db.scalars(select(Evento.nome_pdf).where(Evento.grupo == grupo)) if n}
    conhecidos |= {norm(n) for n in db.scalars(select(EventoApelido.nome).join(Evento).where(Evento.grupo == grupo))}
    cols = [c for c in df_resumo.columns if c not in ("Tipo", "Código", "Nome")]
    novos = []
    for _, r in df_resumo[df_resumo["Código"] != ""].iterrows():
        valores = {c: (None if r[c] != r[c] else float(r[c])) for c in cols}
        if "Total" not in valores:  # layouts sem coluna Total (Sócios/Autônomos): total = soma das colunas
            valores["Total"] = round(sum(v or 0 for v in valores.values()), 2)
        if norm(r["Nome"]) not in conhecidos and any(v for v in valores.values()):
            novos.append({"codigo_pdf": r["Código"], "nome_pdf": r["Nome"], "secao": r["Tipo"].lower(),
                          "valores": valores})
    return novos


def montar_lancamentos(db: Session, cabecalho: dict, fontes: dict, centro: CentroCusto,
                       ocultar_zerados: bool = False, grupo: str = "folha") -> list[dict]:
    """Uma linha por evento que gera lançamento, na ordem do CSV. Como na aba 'lancamentos CSV' do Excel, evento
    ausente do PDF entra com 0,00; com ocultar_zerados=True ele (e qualquer valor 0) fica de fora."""
    fim = cabecalho["fim"]
    data = datetime(fim.year, fim.month, min(30, calendar.monthrange(fim.year, fim.month)[1]))
    perfil = PERFIS[grupo]
    titulo = perfil["titulo"].format(centro=centro.nome)
    obs = f"Folha {MESES[fim.month - 1]} {fim.year % 100:02d} {perfil['obs'].format(centro=centro.nome)}"
    eventos = db.scalars(select(Evento).where(Evento.ativo, Evento.gera_lancamento, Evento.grupo == grupo)
                         .order_by(Evento.ordem, Evento.id)).unique()
    linhas = []
    for ev in eventos:
        valor = valor_do_evento(ev, fontes) or 0.0
        if ocultar_zerados and abs(valor) < 0.005:
            continue
        fixo = ev.centro_custo_fixo
        item = str(ev.item_despesa.codigo) if fixo else "*0" + str(ev.item_despesa.codigo)
        f = _fonte_do_evento(ev, fontes)
        linhas.append({
            "evento_id": ev.id, "pdf_nome": f[0] if f else None, "pdf_origem": f[1] if f else None,
            "componentes": componentes(ev, fontes) if ev.calculo else None,
            "titulo": titulo, "descricao": ev.descricao, "tipo_lancamento": ev.tipo_lancamento,
            "codigo_centro_de_custo": fixo.codigo if fixo else centro.codigo, "numero_conta": CONTA,
            "codigo_item_despesa": item, "codigo_fonte_recurso": None, "id_forma_pagamento": None,
            "num_parcelas": None, "data_inicial": data, "dias_intervalo": None, "valor": round(valor, 2),
            "observacoes": obs, "id_lancamento_grupo": None, "status_pagamento": STATUS,
            "data_liquidacao": data, "banco_liquidacao": BANCO})
    return linhas


ADIANT_SALARIAL = "Adiantamento Salarial"  # adicional que não entra no total de adicionais da aba Contabil
INSS_DESCONTOS = ["INSS Rescisão", "INSS 13o. Rescisão", "INSS Férias", "INSS Folha"]


def _fonte_do_evento(ev: Evento, fontes: dict):
    """(nome, origem) com que o evento aparece no PDF, para mostrar o recorte; None se calculado ou ausente."""
    origem = ORIGEM_DA_SECAO.get(ev.secao)
    if ev.calculo:
        return None
    for nome in [ev.nome_pdf, *[a.nome for a in ev.apelidos]]:
        reg = fontes.get((norm(nome or ""), origem))
        if reg is not None and reg.get("Total") is not None:
            return nome, origem
    return None


def componentes(ev: Evento, fontes: dict) -> list[dict]:
    """De onde sai o valor de um evento calculado: cada {Nome} da fórmula com seu valor no PDF."""
    saida = []
    for m in _REF.finditer(ev.calculo or ""):
        nome, coluna = m.group(1), m.group(2)
        reg = fontes.get(norm(nome))
        # origem: a primeira que tem o nome (mesma regra de montar_fontes)
        origem = next((o for o in ("resumo", "gps", "fgts", "darf") if (norm(nome), o) in fontes), None)
        saida.append({"nome": nome + (f" ({coluna})" if coluna else ""), "valor": round(_valor_ref(fontes, nome, coluna), 2),
                      "sinal": "+", "pdf_nome": nome if reg is not None else None, "pdf_origem": origem})
    return saida


def conferencias(db: Session, fontes: dict, grupo: str = "folha") -> list[dict]:
    """Os somatórios de conferência da aba Contabil (colunas H/I 'ok'): soma dos eventos cadastrados x totais do PDF.
    Diferença quase sempre significa evento do PDF ainda não cadastrado. Cada conferência traz a `composicao`
    (as parcelas da soma) para o usuário checar de onde veio o total."""
    def val(nome, origem=None):
        return fontes.get((norm(nome), origem) if origem else norm(nome), {}).get("Total")

    def parcela(nome, origem, sinal="+", rotulo=None):
        v = val(nome, origem)
        return {"nome": rotulo or nome, "valor": round(v or 0, 2), "sinal": sinal,
                "pdf_nome": nome if v is not None else None, "pdf_origem": origem}

    def eventos_da(secao, excluir=()):
        ev = db.scalars(select(Evento).where(Evento.secao == secao, Evento.grupo == grupo)
                        .order_by(Evento.ordem, Evento.id)).unique()
        skip = {norm(x) for x in excluir}
        saida = []
        for e in ev:
            if not e.nome_pdf or norm(e.nome_pdf) in skip:
                continue
            v = valor_do_evento(e, fontes)
            if v is None:
                continue
            f = _fonte_do_evento(e, fontes)
            saida.append({"nome": e.descricao, "valor": round(v, 2), "sinal": "+",
                          "pdf_nome": f[0] if f else None, "pdf_origem": f[1] if f else None})
        return saida

    adiant = parcela(ADIANT_SALARIAL, "resumo")
    p_adic = eventos_da("adicional", [ADIANT_SALARIAL]) + ([adiant] if adiant["pdf_nome"] else [])
    p_desc = eventos_da("desconto")
    s_adic, s_desc = sum(p["valor"] for p in p_adic), sum(p["valor"] for p in p_desc)
    pdf_adic, pdf_desc, pdf_liq = (val(n, "resumo") for n in ("TOTAL DE ADICIONAIS", "TOTAL DE DESCONTOS",
                                                             "TOTAL LÍQUIDO A PAGAR"))
    gps_nomes = ["Empregados", "Sócios", "Autônomos", "Empresa Funcionários", "RAT Emp (RAT x FAP = 5,0721 %)",
                 "Vlr. Ocorrência", "Empresa Sócios", "Empresa Autônomos", "Cooperativas", "Resíduo Mês Anterior",
                 "Valor Retido"]
    if grupo == "folha":
        inss = ("INSS descontado x GPS Empregados", "Empregados", None,
                [parcela(n, "resumo") for n in INSS_DESCONTOS if val(n, "resumo") is not None])
    else:
        inss = ("INSS descontado x GPS (Empregados+Sócios+Autônomos)", "INSS", "resumo",
                [parcela(n, "gps") for n in ("Empregados", "Sócios", "Autônomos")])
    itens = [
        ("Total de adicionais", "TOTAL DE ADICIONAIS", "resumo", p_adic),
        ("Total de descontos", "TOTAL DE DESCONTOS", "resumo", p_desc),
        ("Total líquido a pagar", "TOTAL LÍQUIDO A PAGAR", "resumo",
         [{"nome": "Total de adicionais", "valor": round(s_adic, 2), "sinal": "+", "pdf_nome": None, "pdf_origem": None},
          {"nome": "Total de descontos", "valor": round(s_desc, 2), "sinal": "-", "pdf_nome": None, "pdf_origem": None}]),
        inss,
        ("GPS Sub-Total", "Sub-Total", None,
         [parcela(n, "gps") for n in gps_nomes if val(n, "gps") is not None]
         + ([parcela("Deduções de FPAS", "gps", "-")] if val("Deduções de FPAS", "gps") else [])),
        ("GPS Total Líquido", "Total Líquido", None,
         [parcela(n, "gps") for n in ("Sub-Total", "Terceiros Carreteiro", "Resíduo Terceiros", "Terceiros 5,80 %")
          if val(n, "gps") is not None]),
    ]
    saida = []
    for nome, pdf_nome, pdf_origem, comp in itens:
        pdf = val(pdf_nome, pdf_origem)
        if pdf is None:
            continue
        calc = sum(p["valor"] if p["sinal"] == "+" else -p["valor"] for p in comp)
        dif = round(calc - pdf, 2)
        saida.append({"nome": nome, "pdf": round(pdf, 2), "calculado": round(calc, 2), "diferenca": dif,
                      "ok": abs(dif) <= 0.01, "composicao": comp,
                      "pdf_nome": pdf_nome, "pdf_origem": pdf_origem or next(
                          (o for o in ("resumo", "gps", "fgts", "darf") if (norm(pdf_nome), o) in fontes), None)})
    return saida


def para_csv(linhas: list[dict], separador: str = ";", decimal: str = ",") -> str:
    """CSV no padrão do Excel pt-BR (separador ';', vírgula decimal, datas dd/mm/aaaa)."""
    def fmt(v):
        if v is None:
            return ""
        if isinstance(v, datetime):
            return v.strftime("%d/%m/%Y")
        if isinstance(v, float):
            return f"{v:.2f}".replace(".", decimal)
        return v
    buf = io.StringIO()
    w = csv.writer(buf, delimiter=separador, lineterminator="\r\n")
    w.writerow(COLUNAS)
    for l in linhas:
        w.writerow([fmt(l[c]) for c in COLUNAS])
    return buf.getvalue()
