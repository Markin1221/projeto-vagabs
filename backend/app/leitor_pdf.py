"""Leitura do PDF "Resumo Geral" da folha (pdfplumber, por coordenadas das palavras).

Adaptado do legado (legado/Appresumofolha.py), sem Excel/PyQt. Localiza as partes pelo CONTEÚDO, não pelo
número da página, então serve para os vários layouts (Oficina em 3 páginas, Coleta, Sócios...)."""
import re
import unicodedata
from datetime import datetime

import pandas as pd
import pdfplumber

NUM = re.compile(r"^\d{1,3}(\.\d{3})*,\d{2}$|^\d+$")
NUM_BR = re.compile(r"^\d{1,3}(\.\d{3})*,\d{2}$")
PERIODO = r"\d{2}/\d{2}/\d{2} a \d{2}/\d{2}/\d{2}"


def br_para_float(txt):
    """'54.244,65' -> 54244.65 ; '' -> None"""
    if txt is None or str(txt).strip() == "":
        return None
    return float(str(txt).replace(".", "").replace(",", "."))


def agrupar_linhas(words, tol=3):
    """Agrupa palavras na mesma linha (por 'top') e ordena da esquerda p/ direita."""
    linhas = []
    for w in sorted(words, key=lambda w: w["top"]):
        if linhas and abs(linhas[-1][0] - w["top"]) <= tol:
            linhas[-1][1].append(w)
        else:
            linhas.append([w["top"], [w]])
    return [sorted(l[1], key=lambda w: w["x0"]) for l in linhas]


# ---------- Localização das partes (por conteúdo, não por página) ----------
def y_blocos(words):
    """Topo da faixa GPS/FGTS/DARF (título 'DARF PIS'); None se a página não tem."""
    for i, w in enumerate(words[:-1]):
        if w["text"] == "DARF" and words[i + 1]["text"] == "PIS":
            return w["top"] - 2
    return None


# ---------- Tabela de adicionais / descontos ----------
def ler_tabela(page):
    """Colunas de valores vêm dos títulos (Ativos/Demitidos/... ou Sócios/Autônomos)."""
    words = page.extract_words()
    y_fim = y_blocos(words) or page.height
    linhas_pdf = agrupar_linhas([w for w in words if w["top"] < y_fim])

    pos = next((i for i, l in enumerate(linhas_pdf) if l[0]["text"] == "ADICIONAIS"), None)
    if pos is None:
        return None
    cab = linhas_pdf[pos]
    idx = next((i for i, w in enumerate(cab) if w["text"] == "DESCONTOS"), None)
    if idx is None:
        return None

    resto, x_col, k = cab[idx + 1:], {}, 0
    while k < len(resto):
        if resto[k]["text"] == "Valores" and k + 1 < len(resto):  # "Valores Sócios"
            x_col[resto[k + 1]["text"].capitalize()] = resto[k + 1]["x1"]
            k += 2
        else:
            x_col[resto[k]["text"].capitalize()] = resto[k]["x1"]
            k += 1
    if not x_col:
        return None

    linhas, tipo = [], "Adicional"
    for lin in linhas_pdf[pos + 1:]:
        textos = [w["text"] for w in lin]
        if not any(NUM.match(t) for t in textos):
            continue
        codigo = textos[0] if re.fullmatch(r"\d{3}", textos[0]) else ""
        valores = {c: None for c in x_col}
        nome = []
        for w in lin[1 if codigo else 0:]:
            col = min(x_col, key=lambda c: abs(x_col[c] - w["x1"]))
            if NUM.match(w["text"]) and abs(x_col[col] - w["x1"]) < 25:
                valores[col] = br_para_float(w["text"])
            else:
                nome.append(w["text"])
        nome = " ".join(nome)
        eh_total_grupo = nome.startswith("TOTAL DE ADICIONAIS") or nome.startswith("TOTAL DE DESCONTOS")
        linhas.append({"Tipo": tipo if (codigo or eh_total_grupo) else "",
                       "Código": codigo, "Nome": nome, **valores})
        if nome.startswith("TOTAL DE ADICIONAIS"):
            tipo = "Desconto"
    return pd.DataFrame(linhas)


# ---------- Blocos GPS / FGTS / DARF PIS ----------
def ler_bloco(page, x0, x1, y0, y1, secao_inicial=""):
    """Lê um bloco 'Nome : valor'. Linha sem valor vira cabeçalho de seção."""
    area = page.crop((x0, y0, x1, y1))
    dados, secao = [], secao_inicial
    for lin in agrupar_linhas(area.extract_words()):
        textos = [w["text"] for w in lin]
        if len(textos) > 1 and NUM_BR.match(textos[-1]):
            nome = " ".join(textos[:-1]).strip().rstrip(":").strip()
            nome = re.sub(r"=(\S)", r"= \1", nome)
            dados.append({"Seção": secao, "Nome": nome, "Valor": br_para_float(textos[-1])})
        else:
            secao = " ".join(textos)
    return pd.DataFrame(dados)


def ler_blocos(page):
    words = page.extract_words()
    y0 = y_blocos(words)
    if y0 is None:
        return None
    larg = page.width

    # fim da faixa: antes de "INFORMAÇÕES AUXILIARES"
    y1 = next((w["top"] - 2 for w in words if w["text"].upper().startswith("AUXILIARES")), page.height)

    # início do FGTS = primeira palavra "BASES"; início do DARF PIS = "Base" seguido de "PIS"
    x_fgts = next((w["x0"] for w in words if w["text"] == "BASES" and w["top"] > y0), larg / 3) - 3
    x_darf = larg * 2 / 3
    for i, w in enumerate(words[:-1]):
        if w["text"] == "Base" and words[i + 1]["text"] == "PIS" and w["top"] > y0:
            x_darf = w["x0"] - 3
            break

    gps = ler_bloco(page, 0, x_fgts, y0, y1)
    fgts = ler_bloco(page, x_fgts, x_darf, y0, y1)
    darf = ler_bloco(page, x_darf, larg, y0, y1)
    return {
        "GPS": gps[["Nome", "Valor"]],
        "FGTS": fgts[fgts["Seção"] != "F G T S"].reset_index(drop=True),
        "DARF PIS": darf.reset_index(drop=True),
    }


# ---------- Férias (só existe em alguns relatórios) ----------
def ler_ferias(page):
    padrao = re.compile(
        rf"^(\d{{6}})\s+(.+?)\s+(\d{{1,3}}(?:\.\d{{3}})*,\d{{2}})\s+(\d{{2}}/\d{{2}}/\d{{2}})\s+({PERIODO})\s+({PERIODO})"
    )
    dados = []
    for linha in (page.extract_text() or "").splitlines():
        m = padrao.match(linha.strip())
        if m:
            dados.append({
                "Código": m.group(1), "Funcionário": m.group(2),
                "Valor líquido": br_para_float(m.group(3)), "Data pagamento": m.group(4),
                "Período de férias": m.group(5), "Período aquisitivo": m.group(6),
            })
    return pd.DataFrame(dados)


# ---------- Validação ----------
def validar(df1):
    avisos = []
    cols = [c for c in df1.columns if c not in ("Tipo", "Código", "Nome")]
    itens = df1[df1["Código"] != ""]

    def total(nome):
        r = df1[df1["Nome"] == nome]
        return r.iloc[0] if not r.empty else None

    t_adic, t_desc, liq = total("TOTAL DE ADICIONAIS"), total("TOTAL DE DESCONTOS"), total("TOTAL LÍQUIDO A PAGAR")
    for col in cols:
        s_adic = itens[itens["Tipo"] == "Adicional"][col].fillna(0).sum()
        s_desc = itens[itens["Tipo"] == "Desconto"][col].fillna(0).sum()
        if t_adic is not None and pd.notna(t_adic[col]) and abs(s_adic - t_adic[col]) > 0.01:
            avisos.append(f"{col}: soma dos adicionais ({s_adic:.2f}) difere do total ({t_adic[col]})")
        if t_desc is not None and pd.notna(t_desc[col]) and abs(s_desc - t_desc[col]) > 0.01:
            avisos.append(f"{col}: soma dos descontos ({s_desc:.2f}) difere do total ({t_desc[col]})")
        if liq is not None and pd.notna(liq[col]) and abs(s_adic - s_desc - liq[col]) > 0.01:
            avisos.append(f"{col}: adicionais - descontos ({s_adic - s_desc:.2f}) difere do líquido ({liq[col]})")
    return avisos




MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho",
         "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"]


def norm(s) -> str:
    """Normaliza para comparar nomes: sem acento, minúsculo, espaços únicos."""
    s = unicodedata.normalize("NFD", str(s).casefold())
    return re.sub(r"\s+", " ", "".join(c for c in s if unicodedata.category(c) != "Mn")).strip()


def ler_cabecalho(pdf_path):
    """(data_inicio, data_fim, nome_do_departamento) lidos do cabeçalho do relatório."""
    with pdfplumber.open(pdf_path) as pdf:
        texto = pdf.pages[0].extract_text() or ""
    m = re.search(r"Per.odo\s*:\s*(\d{2}/\d{2}/\d{4})\s+a\s+(\d{2}/\d{2}/\d{4})", texto)
    d = re.search(r"Departamento\s*:\s*(?:\d+\s+)?(.+)", texto)
    if not m or not d:
        raise ValueError("Não achei Período/Departamento no cabeçalho do PDF")
    ini, fim = (datetime.strptime(x, "%d/%m/%Y") for x in m.groups())
    return ini, fim, d.group(1).strip()


def ler_pdf(pdf_path):
    """Devolve (cabecalho, df_resumo, blocos, avisos). Levanta ValueError se não for o Resumo Geral."""
    ini, fim, depto = ler_cabecalho(pdf_path)
    df1 = blocos = None
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            if df1 is None:
                df1 = ler_tabela(page)
            if blocos is None:
                blocos = ler_blocos(page)
    if df1 is None or blocos is None:
        raise ValueError("Não encontrei a tabela de adicionais/descontos ou os blocos GPS/FGTS/DARF PIS")
    avisos = validar(df1)
    # nomes iguais aos do cadastro: tira o "Parc. 6/48" do empréstimo
    df1["Nome"] = df1["Nome"].str.replace(r"\s+Parc\.\s*\d+/\d+\s*$", "", regex=True)
    return {"inicio": ini, "fim": fim, "departamento": depto}, df1, blocos, avisos
