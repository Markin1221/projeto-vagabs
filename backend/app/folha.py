"""Do PDF lido + eventos do banco + centro de custo escolhido -> linhas do CSV de lançamentos."""
import ast
import calendar
import csv
import io
import os
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


def eventos_novos(db: Session, df_resumo) -> list[dict]:
    """Eventos do PDF (com código) que não existem no banco e têm valor diferente de zero."""
    conhecidos = {norm(n) for n in db.scalars(select(Evento.nome_pdf)) if n}
    conhecidos |= {norm(n) for n in db.scalars(select(EventoApelido.nome))}
    cols = [c for c in df_resumo.columns if c not in ("Tipo", "Código", "Nome")]
    novos = []
    for _, r in df_resumo[df_resumo["Código"] != ""].iterrows():
        valores = {c: (None if r[c] != r[c] else float(r[c])) for c in cols}
        if norm(r["Nome"]) not in conhecidos and any(v for v in valores.values()):
            novos.append({"codigo_pdf": r["Código"], "nome_pdf": r["Nome"], "secao": r["Tipo"].lower(),
                          "valores": valores})
    return novos


def montar_lancamentos(db: Session, cabecalho: dict, fontes: dict, centro: CentroCusto,
                       ocultar_zerados: bool = False) -> list[dict]:
    """Uma linha por evento que gera lançamento, na ordem do CSV. Como na aba 'lancamentos CSV' do Excel, evento
    ausente do PDF entra com 0,00; com ocultar_zerados=True ele (e qualquer valor 0) fica de fora."""
    fim = cabecalho["fim"]
    data = datetime(fim.year, fim.month, min(30, calendar.monthrange(fim.year, fim.month)[1]))
    obs = f"Folha {MESES[fim.month - 1]} {fim.year % 100:02d} {centro.nome}"
    eventos = db.scalars(select(Evento).where(Evento.ativo, Evento.gera_lancamento).order_by(Evento.ordem)).unique()
    linhas = []
    for ev in eventos:
        valor = valor_do_evento(ev, fontes) or 0.0
        if ocultar_zerados and abs(valor) < 0.005:
            continue
        fixo = ev.centro_custo_fixo
        item = str(ev.item_despesa.codigo) if fixo else "*0" + str(ev.item_despesa.codigo)
        linhas.append({
            "titulo": f"Folha {centro.nome}", "descricao": ev.descricao, "tipo_lancamento": ev.tipo_lancamento,
            "codigo_centro_de_custo": fixo.codigo if fixo else centro.codigo, "numero_conta": CONTA,
            "codigo_item_despesa": item, "codigo_fonte_recurso": None, "id_forma_pagamento": None,
            "num_parcelas": None, "data_inicial": data, "dias_intervalo": None, "valor": round(valor, 2),
            "observacoes": obs, "id_lancamento_grupo": None, "status_pagamento": STATUS,
            "data_liquidacao": data, "banco_liquidacao": BANCO})
    return linhas


ADIANT_SALARIAL = "Adiantamento Salarial"  # adicional que não entra no total de adicionais da aba Contabil
INSS_DESCONTOS = ["INSS Rescisão", "INSS 13o. Rescisão", "INSS Férias", "INSS Folha"]


def conferencias(db: Session, fontes: dict) -> list[dict]:
    """Os somatórios de conferência da aba Contabil (colunas H/I 'ok'): soma dos eventos cadastrados x totais do PDF.
    Diferença quase sempre significa evento do PDF ainda não cadastrado."""
    def val(nome, origem=None):
        return fontes.get((norm(nome), origem) if origem else norm(nome), {}).get("Total")

    def soma(secao, excluir=()):
        eventos = db.scalars(select(Evento).where(Evento.secao == secao)).unique()
        return sum(valor_do_evento(e, fontes) or 0 for e in eventos
                   if e.nome_pdf and norm(e.nome_pdf) not in {norm(x) for x in excluir})

    adiant = val(ADIANT_SALARIAL, "resumo") or 0
    s_adic, s_desc = soma("adicional", [ADIANT_SALARIAL]), soma("desconto")
    pdf_adic, pdf_desc, pdf_liq = (val(n, "resumo") for n in ("TOTAL DE ADICIONAIS", "TOTAL DE DESCONTOS",
                                                             "TOTAL LÍQUIDO A PAGAR"))
    itens = [
        ("Total de adicionais", pdf_adic, s_adic + adiant),
        ("Total de descontos", pdf_desc, s_desc),
        ("Total líquido a pagar", pdf_liq, s_adic + adiant - s_desc),
        ("INSS descontado x GPS Empregados", val("Empregados"), sum(val(n, "resumo") or 0 for n in INSS_DESCONTOS)),
        ("GPS Sub-Total", val("Sub-Total"), sum(val(n) or 0 for n in (
            "Empregados", "Sócios", "Autônomos", "Empresa Funcionários", "RAT Emp (RAT x FAP = 5,0721 %)",
            "Vlr. Ocorrência", "Empresa Sócios", "Empresa Autônomos", "Cooperativas", "Resíduo Mês Anterior",
            "Valor Retido")) - (val("Deduções de FPAS") or 0)),
        ("GPS Total Líquido", val("Total Líquido"), (val("Sub-Total") or 0) + (val("Terceiros Carreteiro") or 0)
         + (val("Resíduo Terceiros") or 0) + (val("Terceiros 5,80 %") or 0)),
    ]
    saida = []
    for nome, pdf, calc in itens:
        if pdf is None:
            continue
        dif = round(calc - pdf, 2)
        saida.append({"nome": nome, "pdf": round(pdf, 2), "calculado": round(calc, 2), "diferenca": dif,
                      "ok": abs(dif) <= 0.01})
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
