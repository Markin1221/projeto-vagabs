"""Guias de recolhimento (FGTS Digital, e depois INSS/DCTFWeb...) conferidas contra a soma das folhas enviadas.

Para suportar uma guia nova basta acrescentar um item em TIPOS:
- `detectar`: texto que só aparece nessa guia;
- `campos`: valor da guia -> expressão regular que captura o número (formato 1.234,56);
- `comparacoes`: cada uma diz qual campo da guia confere com a soma de quais valores das folhas
  (nome como aparece no PDF da folha + bloco onde ele está: resumo, gps, fgts ou darf)."""
import io
import re

import pdfplumber

from .leitor_pdf import norm

NUM = r"(-?\d{1,3}(?:\.\d{3})*,\d{2})"

TIPOS = [
    {
        "id": "fgts",
        "nome": "Guia do FGTS Digital (GFD)",
        "detectar": "GFD - Guia do FGTS Digital",
        "campos": {
            "fgts": r"Total FGTS:\s*" + NUM,
            "consignado": r"Total Consignado:\s*" + NUM,
            "total": r"Total da Guia:\s*" + NUM,
        },
        "comparacoes": [
            {"nome": "FGTS", "campo": "fgts", "folha": [("Total FGTS apurado recibos s/CS", "fgts")]},
            {"nome": "Consignado (empréstimo do trabalhador)", "campo": "consignado",
             "folha": [("Total de Empréstimo no mês", "fgts")]},
        ],
    },
]


def br(txt: str) -> float:
    return float(txt.replace(".", "").replace(",", "."))


def ler_guia(conteudo: bytes) -> dict | None:
    """Se o PDF for uma guia conhecida, devolve {tipo, nome, competencia, valores}; senão None."""
    try:
        with pdfplumber.open(io.BytesIO(conteudo)) as pdf:
            texto = "\n".join((p.extract_text() or "") for p in pdf.pages[:3])
    except Exception:
        return None
    for t in TIPOS:
        if norm(t["detectar"]) not in norm(texto):
            continue
        valores = {}
        for campo, rx in t["campos"].items():
            m = re.search(rx, texto, re.I)
            valores[campo] = br(m.group(1)) if m else None
        comp = re.search(r"\b(0[1-9]|1[0-2])/(20\d{2})\b(?=\s+(?:\d+\s|MENSAL))", texto)
        return {"tipo": t["id"], "nome": t["nome"], "competencia": f"{comp.group(1)}/{comp.group(2)}" if comp else None,
                "valores": valores}
    return None


def conferir(guia: dict, folhas: list[dict]) -> list[dict]:
    """`folhas`: [{arquivo, departamento, competencia, fontes}]. Uma conferência por comparação do tipo da guia."""
    tipo = next(t for t in TIPOS if t["id"] == guia["tipo"])
    saida = []
    for c in tipo["comparacoes"]:
        composicao = []
        for f in folhas:
            valor = 0.0
            for nome, origem in c["folha"]:
                reg = f["fontes"].get((norm(nome), origem)) or {}
                valor += reg.get("Total") or 0.0
            composicao.append({"nome": f["departamento"], "arquivo": f["arquivo"], "valor": round(valor, 2)})
        soma = round(sum(p["valor"] for p in composicao), 2)
        na_guia = guia["valores"].get(c["campo"])
        dif = None if na_guia is None else round(soma - na_guia, 2)
        saida.append({"nome": c["nome"], "guia": na_guia, "folhas": soma, "diferenca": dif,
                      "ok": dif is not None and abs(dif) <= 0.01, "composicao": composicao,
                      "de_onde": " + ".join(n for n, _ in c["folha"])})
    return saida
