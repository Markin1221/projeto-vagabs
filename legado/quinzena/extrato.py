"""Leitura e normalização do extrato do DDATA SOL."""
import pandas as pd

COLS = ["data", "banco", "origem", "tipo", "titulo", "descricao", "centro",
        "item", "fonte", "valor", "saldo", "obs"]
_TEXTO = ["data", "banco", "origem", "tipo", "titulo", "descricao", "centro", "item", "fonte", "obs"]


def _limpa(v):
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return None
    s = str(v).strip()
    return None if s in ("", "—", "nan") else s


def carregar_extrato(caminho: str) -> pd.DataFrame:
    """Lê o xlsx do Sol (título na linha 1, cabeçalho na 2, colunas B:M)."""
    df = pd.read_excel(caminho, header=1, usecols="B:M", dtype=object)
    df.columns = COLS
    df["linha_origem"] = df.index + 3
    for c in _TEXTO:
        df[c] = df[c].map(_limpa).astype(object)
    df["valor"] = pd.to_numeric(df["valor"], errors="coerce")
    df = df[df["tipo"].notna() | df["titulo"].notna()].reset_index(drop=True)
    return df
