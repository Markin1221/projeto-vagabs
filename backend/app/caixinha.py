"""Caixinha: planilha de um mês do caixa pequeno (Data | Saldo | Crédito | Débito | Descrição) -> CSV de lançamentos.

A classificação fica aqui no código (REGRAS): a primeira regra cujas palavras aparecem na descrição decide título,
centro de custo e item. Título repetido ganha sufixo " 01", " 02"... porque o sistema não aceita título igual."""
import csv
import io
import re
import unicodedata
from datetime import date, datetime

from openpyxl import load_workbook

from .folha import COLUNAS, codigo_item

CONTA = "46604-2"
DESCRICAO = OBS = "Caixinha"
STATUS = "PAGO"


def norm(s) -> str:
    s = unicodedata.normalize("NFKD", str(s or "")).encode("ascii", "ignore").decode().lower()
    return re.sub(r"\s+", " ", s).strip()


# (padrão regex na descrição normalizada, título, centro, item, tipo). Ordem importa: a primeira que casar vence.
REGRAS = [
    (r"cheque descontado", None, None, None, None),  # linha de controle: fica fora
    (r"(venda|vendid).*oleo|oleo.*(queimado|vendido)", "Venda de óleo queimado", "ADM04", 534, "CREDITO"),
    # bomba de combustível (antes da regra do "Bomba", que é o apelido do mecânico Almir)
    (r"(manutencao|mun\.?|bico|afericao|servicos?).*bomba|bomba (e|d)", "Manutenção da bomba de combustível", "ADM03", 6, None),
    (r"passage.*(bomba|almir)|(bomba|almir).*passage", "Passagens ao prestador de serviço Almir - mecânico", "ADM04", 52, None),
    (r"bomba|bobma|almir", "Pgto. ao prestador de serviço Almir - mecânico", "ADM04", 52, None),
    (r"passage.*everaldo|uber.*everaldo|everaldo.*passage", "Passagens ao prestador de serviço Everaldo - aux. adm", "ADM01", 52, None),
    (r"everaldo", "Pgto. ao prestador de serviço Everaldo - aux. adm", "ADM01", 52, None),
    (r"cristina|\bcris\b", "Pgto. à prestadora de serviço Maria Cristina - aux. adm", "ADM01", 52, None),
    (r"mecanico", "Pgto. ao prestador de serviço Almir - mecânico", "ADM04", 52, None),
    (r"horas extras(?!.*posto)", "Horas extras", "ADM01", 82, None),
    (r"folguis|plantao|diaria|atestado|horas extras.*posto", "Folguista no posto", "ADM03", 28, None),
    (r"almoc", "Almoços dos func. da oficina", "ADM01", 53, None),
    (r"adaime|aluguel", "Aluguel de equipamentos para reformas", "ADM06", 37, None),
    (r"extintor", "Recarga de extintor", "ADM01", 39, None),
    (r"recarga|credito.*(celular|gabriel|leo)|^credito", "Recarga do celular do socorrista", "ADM01", 51, None),
    (r"detergente|sabao|sanbao|lava louca|agua sanitaria|papel toalha|vassoura|limpeza|limpador|pulverizador|cola rato",
     "Material de higiene e limpeza", "ADM01", 11, None),
    (r"agua|botij", "Águas minerais", "ADM01", 14, None),
    (r"\bgas\b", "Gás de cozinha", "ADM01", 14, None),
    (r"jovem|daniel|^passagens$", "Passagens do jovem aprendiz Daniel", "ADM01", 500, None),
    (r"salario|slario|recisao|ferias|quinz", "Pgto. de salário", "ADM01", 500, None),
    (r"abastec|gasolina", "Abastecimento carros e motos", "ADM01", 20, None),
    (r"strada|moto|pneu|sapata", "Manutenção carros e motos", "ADM01", 17, None),
    (r"placa de (combustivel|abastecimento)", "Conserto da placa de abastecimento do posto", "ADM01", 6, None),
    (r"lava jato|compressor|correi|correa|macaco|girafa|motor (de )?partida|maquina|cavalete|mangueira",
     "Conserto de equipamentos", "ADM04", 6, None),
    (r"chaleira|resma|lapis|copias$|^copias|xero", "Material de escritório e cozinha", "ADM01", 10, None),
    (r"chave", "Cópias de chaves", "ADM01", 37, None),
    (r"broca|parafuso|peca|oringue|conec", "Peças para o almoxarifado", "ADM05", 584, None),
    (r"cafeteira|carregador|ferrolho|fechad|extencao|extensao|teclado|pilha|celular|soprador", "Utensílios e equipamentos",
     "ADM01", 7, None),
    (r"pedreiro|metralha|eletric|portao|macenaria|marcenaria|instalacao|intalacao|torneira|reforma",
     "Manutenção do prédio", "ADM06", 9, None),
    (r"farda|bota|capacete|cordo", "Fardamento dos funcionários", "ADM01", 41, None),
    (r"acucar|cafe|mercado|atacarejo|armazem|comercio|bolo|refrigerante", "Feira", "ADM01", 13, None),
    (r"passage|uber", "Passagens de funcionários", "ADM01", 51, None),
]
_REGRAS = [(re.compile(p), t, c, i, tp) for p, t, c, i, tp in REGRAS]


def classificar(desc: str, salvas=()):
    """-> (titulo, centro, item, tipo|None, reconhecido). titulo None com reconhecido=True = linha descartada.
    `salvas` (RegraCaixinha da tela) valem antes das REGRAS fixas; a palavra-chave mais longa vence."""
    d = norm(desc)
    for r in sorted(salvas, key=lambda r: -len(r.kw)):
        if norm(r.kw) and norm(r.kw) in d:
            return r.titulo, r.centro, r.item, r.tipo, True
    for rx, titulo, centro, item, tipo in _REGRAS:
        if rx.search(d):
            return titulo, centro, item, tipo, True
    return None, None, None, None, False


def _num(v):
    if isinstance(v, (int, float)) and not isinstance(v, bool):
        return float(v)
    return None


def ler_planilha(conteudo: bytes) -> tuple[list[dict], list[str]]:
    """Acha o bloco do mês pelo cabeçalho 'Data' (colunas Data, Saldo, Crédito, Débito, Descrição, lado a lado) e
    devolve as linhas com valor. Se vier mais de um mês, usa o último bloco e avisa."""
    ws = load_workbook(io.BytesIO(conteudo), data_only=True).active
    blocos = [(c.row, c.column) for row in ws.iter_rows(max_row=30) for c in row
              if isinstance(c.value, str) and norm(c.value) == "data"
              and norm(ws.cell(c.row, c.column + 4).value).startswith("descri")]
    if not blocos:
        raise ValueError("Não achei o cabeçalho 'Data | Saldo | Crédito | Débito | Descrição'.")
    avisos = []
    if len(blocos) > 1:
        avisos.append(f"A planilha tem {len(blocos)} meses lado a lado; usei só o último (mais à direita).")
    r0, c0 = blocos[-1]
    linhas = []
    for r in range(r0 + 1, ws.max_row + 1):
        if ws.cell(r, c0 + 1).value is None:  # acabou a coluna de saldo = acabou o mês (o total vem depois)
            break
        cred, deb = _num(ws.cell(r, c0 + 2).value), _num(ws.cell(r, c0 + 3).value)
        if not (cred or deb):
            continue
        dt = ws.cell(r, c0).value
        linhas.append({"linha": r, "data": dt.date() if isinstance(dt, datetime) else dt if isinstance(dt, date) else None,
                       "descricao": str(ws.cell(r, c0 + 4).value or "").strip(),
                       "tipo": "CREDITO" if cred and not deb else "DEBITO", "valor": round(cred or deb, 2)})
    return linhas, avisos


def montar(linhas: list[dict], data_padrao: date, usar_data_da_linha: bool = False, salvas=()) -> list[dict]:
    """Linhas não reconhecidas voltam com revisar=True e sem códigos: a tela pede a classificação manual."""
    saida, vistos = [], {}
    for l in linhas:
        titulo, centro, item, tipo, ok = classificar(l["descricao"], salvas)
        if ok and titulo is None:
            continue
        if not ok:
            dt = l["data"] if usar_data_da_linha and l["data"] else data_padrao
            saida.append({"titulo": None, "tipo_lancamento": l["tipo"], "codigo_centro_de_custo": None,
                          "codigo_item_despesa": None, "valor": l["valor"], "data_inicial": dt,
                          "origem": l["descricao"], "linha": l["linha"], "revisar": True})
            continue
        n = vistos.get(titulo, 0)
        vistos[titulo] = n + 1
        dt = (l["data"] if usar_data_da_linha and l["data"] else data_padrao)
        saida.append({
            "titulo": titulo if n == 0 else f"{titulo} {n:02d}", "descricao": DESCRICAO,
            "tipo_lancamento": tipo or l["tipo"], "codigo_centro_de_custo": centro, "numero_conta": CONTA,
            "codigo_item_despesa": codigo_item(item), "codigo_fonte_recurso": None, "id_forma_pagamento": None,
            "num_parcelas": None, "data_inicial": dt, "dias_intervalo": None, "valor": l["valor"], "observacoes": OBS,
            "id_lancamento_grupo": None, "status_pagamento": STATUS, "data_liquidacao": dt, "banco_liquidacao": CONTA,
            # extras para a tela (não vão para o CSV)
            "origem": l["descricao"], "linha": l["linha"], "revisar": not ok})
    return saida


def pendentes(linhas: list[dict]) -> list[str]:
    """Descrições (sem repetir) que nenhuma regra reconheceu."""
    return list(dict.fromkeys(l["origem"] for l in linhas if l["revisar"]))


def para_csv(linhas: list[dict]) -> str:
    def fmt(v):
        if v is None:
            return ""
        if isinstance(v, date):
            return v.strftime("%d/%m/%Y")
        if isinstance(v, float):
            return f"{v:.2f}".replace(".", ",")
        return v
    buf = io.StringIO()
    w = csv.writer(buf, delimiter=";", lineterminator="\r\n")
    w.writerow(COLUNAS)
    for l in linhas:
        w.writerow([fmt(l[c]) for c in COLUNAS])
    return buf.getvalue()
