"""Guias de recolhimento (FGTS Digital, e depois INSS/DCTFWeb...) conferidas contra a soma das folhas enviadas.

Para suportar uma guia nova basta acrescentar um item em TIPOS:
- `detectar`: texto que só aparece nessa guia;
- `campos`: valor da guia -> expressão regular que captura o número (formato 1.234,56), ou, nos DARF,
  uma lista de códigos de receita [(código, subcódigo ou None)] cujos totais são somados;
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
    {
        "id": "inss",
        "nome": "DARF do INSS (DCTFWeb)",
        "detectar": "Documento de Arrecadação de Receitas Federais",
        "exigir": "CONTR PREV",  # DARF da previdência (não um DARF qualquer)
        "competencia": r"PA:\s*(\d{2})/(\d{4})",
        "campos": {
            "empregados": [("1082", None)],
            "contrib_individual": [("1099", None)],
            "patronal_empregados": [("1138", "01")],
            "patronal_ci": [("1138", "04")],
            "rat": [("1646", None)],
            "terceiros": [("1170", None), ("1176", None), ("1200", None), ("1225", None)],
            "pis": [("8301", None)],
            "total": r"Valor Total do Documento\s*" + NUM,
        },
        "comparacoes": [
            # salário-família (Deduções de FPAS) é abatido do INSS dos empregados na DCTFWeb
            {"nome": "INSS descontado dos empregados (1082)", "campo": "empregados",
             "folha": [("Empregados", "gps"), ("Deduções de FPAS", "gps", "-")]},
            {"nome": "INSS dos contribuintes individuais (1099)", "campo": "contrib_individual",
             "folha": [("Sócios", "gps"), ("Autônomos", "gps")]},
            {"nome": "Patronal sobre empregados (1138-01)", "campo": "patronal_empregados",
             "folha": [("Empresa Funcionários", "gps")]},
            {"nome": "Patronal sobre contribuintes individuais (1138-04)", "campo": "patronal_ci",
             "folha": [("Empresa Sócios", "gps"), ("Empresa Autônomos", "gps")]},
            {"nome": "RAT / GILRAT (1646)", "campo": "rat", "folha": [("RAT Emp", "gps")]},
            {"nome": "Terceiros (1170 + 1176 + 1200 + 1225)", "campo": "terceiros", "folha": [("Terceiros 5,80 %", "gps")]},
            {"nome": "PIS sobre a folha (8301)", "campo": "pis", "folha": [("PIS Folha", "darf")]},
            {"nome": "Total da guia", "campo": "total", "folha": [("Total Líquido", "gps"), ("PIS Folha", "darf")]},
        ],
    },
]


def itens_darf(texto: str) -> list[dict]:
    """Linhas da 'Composição do Documento de Arrecadação': código de 4 dígitos, denominação e valores;
    a linha seguinte começa com o subcódigo de 2 dígitos. O último valor da linha é o total."""
    linhas = texto.splitlines()
    itens = []
    for i, l in enumerate(linhas):
        m = re.match(r"^(\d{4})\s+(.+?)\s+((?:-?\d{1,3}(?:\.\d{3})*,\d{2}\s*)+)$", l.strip())
        if not m:
            continue
        valores = re.findall(r"-?\d{1,3}(?:\.\d{3})*,\d{2}", m.group(3))
        sub = re.match(r"^(\d{2})\s", linhas[i + 1].strip()) if i + 1 < len(linhas) else None
        itens.append({"codigo": m.group(1), "sub": sub.group(1) if sub else None, "denominacao": m.group(2),
                      "total": br(valores[-1])})
    return itens


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
        if norm(t["detectar"]) not in norm(texto) or (t.get("exigir") and norm(t["exigir"]) not in norm(texto)):
            continue
        valores, itens = {}, None
        for campo, regra in t["campos"].items():
            if isinstance(regra, str):
                m = re.search(regra, texto, re.I)
                valores[campo] = br(m.group(1)) if m else None
            else:
                itens = itens if itens is not None else itens_darf(texto)
                achados = [it["total"] for it in itens for cod, sub in regra
                           if it["codigo"] == cod and (sub is None or it["sub"] == sub)]
                valores[campo] = round(sum(achados), 2) if achados else 0.0
        comp = re.search(t.get("competencia", r"\b(0[1-9]|1[0-2])/(20\d{2})\b(?=\s+(?:\d+\s|MENSAL))"), texto)
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
            for nome, origem, *sinal in c["folha"]:
                fator = -1 if sinal and sinal[0] == "-" else 1
                reg = f["fontes"].get((norm(nome), origem))
                if reg is None:  # nome que muda com o mês (ex.: 'RAT Emp (RAT x FAP = 5,0721 %)'): pelo começo
                    reg = next((v for k, v in f["fontes"].items()
                                if isinstance(k, tuple) and k[1] == origem and k[0].startswith(norm(nome))), None)
                valor += fator * ((reg or {}).get("Total") or 0.0)
            composicao.append({"nome": f["departamento"], "arquivo": f["arquivo"], "valor": round(valor, 2)})
        soma = round(sum(p["valor"] for p in composicao), 2)
        na_guia = guia["valores"].get(c["campo"])
        dif = None if na_guia is None else round(soma - na_guia, 2)
        saida.append({"nome": c["nome"], "guia": na_guia, "folhas": soma, "diferenca": dif,
                      "ok": dif is not None and abs(dif) <= 0.01, "composicao": composicao,
                      "de_onde": " ".join((("− " if len(x) > 2 and x[2] == "-" else "+ ") + x[0]) for x in c["folha"]).lstrip("+ ")})
    return saida
