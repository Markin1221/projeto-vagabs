import io
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
def _secao_tabela(cab, linhas_pdf):
    """Lê uma tabela (cabeçalho 'ADICIONAIS / DESCONTOS ...' + linhas) -> DataFrame, ou None."""
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
    for lin in linhas_pdf:
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


def ler_tabela(page):
    """Colunas de valores vêm dos títulos (Ativos/Demitidos/... ou Sócios/Autônomos). O PDF dos Sócios pode trazer
    duas tabelas (funcionários e sócios/autônomos): as duas entram, com a coluna 'Parte'; os totais da tabela dos
    funcionários ganham o sufixo ' FUNCIONARIOS' para não se confundirem com os dos sócios."""
    words = page.extract_words()
    y_fim = y_blocos(words) or page.height
    linhas_pdf = agrupar_linhas([w for w in words if w["top"] < y_fim])
    inicios = [i for i, l in enumerate(linhas_pdf) if l[0]["text"] == "ADICIONAIS"]
    if not inicios:
        return None
    partes = []
    for n, pos in enumerate(inicios):
        fim = inicios[n + 1] if n + 1 < len(inicios) else len(linhas_pdf)
        df = _secao_tabela(linhas_pdf[pos], linhas_pdf[pos + 1:fim])
        if df is not None and not df.empty:
            df["Parte"] = "socios" if any(c in df.columns for c in ("Sócios", "Autônomos")) else "funcionarios"
            partes.append(df)
    if not partes:
        return None
    if len(partes) > 1:
        for df in partes:
            if df["Parte"].iloc[0] == "funcionarios":
                totais = df["Nome"].str.startswith("TOTAL")
                df.loc[totais, "Nome"] = df.loc[totais, "Nome"] + " FUNCIONARIOS"
    return pd.concat(partes, ignore_index=True)


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
    y1, colunas = _geometria_blocos(page, words, y0)
    gps = ler_bloco(page, *colunas["gps"], y0, y1)
    fgts = ler_bloco(page, *colunas["fgts"], y0, y1)
    darf = ler_bloco(page, *colunas["darf"], y0, y1)
    return {
        "GPS": gps[["Nome", "Valor"]],
        "FGTS": fgts[fgts["Seção"] != "F G T S"].reset_index(drop=True),
        "DARF PIS": darf.reset_index(drop=True),
    }


def _geometria_blocos(page, words, y0):
    """(y_fim, {origem: (x0, x1)}) das três colunas GPS / FGTS / DARF PIS."""
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

    return y1, {"gps": (0, x_fgts), "fgts": (x_fgts, x_darf), "darf": (x_darf, larg)}


# ---------- Recorte do PDF onde um evento aparece ----------
def _rotulo_linha(textos, origem):
    """Nome do evento numa linha: tudo antes do primeiro valor; no resumo sem o código de 3 dígitos."""
    nome = list(textos)
    while len(nome) > 1 and (NUM_BR.match(nome[-1]) or origem == "resumo" and re.fullmatch(r"-?\d+", nome[-1])):
        nome.pop()  # valores no fim da linha (um no bloco, várias colunas no resumo)
    if origem == "resumo" and nome and re.fullmatch(r"\d{3}", nome[0]):
        nome = nome[1:]
    txt = " ".join(nome).strip().rstrip(":").strip()
    txt = re.sub(r"\s+Parc\.\s*\d+/\d+\s*$", "", txt)
    return re.sub(r"=(\S)", r"= \1", txt)


def localizar(pdf_path, nome, origem, valor=None):
    """Acha a linha do evento no PDF. Devolve {pagina, linha:(x0,top,x1,bottom), coluna:(x0,x1), cabecalho:(...)|None}
    ou None. `origem` = resumo | gps | fgts | darf (a região da página onde o evento é lido)."""
    alvo = norm(re.sub(r"=(\S)", r"= \1", nome))
    with pdfplumber.open(pdf_path) as pdf:
        for i, page in enumerate(pdf.pages):
            words = page.extract_words()
            y0 = y_blocos(words)
            if origem == "resumo":
                area, col = (0, 0, page.width, y0 or page.height), (0, page.width)
            else:
                if y0 is None:
                    continue
                y1, colunas = _geometria_blocos(page, words, y0)
                col = colunas[origem]
                area = (col[0], y0, col[1], y1)
            ws = [w for w in words if w["x0"] >= area[0] - 1 and w["x1"] <= area[2] + 1 and area[1] <= w["top"] <= area[3]]
            achados = []
            for lin in agrupar_linhas(ws):
                textos = [w["text"] for w in lin]
                if norm(_rotulo_linha(textos, origem)) == alvo:
                    nums = [t for t in textos if NUM_BR.match(t)]
                    achados.append((lin, nums))
            if achados:
                lin, nums = next(((l, n) for l, n in achados if valor is not None and any(abs(br_para_float(x) - valor) < .006 for x in n)), achados[0])
                cab = None
                if origem == "resumo":
                    cab_l = next((l for l in agrupar_linhas(words) if l[0]["text"].upper().startswith("ADICIONAIS")), None)
                    if cab_l:
                        cab = (min(w["x0"] for w in cab_l), min(w["top"] for w in cab_l), max(w["x1"] for w in cab_l),
                               max(w["bottom"] for w in cab_l))
                return {"pagina": i, "coluna": col, "cabecalho": cab,
                        "linha": (min(w["x0"] for w in lin), min(w["top"] for w in lin), max(w["x1"] for w in lin),
                                  max(w["bottom"] for w in lin))}
    return None


def recorte_png(pdf_path, nome, origem, valor=None, resolucao=130):
    """PNG com a linha do evento destacada (e, no resumo, a linha de títulos das colunas); None se não achar."""
    from PIL import Image, ImageDraw
    achou = localizar(pdf_path, nome, origem, valor)
    if not achou:
        return None
    k = resolucao / 72
    with pdfplumber.open(pdf_path) as pdf:
        page = pdf.pages[achou["pagina"]]
        img = page.to_image(resolution=resolucao).original.convert("RGBA")
    x0, t, x1, b = achou["linha"]
    cx0, cx1 = achou["coluna"]
    sobre = Image.new("RGBA", img.size, (0, 0, 0, 0))
    ImageDraw.Draw(sobre).rectangle([(x0 - 4) * k, (t - 3) * k, (x1 + 4) * k, (b + 3) * k], fill=(255, 196, 0, 70),
                                    outline=(230, 150, 0, 255), width=2)
    img = Image.alpha_composite(img, sobre).convert("RGB")
    esq, dir_ = max(0, cx0 - 8) * k, min(page.width, cx1 + 8) * k
    faixa = img.crop((int(esq), int(max(0, t - 40) * k), int(dir_), int(min(page.height, b + 40) * k)))
    if achou["cabecalho"] and achou["cabecalho"][1] < t - 40:
        h = achou["cabecalho"]
        topo = img.crop((int(esq), int((h[1] - 6) * k), int(dir_), int((h[3] + 6) * k)))
        tela = Image.new("RGB", (faixa.width, topo.height + faixa.height + 6), "white")
        tela.paste(topo, (0, 0)); tela.paste(faixa, (0, topo.height + 6)); faixa = tela
    buf = io.BytesIO(); faixa.save(buf, "PNG")
    return buf.getvalue()


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
    cols = [c for c in df1.columns if c not in ("Tipo", "Código", "Nome", "Parte")]
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
