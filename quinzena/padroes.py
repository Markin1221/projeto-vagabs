"""Padrões de título e favorecidos aprendidos do histórico já classificado."""
import re
from collections import Counter, defaultdict

_PREFIXO = re.compile(
    r"^(TRANSFER[ÊE]NCIA (ENVIADA|RECEBIDA)|PIX - (ENVIADO|RECEBIDO)|PAGAMENTO DE BOLETO)\s*-\s*")
_DATAHORA = re.compile(r"^\d{2}/\d{2}(\s+\d{2}:\d{2})?\s*")
_DOC = re.compile(r"(?<!\d)\d{11,15}(?!\d)")


def normalizar_titulo(titulo) -> str:
    return re.sub(r"\s+", " ", re.sub(r"\d+", "#", str(titulo or ""))).strip().upper()


def aprender_padroes(df, consistencia: float = 0.95, min_amostras: int = 3) -> dict:
    ok = df[df["item"].notna() & df["titulo"].notna()]
    grupos = defaultdict(list)
    for t, c, i, f in zip(ok["titulo"], ok["centro"], ok["item"], ok["fonte"]):
        grupos[normalizar_titulo(t)].append((c, i, f))
    out = {}
    for pad, obs in grupos.items():
        (melhor, n), = Counter(obs).most_common(1)
        if len(obs) >= min_amostras and n / len(obs) >= consistencia:
            out[pad] = melhor
    return out


def extrair_favorecido(descricao):
    """Devolve (documento, nome) a partir da Descrição do extrato."""
    if not descricao:
        return None, None
    up = str(descricao).upper().strip()
    m = _DOC.search(up)
    if m:
        nome = up[m.end():].strip(" -")
        return m.group(0), (nome or None)
    resto = _PREFIXO.sub("", up)
    resto = _DATAHORA.sub("", resto).strip(" -")
    return None, (resto or None)


def chave_favorecido(descricao):
    doc, nome = extrair_favorecido(descricao)
    return doc or nome


def aprender_favorecidos(df) -> dict:
    out = defaultdict(list)
    deb = df[(df["tipo"] == "Debito") & df["item"].notna() & df["valor"].notna()]
    for d, i, v in zip(deb["descricao"], deb["item"], deb["valor"]):
        k = chave_favorecido(d)
        if k:
            out[k].append((abs(float(v)), i))
    return dict(out)
