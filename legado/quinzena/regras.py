"""Regras explícitas (formato do regras.json do repositório)."""
import json
import os
from dataclasses import dataclass, asdict


@dataclass
class Regra:
    kw: str
    centro: str
    item: str
    forma: str = ""
    titulo: str = ""


def _ler(caminho):
    if not os.path.exists(caminho) or os.path.getsize(caminho) == 0:
        return []
    try:
        with open(caminho, encoding="utf-8") as f:
            dados = json.load(f)
    except json.JSONDecodeError:
        return []
    return dados if isinstance(dados, list) else []


def carregar_regras(caminho: str) -> list:
    vistos, out = set(), []
    for d in _ler(caminho):
        kw = str(d.get("kw", "")).strip()
        if not kw or kw.upper() in vistos:
            continue
        vistos.add(kw.upper())
        out.append(Regra(kw, d.get("centro", ""), d.get("item", ""), d.get("forma", ""), d.get("titulo", "")))
    return out


def casar_regra(regras: list, texto: str):
    t = (texto or "").upper()
    for r in regras:
        if r.kw.upper() in t:
            return r
    return None


def salvar_regra(caminho: str, regra: Regra) -> None:
    dados = _ler(caminho)
    if any(str(d.get("kw", "")).upper() == regra.kw.upper() for d in dados):
        return
    dados.append(asdict(regra))
    with open(caminho, "w", encoding="utf-8") as f:
        json.dump(dados, f, ensure_ascii=False, indent=2)
