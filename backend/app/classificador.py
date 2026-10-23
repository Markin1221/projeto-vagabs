"""Classificador do extrato do DDATA Sol (base): regra explícita → já preenchido no Sol → heurísticas simples
→ manual. O aprendizado por histórico (padrões/favorecidos) do script antigo ainda não foi trazido."""
import io

import pandas as pd
from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import RegraClassificacao

COLS = ["data", "banco", "origem", "tipo", "titulo", "descricao", "centro", "item", "fonte", "valor", "saldo", "obs"]
_TEXTO = ["data", "banco", "origem", "tipo", "titulo", "descricao", "centro", "item", "fonte", "obs"]
ITEM_TRANSF = "521 - TRANSFERÊNCIAS ENTRE BANCOS"
ITEM_FORNECEDOR = "520 - FORNECEDORES A PAGAR DDA"
CENTRO_PADRAO = "CTPAS - CONTAS DE PASSAGENS"


def _limpa(v):
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return None
    s = str(v).strip()
    return None if s in ("", "—", "nan") else s


def ler_extrato_sol(conteudo: bytes) -> pd.DataFrame:
    """xlsx do Sol: título na linha 1, cabeçalho na 2, colunas B:M."""
    df = pd.read_excel(io.BytesIO(conteudo), header=1, usecols="B:M", dtype=object)
    if df.shape[1] != len(COLS):
        raise ValueError("O arquivo não parece o extrato do Sol (esperava as colunas B a M).")
    df.columns = COLS
    df["linha_origem"] = df.index + 3
    for c in _TEXTO:
        df[c] = df[c].map(_limpa).astype(object)
    df["valor"] = pd.to_numeric(df["valor"], errors="coerce")
    return df[df["tipo"].notna() | df["titulo"].notna()].reset_index(drop=True)


def _casar(regras, texto, tipo):
    t = (texto or "").upper()
    nat = "DEBITO" if (tipo or "").upper().startswith("DEB") or (tipo or "").upper().startswith("DÉB") else "CREDITO"
    for r in regras:
        if r.kw.upper() in t and (r.nat is None or r.nat == nat):
            return r
    return None


def classificar(db: Session, df: pd.DataFrame) -> list[dict]:
    regras = db.scalars(select(RegraClassificacao).order_by(RegraClassificacao.id)).all()
    saida = []
    for _, l in df.iterrows():
        l = l.where(l.notna(), None)  # NaN do pandas vira None (NaN é "verdadeiro" em um if)
        titulo, desc = l["titulo"] or "", l["descricao"] or ""
        linha = {"linha_origem": int(l["linha_origem"]), "data": l["data"], "tipo": l["tipo"], "origem": l["origem"],
                 "titulo": titulo, "descricao": desc, "valor": None if l["valor"] is None else float(l["valor"]),
                 "centro": None, "item": None, "fonte": None, "forma": None, "titulo_sugerido": None,
                 "como": "manual", "regra_id": None, "regra_kw": None}
        r = _casar(regras, f"{titulo} {desc}", l["tipo"])
        if r:
            linha.update(centro=r.centro or None, item=r.item or None, fonte=r.fonte or l["fonte"], forma=r.forma or None,
                         titulo_sugerido=r.titulo or None, como="regra", regra_id=r.id, regra_kw=r.kw)
        elif l["item"]:
            linha.update(centro=l["centro"], item=l["item"], fonte=l["fonte"], como="sol")
        elif l["origem"] == "Transferência":
            linha.update(item=ITEM_TRANSF, como="heuristica")
        elif "BOLETO" in f"{titulo} {desc}".upper() and (l["tipo"] or "").upper().startswith("DEB"):
            linha.update(centro=CENTRO_PADRAO, item=ITEM_FORNECEDOR, como="heuristica")
        saida.append(linha)
    return saida


def resumo(linhas: list[dict]) -> dict:
    r = {"total": len(linhas), "regra": 0, "sol": 0, "heuristica": 0, "manual": 0}
    for l in linhas:
        r[l["como"]] += 1
    return r


def para_xlsx(linhas: list[dict]) -> bytes:
    df = pd.DataFrame(linhas).drop(columns=["regra_id"], errors="ignore").rename(columns={
        "linha_origem": "Linha no Sol", "data": "Data", "tipo": "Tipo", "origem": "Origem", "titulo": "Título",
        "descricao": "Descrição", "valor": "Valor", "centro": "Centro de custo", "item": "Item de despesa",
        "fonte": "Fonte de recurso", "forma": "Forma de pagamento", "titulo_sugerido": "Título sugerido",
        "como": "Classificado por", "regra_kw": "Regra"})
    buf = io.BytesIO()
    with pd.ExcelWriter(buf) as w:
        df.to_excel(w, sheet_name="Classificação", index=False)
    return buf.getvalue()
