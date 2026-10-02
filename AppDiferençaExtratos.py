import re
import sys
from collections import defaultdict

import pandas as pd
from PyQt6.QtWidgets import (
    QApplication, QWidget, QLabel, QPushButton, QVBoxLayout, QFileDialog,
    QTextEdit, QCheckBox
)


class AppPagamentosFaltando(QWidget):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("Pagamentos que faltam no DDATA SOL")
        self.setGeometry(400, 200, 650, 520)

        self.arquivo_extrato = ""
        self.arquivo_ddata = ""

        self.layout = QVBoxLayout()

        # Extrato do banco
        self.btn_extrato = QPushButton("1) Selecionar EXTRATO DO BANCO")
        self.btn_extrato.clicked.connect(self.selecionar_extrato)
        self.layout.addWidget(self.btn_extrato)
        self.label_extrato = QLabel("Nenhum arquivo selecionado")
        self.layout.addWidget(self.label_extrato)

        # Planilha do sistema
        self.btn_ddata = QPushButton("2) Selecionar planilha do DDATA SOL")
        self.btn_ddata.clicked.connect(self.selecionar_ddata)
        self.layout.addWidget(self.btn_ddata)
        self.label_ddata = QLabel("Nenhum arquivo selecionado")
        self.layout.addWidget(self.label_ddata)

        # Opções
        self.chk_rende = QCheckBox("Ignorar aplicações/resgates automáticos (BB Rende Fácil)")
        self.chk_rende.setChecked(True)
        self.layout.addWidget(self.chk_rende)

        self.chk_creditos = QCheckBox("Ignorar créditos (comparar só débitos/pagamentos)")
        self.chk_creditos.setChecked(False)
        self.layout.addWidget(self.chk_creditos)

        self.chk_datas = QCheckBox("Ignorar datas e procurar só pelos valores")
        self.chk_datas.setChecked(False)
        self.layout.addWidget(self.chk_datas)

        # Processar
        self.btn_processar = QPushButton("3) Comparar e gerar planilha")
        self.btn_processar.clicked.connect(self.processar_dados)
        self.layout.addWidget(self.btn_processar)

        self.texto_status = QTextEdit()
        self.texto_status.setReadOnly(True)
        self.layout.addWidget(self.texto_status)

        self.setLayout(self.layout)

    # ---------- Seleção de arquivos ----------
    def escolher_arquivo(self, titulo):
        arquivo, _ = QFileDialog.getOpenFileName(
            self, titulo, "", "Arquivos Excel (*.xlsx)"
        )
        return arquivo

    def selecionar_extrato(self):
        arquivo = self.escolher_arquivo("Selecione o extrato do banco")
        if arquivo:
            self.arquivo_extrato = arquivo
            self.label_extrato.setText(arquivo)

    def selecionar_ddata(self):
        arquivo = self.escolher_arquivo("Selecione a planilha do DDATA SOL")
        if arquivo:
            self.arquivo_ddata = arquivo
            self.label_ddata.setText(arquivo)

    # ---------- Leitura das planilhas ----------
    def ler_extrato(self, arquivo):
        """
        O extrato do banco tem 2 linhas por lançamento:
        linha 1 = data, histórico, documento, valor, C/D
        linha 2 = detalhe (nome do favorecido, horário, etc.)
        """
        df = pd.read_excel(arquivo, header=None)
        dados = []

        for i in range(len(df)):
            linha = df.iloc[i]
            data = linha[0]
            cd = str(linha[4]).strip().upper()

            if pd.isna(data) or cd not in ("C", "D"):
                continue

            historico_bruto = str(linha[1])
            # tira "0697  99015  470 " do começo e deixa só "Transferência enviada"
            m = re.match(r"\s*\d+\s+\d+\s+\d+\s+(.*)", historico_bruto)
            historico = m.group(1).strip() if m else historico_bruto.strip()

            if "SALDO" in historico.upper().replace(" ", ""):
                continue

            detalhe = ""
            if i + 1 < len(df) and pd.isna(df.iloc[i + 1][0]):
                detalhe = str(df.iloc[i + 1][1]).strip()
                if detalhe == "nan":
                    detalhe = ""

            doc = linha[2]
            try:
                doc = str(int(float(doc)))
            except (ValueError, TypeError):
                doc = "" if pd.isna(doc) else str(doc)

            valor = round(float(linha[3]), 2)
            valor_assinado = -valor if cd == "D" else valor

            dados.append({
                "Data": pd.to_datetime(data, dayfirst=True).strftime("%d/%m/%Y"),
                "Tipo": "Débito" if cd == "D" else "Crédito",
                "Valor": valor,
                "Histórico": historico,
                "Documento": doc,
                "Detalhe": detalhe,
                "_chave": valor_assinado,
            })

        return pd.DataFrame(dados)

    def ler_ddata(self, arquivo):
        bruto = pd.read_excel(arquivo, header=None)

        # procura a linha do cabeçalho (onde tem 'Data' e 'Valor')
        linha_cab = None
        for i in range(min(15, len(bruto))):
            valores = [str(v).strip() for v in bruto.iloc[i].values]
            if "Data" in valores and "Valor" in valores:
                linha_cab = i
                break
        if linha_cab is None:
            return None

        df = pd.read_excel(arquivo, header=linha_cab)
        df = df[df["Data"].notna() & df["Valor"].notna()].copy()
        df["Data"] = pd.to_datetime(df["Data"], dayfirst=True, errors="coerce")
        df = df[df["Data"].notna()]
        df["Data"] = df["Data"].dt.strftime("%d/%m/%Y")
        df["Valor"] = df["Valor"].astype(float).round(2)
        return df

    # ---------- Processamento ----------
    def processar_dados(self):
        if not self.arquivo_extrato or not self.arquivo_ddata:
            self.texto_status.append("Selecione os DOIS arquivos antes de comparar.")
            return

        try:
            extrato = self.ler_extrato(self.arquivo_extrato)
            ddata = self.ler_ddata(self.arquivo_ddata)
        except Exception as erro:
            self.texto_status.append(f"Erro ao ler os arquivos: {erro}")
            return

        if ddata is None:
            self.texto_status.append("Não encontrei as colunas 'Data' e 'Valor' na planilha do DDATA.")
            return

        if self.chk_rende.isChecked():
            extrato = extrato[~extrato["Histórico"].str.contains("Rende", case=False, na=False)]
        if self.chk_creditos.isChecked():
            extrato = extrato[extrato["Tipo"] == "Débito"]
            ddata = ddata[ddata["Valor"] < 0]

        # índices limpos (0..n-1) para trabalhar com posições
        extrato = extrato.reset_index(drop=True)
        ddata = ddata.reset_index(drop=True)
        extrato["_dt"] = pd.to_datetime(extrato["Data"], format="%d/%m/%Y")
        ddata["_dt"] = pd.to_datetime(ddata["Data"], format="%d/%m/%Y")

        ignorar_datas = self.chk_datas.isChecked()

        self.texto_status.append(f"Lançamentos no extrato: {len(extrato)}")
        self.texto_status.append(f"Lançamentos no DDATA: {len(ddata)}")
        if ignorar_datas:
            self.texto_status.append("Modo: comparando só pelos valores (datas ignoradas)\n")
        else:
            self.texto_status.append("Modo: comparando por data + valor\n")

        def montar_chave(data, valor):
            return valor if ignorar_datas else (data, valor)

        # ---- Passo 1: casa extrato x DDATA (cada lançamento "consome" um do DDATA) ----
        pool = defaultdict(list)  # chave -> posições do DDATA ainda disponíveis
        for pos in range(len(ddata)):
            chave = montar_chave(ddata.at[pos, "Data"], ddata.at[pos, "Valor"])
            pool[chave].append(pos)

        faltando_pos = []
        for pos in range(len(extrato)):
            chave = montar_chave(extrato.at[pos, "Data"], round(extrato.at[pos, "_chave"], 2))
            if pool[chave]:
                pool[chave].pop(0)
            else:
                faltando_pos.append(pos)

        restantes = sorted(p for lista in pool.values() for p in lista)  # DDATA sem par

        # ---- Passo 2: dos faltantes, quais têm o valor no DDATA em outra data? ----
        faltando_real = []
        outra_data = []
        consumidos = set()

        if ignorar_datas:
            faltando_real = faltando_pos
        else:
            por_valor = defaultdict(list)
            for p in restantes:
                por_valor[round(ddata.at[p, "Valor"], 2)].append(p)

            for pos in faltando_pos:
                valor = round(extrato.at[pos, "_chave"], 2)
                candidatos = por_valor.get(valor)
                if candidatos:
                    # escolhe o lançamento do DDATA com a data mais próxima
                    melhor = min(
                        candidatos,
                        key=lambda p: abs((ddata.at[p, "_dt"] - extrato.at[pos, "_dt"]).days)
                    )
                    candidatos.remove(melhor)
                    consumidos.add(melhor)
                    dif = (ddata.at[melhor, "_dt"] - extrato.at[pos, "_dt"]).days
                    linha = extrato.loc[pos].drop(["_chave", "_dt"]).to_dict()
                    linha["Data no DDATA"] = ddata.at[melhor, "Data"]
                    linha["Título no DDATA"] = ddata.at[melhor, "Título"] if "Título" in ddata.columns else ""
                    linha["Descrição no DDATA"] = ddata.at[melhor, "Descrição"] if "Descrição" in ddata.columns else ""
                    linha["Diferença (dias)"] = dif
                    outra_data.append(linha)
                else:
                    faltando_real.append(pos)

        resultado = extrato.loc[faltando_real].drop(columns=["_chave", "_dt"])
        outra_data = pd.DataFrame(outra_data)

        # O que sobrou no DDATA sem par no extrato (informativo)
        sobras = []
        for p in restantes:
            if p in consumidos:
                continue
            sobras.append({
                "Data": ddata.at[p, "Data"],
                "Valor": ddata.at[p, "Valor"],
                "Título": ddata.at[p, "Título"] if "Título" in ddata.columns else "",
                "Descrição": ddata.at[p, "Descrição"] if "Descrição" in ddata.columns else "",
            })
        sobras = pd.DataFrame(sobras)

        if resultado.empty and outra_data.empty:
            self.texto_status.append("Nenhum pagamento faltando no DDATA. Tudo conferiu!")
            return

        caminho, _ = QFileDialog.getSaveFileName(
            self, "Salvar planilha de faltantes",
            "transferencias_faltando_ddata.xlsx", "Arquivos Excel (*.xlsx)"
        )
        if not caminho:
            self.texto_status.append("Salvamento cancelado.")
            return

        try:
            with pd.ExcelWriter(caminho) as writer:
                resultado.to_excel(writer, sheet_name="Faltando no DDATA", index=False)
                if not outra_data.empty:
                    outra_data.to_excel(writer, sheet_name="Valor existe em outra data", index=False)
                if not sobras.empty:
                    sobras.to_excel(writer, sheet_name="So no DDATA", index=False)
        except Exception as erro:
            self.texto_status.append(f"Erro ao salvar (o arquivo está aberto?): {erro}")
            return

        self.texto_status.append(f"Faltando no DDATA: {len(resultado)} lançamentos")
        if not ignorar_datas:
            self.texto_status.append(f"Valor existe no DDATA, mas em outra data: {len(outra_data)}")
        self.texto_status.append(f"Só no DDATA (sem par no extrato): {len(sobras)}")
        self.texto_status.append(f"\nArquivo salvo em: {caminho}")


if __name__ == "__main__":
    app = QApplication(sys.argv)
    janela = AppPagamentosFaltando()
    janela.show()
    sys.exit(app.exec())