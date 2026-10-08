import re
import sys

import pandas as pd
import pdfplumber
from openpyxl.styles import Font
from PyQt6.QtWidgets import (
    QApplication, QWidget, QLabel, QPushButton, QVBoxLayout, QFileDialog, QTextEdit
)

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


# ---------- Localizadores (independem do número da página) ----------
def achar_y_blocos(words):
    """Topo da linha '* GPS | FGTS | DARF PIS' (início dos blocos de informações). None se a página não tem."""
    for w in words:
        if w["text"] == "DARF":
            for v in words:
                if v["text"] == "PIS" and abs(v["top"] - w["top"]) <= 3 and v["x0"] > w["x1"]:
                    return w["top"] - 2
    return None


# ---------- Tabela ADICIONAIS / DESCONTOS ----------
def detectar_colunas(header):
    """Lê o cabeçalho da tabela e devolve {nome_da_coluna: x1}.
    Funciona para 'ATIVOS DEMITIDOS AFASTADOS TOTAL' e para 'Valores Sócios  Valores Autônomos'."""
    textos = [w["text"] for w in header]
    grupos = []
    for w in header[textos.index("DESCONTOS") + 1:]:
        if grupos and grupos[-1]["txt"] == ["Valores"]:   # 'Valores' + 'Sócios' formam uma coluna só
            grupos[-1]["txt"].append(w["text"])
            grupos[-1]["x1"] = w["x1"]
        else:
            grupos.append({"txt": [w["text"]], "x1": w["x1"]})
    cols = {}
    for g in grupos:
        nome = " ".join(g["txt"])
        cols[nome.capitalize() if nome.isupper() else nome] = g["x1"]
    return cols


def ler_tabela(page, y_max=None):
    """Lê a tabela de adicionais/descontos. Devolve (DataFrame, [colunas]) ou None se a página não tem a tabela."""
    y_max = y_max or page.height
    words = [w for w in page.extract_words() if w["top"] < y_max]
    linhas_pdf = agrupar_linhas(words)

    idx = next((i for i, lin in enumerate(linhas_pdf)
                if {"ADICIONAIS", "DESCONTOS"} <= {w["text"] for w in lin}), None)
    if idx is None:
        return None
    x_col = detectar_colunas(linhas_pdf[idx])
    if not x_col:
        raise ValueError("Não encontrei as colunas da tabela ADICIONAIS / DESCONTOS")
    colunas = list(x_col)

    linhas, tipo = [], "Adicional"
    for lin in linhas_pdf[idx + 1:]:
        textos = [w["text"] for w in lin]
        if not any(NUM.match(t) for t in textos):
            continue

        codigo = textos[0] if re.fullmatch(r"\d{3}", textos[0]) else ""
        valores = {c: None for c in colunas}
        nome = []
        for w in lin[1 if codigo else 0:]:
            col = min(x_col, key=lambda c: abs(x_col[c] - w["x1"]))
            if NUM.match(w["text"]) and abs(x_col[col] - w["x1"]) < 25:
                valores[col] = br_para_float(w["text"])
            else:
                nome.append(w["text"])
        nome = " ".join(nome)

        t = tipo if (codigo or nome.startswith("TOTAL DE ADICIONAIS") or nome.startswith("TOTAL DE DESCONTOS")) else ""
        linhas.append({"Tipo": t, "Código": codigo, "Nome": nome, **valores})
        if nome.startswith("TOTAL DE ADICIONAIS"):
            tipo = "Desconto"
    return pd.DataFrame(linhas, columns=["Tipo", "Código", "Nome"] + colunas), colunas


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
    return pd.DataFrame(dados, columns=["Seção", "Nome", "Valor"])


def ler_blocos(page, y0):
    words = page.extract_words()
    larg = page.width

    # limite inferior: antes de "INFORMAÇÕES AUXILIARES" (e antes da nota de rodapé do eSocial)
    y1 = page.height
    for w in words:
        if w["top"] > y0 and w["text"].upper().startswith("AUXILIARES"):
            y1 = min(y1, w["top"] - 2)
    for i, w in enumerate(words[:-1]):
        if w["top"] > y0 and w["text"] == "*" and words[i + 1]["text"] == "De":
            y1 = min(y1, w["top"] - 2)

    # início do bloco FGTS = primeira palavra "BASES"; início do DARF PIS = "Base" seguido de "PIS"
    x_fgts = next((w["x0"] for w in words if w["text"] == "BASES" and w["top"] > y0), larg / 3) - 3
    x_darf = larg * 2 / 3
    for i, w in enumerate(words[:-1]):
        if w["text"] == "Base" and words[i + 1]["text"] == "PIS":
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


# ---------- Relação de férias ----------
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
    return pd.DataFrame(dados, columns=[
        "Código", "Funcionário", "Valor líquido", "Data pagamento",
        "Período de férias", "Período aquisitivo"])


# ---------- Validação ----------
def validar(df1, colunas):
    avisos = []
    itens = df1[df1["Código"] != ""]

    def total(nome):
        r = df1[df1["Nome"] == nome]
        return r.iloc[0] if not r.empty else None

    t_adic, t_desc, liq = total("TOTAL DE ADICIONAIS"), total("TOTAL DE DESCONTOS"), total("TOTAL LÍQUIDO A PAGAR")
    for col in colunas:
        s_adic = itens[itens["Tipo"] == "Adicional"][col].fillna(0).sum()
        s_desc = itens[itens["Tipo"] == "Desconto"][col].fillna(0).sum()
        if t_adic is not None and abs(s_adic - (0 if pd.isna(t_adic[col]) else t_adic[col])) > 0.01:
            avisos.append(f"{col}: soma dos adicionais ({s_adic:.2f}) difere do total ({t_adic[col]})")
        if t_desc is not None and abs(s_desc - (0 if pd.isna(t_desc[col]) else t_desc[col])) > 0.01:
            avisos.append(f"{col}: soma dos descontos ({s_desc:.2f}) difere do total ({t_desc[col]})")
        if liq is not None and not pd.isna(liq[col]) and abs(s_adic - s_desc - liq[col]) > 0.01:
            avisos.append(f"{col}: adicionais - descontos ({s_adic - s_desc:.2f}) difere do líquido ({liq[col]})")
    return avisos


# ---------- Excel ----------
def gerar_excel(pdf_path, saida):
    """Procura cada parte do relatório pelo CONTEÚDO (não pelo número da página), então funciona
    para os 3 layouts: Oficina (3 págs), Coleta e Sócios (tabela + blocos na mesma página)."""
    df1 = colunas = blocos = ferias = None
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            texto = page.extract_text() or ""
            if "ResumoGeral" not in texto.replace(" ", ""):
                continue
            y_blocos = achar_y_blocos(page.extract_words())

            if df1 is None:
                r = ler_tabela(page, y_blocos)
                if r is not None:
                    df1, colunas = r
            if blocos is None and y_blocos is not None:
                blocos = ler_blocos(page, y_blocos)
            if ferias is None and re.search(r"Funcion.rios em F.rias", texto):
                ferias = ler_ferias(page)

    if df1 is None:
        raise ValueError("PDF não parece ser o Resumo Geral da folha (tabela ADICIONAIS / DESCONTOS não encontrada)")

    sheets = {"Resumo Folha": df1}
    if blocos:
        sheets.update(blocos)
    if ferias is not None:
        sheets["Férias"] = ferias

    with pd.ExcelWriter(saida, engine="openpyxl") as writer:
        for nome, df in sheets.items():
            df.to_excel(writer, sheet_name=nome, index=False)
            ws = writer.sheets[nome]
            for cell in ws[1]:
                cell.font = Font(bold=True)
            for i, col in enumerate(df.columns, start=1):
                letra = ws.cell(row=1, column=i).column_letter
                larg = max([len(str(col))] + [len(str(v)) for v in df[col]]) + 2
                ws.column_dimensions[letra].width = min(larg, 60)
                if pd.api.types.is_float_dtype(df[col]):
                    for row in ws.iter_rows(min_row=2, min_col=i, max_col=i):
                        row[0].number_format = "#,##0.00"
    return validar(df1, colunas)


# ---------- Interface ----------
class AppResumoFolha(QWidget):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("Resumo Geral da Folha (PDF) -> Excel")
        self.setGeometry(400, 200, 600, 400)
        self.arquivo_pdf = ""

        self.layout = QVBoxLayout()
        self.btn_pdf = QPushButton("1) Selecionar PDF do Resumo Geral")
        self.btn_pdf.clicked.connect(self.selecionar_pdf)
        self.layout.addWidget(self.btn_pdf)
        self.label_pdf = QLabel("Nenhum arquivo selecionado")
        self.layout.addWidget(self.label_pdf)

        self.btn_gerar = QPushButton("2) Gerar planilha")
        self.btn_gerar.clicked.connect(self.processar)
        self.layout.addWidget(self.btn_gerar)

        self.texto_status = QTextEdit()
        self.texto_status.setReadOnly(True)
        self.layout.addWidget(self.texto_status)
        self.setLayout(self.layout)

    def selecionar_pdf(self):
        arquivo, _ = QFileDialog.getOpenFileName(self, "Selecione o PDF", "", "Arquivos PDF (*.pdf)")
        if arquivo:
            self.arquivo_pdf = arquivo
            self.label_pdf.setText(arquivo)

    def processar(self):
        if not self.arquivo_pdf:
            self.texto_status.append("Selecione o PDF antes de gerar.")
            return
        caminho, _ = QFileDialog.getSaveFileName(
            self, "Salvar planilha", "resumo_folha.xlsx", "Arquivos Excel (*.xlsx)")
        if not caminho:
            self.texto_status.append("Salvamento cancelado.")
            return
        try:
            avisos = gerar_excel(self.arquivo_pdf, caminho)
        except Exception as erro:
            self.texto_status.append(f"Erro: {erro}")
            return
        if avisos:
            self.texto_status.append("Atenção, a validação encontrou diferenças:")
            for a in avisos:
                self.texto_status.append(f" - {a}")
        else:
            self.texto_status.append("Validação OK (totais conferem).")
        self.texto_status.append(f"Arquivo salvo em: {caminho}")


if __name__ == "__main__":
    app = QApplication(sys.argv)
    janela = AppResumoFolha()
    janela.show()
    sys.exit(app.exec())