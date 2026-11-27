"""Relatório Orçado x Realizado (.xlsx): lê os eventos para a tela de visualização (/orcamento).

A planilha tem um cabeçalho "Código | Evento | Orçado (R$) | Realizado (R$) | Diferença (R$) | % | Crédito (R$)" e uma
linha "Totais" no fim. As colunas são achadas pelo nome do cabeçalho, então a ordem pode mudar. Diferença e % são
recalculadas a partir de Orçado e Realizado (não dependem das fórmulas da planilha).
"""
import io
import re
import unicodedata

from openpyxl import load_workbook

# Grupos pela faixa do código do evento (só para agrupar nos gráficos).
GRUPOS = [
    (0, 69, "Despesas gerais"),
    (70, 99, "Pessoal"),
    (500, 599, "Contas a pagar"),
]
OUTROS = "Outros"


def _norm(v) -> str:
    s = unicodedata.normalize("NFKD", str(v or "")).encode("ascii", "ignore").decode().lower()
    return re.sub(r"\s+", " ", s).strip()


def _num(v) -> float:
    if v is None or v == "":
        return 0.0
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v).strip().replace("R$", "").replace(" ", "")
    if "," in s:
        s = s.replace(".", "").replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return 0.0


def grupo(codigo: str) -> str:
    m = re.match(r"\d+", codigo or "")
    if not m:
        return OUTROS
    n = int(m.group())
    return next((nome for a, b, nome in GRUPOS if a <= n <= b), OUTROS)


def situacao(orcado: float, realizado: float) -> str:
    """estourou | dentro | sem_orcamento | nao_usado | zerado"""
    if orcado > 0 and realizado > orcado + 0.005:
        return "estourou"
    if orcado > 0 and realizado > 0:
        return "dentro"
    if orcado <= 0 and realizado > 0:
        return "sem_orcamento"
    if orcado > 0:
        return "nao_usado"
    return "zerado"


def _achar_cabecalho(ws):
    for row in ws.iter_rows(max_row=40):
        nomes = {_norm(c.value): c.column for c in row if c.value is not None}
        orc = next((col for n, col in nomes.items() if n.startswith("orcado")), None)
        rea = next((col for n, col in nomes.items() if n.startswith("realizado")), None)
        if orc and rea:
            ev = next((col for n, col in nomes.items() if n.startswith("evento") or n.startswith("descri")), None)
            cod = next((col for n, col in nomes.items() if n.startswith("codigo") or n == "cod"), None)
            cred = next((col for n, col in nomes.items() if n.startswith("credito")), None)
            return row[0].row, {"codigo": cod, "evento": ev, "orcado": orc, "realizado": rea, "credito": cred}
    raise ValueError("Não achei o cabeçalho com as colunas 'Orçado' e 'Realizado'.")


def ler(conteudo: bytes) -> dict:
    ws = load_workbook(io.BytesIO(conteudo), data_only=True).active
    r0, col = _achar_cabecalho(ws)
    titulo = next((str(c.value).strip() for row in ws.iter_rows(max_row=r0 - 1) for c in row
                   if isinstance(c.value, str) and c.value.strip()), "Relatório Orçado x Realizado")
    pega = lambda r, k: ws.cell(r, col[k]).value if col[k] else None
    eventos, credito_sem_item, vazias = [], 0.0, 0
    for r in range(r0 + 1, ws.max_row + 1):
        cod, ev = pega(r, "codigo"), pega(r, "evento")
        if cod is None and ev is None:
            vazias += 1
            if vazias > 5:
                break
            continue
        vazias = 0
        if _norm(cod) .startswith("tota") or _norm(ev).startswith("tota"):
            break
        orcado, realizado = round(_num(pega(r, "orcado")), 2), round(_num(pega(r, "realizado")), 2)
        credito = round(_num(pega(r, "credito")), 2)
        codigo = str(cod).strip() if cod is not None else ""
        if codigo.isdigit() and len(codigo) < 3:
            codigo = codigo.zfill(3)
        nome = str(ev or "").strip()
        nome = re.sub(rf"^{re.escape(codigo)}\s*-\s*", "", nome) if codigo else nome
        if not codigo and orcado == 0 and realizado == 0:  # "(Sem item)": só crédito
            credito_sem_item += credito
            continue
        eventos.append({
            "codigo": codigo, "nome": nome or "(sem nome)", "grupo": grupo(codigo),
            "orcado": orcado, "realizado": realizado, "diferenca": round(orcado - realizado, 2),
            "pct": round(realizado / orcado * 100, 2) if orcado > 0 else None,
            "credito": credito, "situacao": situacao(orcado, realizado),
        })
    if not eventos:
        raise ValueError("Não encontrei eventos com valores abaixo do cabeçalho.")
    t_orc = round(sum(e["orcado"] for e in eventos), 2)
    t_rea = round(sum(e["realizado"] for e in eventos), 2)
    totais = {
        "orcado": t_orc, "realizado": t_rea, "diferenca": round(t_orc - t_rea, 2),
        "pct": round(t_rea / t_orc * 100, 2) if t_orc else None,
        "credito": round(sum(e["credito"] for e in eventos) + credito_sem_item, 2),
        "credito_sem_item": round(credito_sem_item, 2),
    }
    return {"titulo": titulo, "eventos": eventos, "totais": totais}
