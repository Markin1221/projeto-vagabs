"""Classificação em cascata: regra → Sol → favorecido → heurística → padrão → MANUAL."""
import re
from dataclasses import dataclass
from typing import Optional

import pandas as pd

from .padroes import chave_favorecido, extrair_favorecido, normalizar_titulo
from .regras import casar_regra

ITEM_REPASSE = "522 - REPASSE AO PERMISSIONÁRIO"
ITEM_FORNECEDOR = "520 - FORNECEDORES A PAGAR DDA"
ITEM_TRANSF = "521 - TRANSFERÊNCIAS ENTRE BANCOS"
CENTRO_PADRAO = "CTPAS - CONTAS DE PASSAGENS"
TOLERANCIA = 0.25  # faixa de valor em torno do histórico do favorecido


@dataclass
class Sugestao:
    centro: Optional[str]
    item: Optional[str]
    fonte: Optional[str]
    origem_regra: str
    manual: bool


MANUAL = Sugestao(None, None, None, "manual", True)


def _item_por_valor(obs, a):
    faixas = {}
    for v, i in obs:
        lo, hi = faixas.get(i, (v, v))
        faixas[i] = (min(lo, v), max(hi, v))
    dentro = [i for i, (lo, hi) in faixas.items() if lo * (1 - TOLERANCIA) <= a <= hi * (1 + TOLERANCIA)]
    if len(dentro) == 1:
        return dentro[0]
    if len(dentro) > 1:
        return None
    if a > max(hi for _, hi in faixas.values()):
        return max(faixas, key=lambda i: faixas[i][1])
    if a < min(lo for lo, _ in faixas.values()):
        return min(faixas, key=lambda i: faixas[i][0])
    return None  # entre faixas: ambíguo


def _t(v):
    """Texto ou None (NaN do pandas vira None)."""
    return None if v is None or (isinstance(v, float) and pd.isna(v)) else v


def classificar_linha(linha, regras, padroes, favorecidos, config) -> Sugestao:
    linha = {k: (v if k == "valor" else _t(v)) for k, v in linha.items()}
    valor = linha["valor"]
    if pd.isna(valor) or valor == 0:
        return MANUAL
    if linha["origem"] == "Transferência":
        return Sugestao(None, ITEM_TRANSF, None, "manual", True)
    titulo, desc = linha["titulo"] or "", linha["descricao"] or ""
    r = casar_regra(regras, f"{titulo} {desc}")
    if r:
        return Sugestao(r.centro, r.item, linha["fonte"], "regra", False)
    if linha["item"]:
        return Sugestao(linha["centro"], linha["item"], linha["fonte"], "sol", False)
    a = abs(float(valor))
    if linha["tipo"] == "Debito":
        obs = favorecidos.get(chave_favorecido(desc))
        if obs:
            item = _item_por_valor(obs, a)
            if item:
                return Sugestao(CENTRO_PADRAO, item, None, "favorecido", False)
            return MANUAL
        _, nome = extrair_favorecido(desc)
        if nome and a >= config.get("limiar_valor_alto", 5000) and any(
                re.search(p, nome) for p in config.get("palavras_transporte", [])):
            return Sugestao(CENTRO_PADRAO, ITEM_REPASSE, None, "heuristica", False)
        if "BOLETO" in f"{titulo} {desc}".upper():
            return Sugestao(CENTRO_PADRAO, ITEM_FORNECEDOR, None, "heuristica", False)
    p = padroes.get(normalizar_titulo(titulo)) if titulo else None
    if p:
        return Sugestao(p[0], p[1], p[2], "historico", False)
    return MANUAL


def classificar(df, regras, padroes, favorecidos, config) -> pd.DataFrame:
    sugs = [classificar_linha(r, regras, padroes, favorecidos, config) for _, r in df.iterrows()]
    out = df.copy()
    out["sug_centro"] = [s.centro for s in sugs]
    out["sug_item"] = [s.item for s in sugs]
    out["sug_fonte"] = [s.fonte for s in sugs]
    out["origem_regra"] = [s.origem_regra for s in sugs]
    out["manual"] = [s.manual for s in sugs]
    return out
