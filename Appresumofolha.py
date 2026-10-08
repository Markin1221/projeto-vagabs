import re
import sys

import pandas as pd
import pdfplumber
from PyQt6.QtWidgets import (
    QApplication, QWidget, QLabel, QPushButton, QVBoxLayout, QFileDialog, QTextEdit
)

NUM = re.compile(r"^\d{1,3}(\.\d{3})*,\d{2}$|^\d+$")
NUM_BR = re.compile(r"^\d{1,3}(\.\d{3})*,\d{2}$")
PERIODO = r"\d{2}/\d{2}/\d{2} a \d{2}/\d{2}/\d{2}"
COLUNAS = ["Ativos", "Demitidos", "Afastados", "Total"]


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


# ---------- Página 1 ----------
def ler_pagina1(page):
    words = page.extract_words()
    if "ResumoGeral" not in (page.extract_text() or "").replace(" ", ""):
        raise ValueError("PDF não parece ser o Resumo Geral da folha")

    # posição (x1) de cada coluna, pelos títulos
    x_col = {}
    for w in words:
        t = w["text"].upper()
        if t in ("ATIVOS", "DEMITIDOS", "AFASTADOS", "TOTAL") and w["text"].isupper():
            if t.capitalize() not in x_col:
                x_col[t.capitalize()] = w["x1"]
    if len(x_col) != 4:
        raise ValueError("Não encontrei as colunas ATIVOS/DEMITIDOS/AFASTADOS/TOTAL na página 1")

    linhas, tipo, dentro = [], "Adicional", False
    for lin in agrupar_linhas(words):
        textos = [w["text"] for w in lin]
        if textos[0] == "ADICIONAIS":  # cabeçalho da tabela: só lê o que vem depois
            dentro = True
            continue
        if not dentro or not any(NUM.match(t) for t in textos):
            continue

        codigo = textos[0] if re.fullmatch(r"\d{3}", textos[0]) else ""
        valores = {c: None for c in COLUNAS}
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
    return pd.DataFrame(linhas)


# ---------- Página 2 ----------
def ler_bloco(page, x0, x1, y1, secao_inicial=""):
    """Lê um bloco 'Nome : valor'. Linha sem valor vira cabeçalho de seção."""
    area = page.crop((x0, 0, x1, y1))
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


def ler_pagina2(page):
    words = page.extract_words()
    larg = page.width

    # limite inferior: antes de "INFORMAÇÕES AUXILIARES"
    y1 = page.height
    for w in words:
        if w["text"].upper().startswith("AUXILIARES"):
            y1 = w["top"] - 2
            break

    # início do bloco FGTS = primeira palavra "BASES"; início do DARF PIS = "Base" seguido de "PIS"
    x_fgts = next((w["x0"] for w in words if w["text"] == "BASES"), larg / 3) - 3
    x_darf = larg * 2 / 3
    for i, w in enumerate(words[:-1]):
        if w["text"] == "Base" and words[i + 1]["text"] == "PIS":
            x_darf = w["x0"] - 3
            break

    gps = ler_bloco(page, 0, x_fgts, y1)
    fgts = ler_bloco(page, x_fgts, x_darf, y1)
    darf = ler_bloco(page, x_darf, larg, y1)
    return {
        "GPS": gps[["Nome", "Valor"]],
        "FGTS": fgts[fgts["Seção"] != "F G T S"].reset_index(drop=True),
        "DARF PIS": darf.reset_index(drop=True),
    }


# ---------- Página 3 ----------
def ler_pagina3(page):
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
def validar(df1):
    avisos = []
    itens = df1[df1["Código"] != ""]

    def total(nome):
        r = df1[df1["Nome"] == nome]
        return r.iloc[0] if not r.empty else None

    t_adic, t_desc, liq = total("TOTAL DE ADICIONAIS"), total("TOTAL DE DESCONTOS"), total("TOTAL LÍQUIDO A PAGAR")
    for col in COLUNAS:
        s_adic = itens[itens["Tipo"] == "Adicional"][col].fillna(0).sum()
        s_desc = itens[itens["Tipo"] == "Desconto"][col].fillna(0).sum()
        if t_adic is not None and abs(s_adic - (t_adic[col] or 0)) > 0.01:
            avisos.append(f"{col}: soma dos adicionais ({s_adic:.2f}) difere do total ({t_adic[col]})")
        if t_desc is not None and abs(s_desc - (t_desc[col] or 0)) > 0.01:
            avisos.append(f"{col}: soma dos descontos ({s_desc:.2f}) difere do total ({t_desc[col]})")
        if liq is not None and liq[col] is not None and abs(s_adic - s_desc - liq[col]) > 0.01:
            avisos.append(f"{col}: adicionais - descontos ({s_adic - s_desc:.2f}) difere do líquido ({liq[col]})")
    return avisos


# ---------- Excel ----------
def gerar_excel(pdf_path, saida):
    with pdfplumber.open(pdf_path) as pdf:
        if len(pdf.pages) < 3:
            raise ValueError("PDF não parece ser o Resumo Geral da folha (esperadas 3 páginas)")
        df1 = ler_pagina1(pdf.pages[0])
        p2 = ler_pagina2(pdf.pages[1])
        df3 = ler_pagina3(pdf.pages[2])

    sheets = {"Resumo Folha": df1, **p2, "Férias": df3}
    with pd.ExcelWriter(saida, engine="openpyxl") as writer:
        for nome, df in sheets.items():
            df.to_excel(writer, sheet_name=nome, index=False)
            ws = writer.sheets[nome]
            for cell in ws[1]:
                cell.font = cell.font.copy(bold=True)
            for i, col in enumerate(df.columns, start=1):
                letra = ws.cell(row=1, column=i).column_letter
                larg = max([len(str(col))] + [len(str(v)) for v in df[col]]) + 2
                ws.column_dimensions[letra].width = min(larg, 60)
                if pd.api.types.is_float_dtype(df[col]):
                    for row in ws.iter_rows(min_row=2, min_col=i, max_col=i):
                        row[0].number_format = "#,##0.00"
    return validar(df1)


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