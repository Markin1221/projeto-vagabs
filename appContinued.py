import sys
import pandas as pd
from PyQt6.QtWidgets import (
    QApplication, QWidget, QLabel, QPushButton, QVBoxLayout, QFileDialog, QTextEdit
)

class AppExcelSegundo(QWidget):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("Facilitador de Processamento de Extratos")
        self.setGeometry(400, 200, 600, 400)

        self.layout = QVBoxLayout()

        self.label_info = QLabel("Selecione o arquivo do sistema para processar")
        self.layout.addWidget(self.label_info)

        self.btn_selecionar = QPushButton("Selecionar e Processar")
        self.btn_selecionar.clicked.connect(self.selecionar_e_processar)
        self.layout.addWidget(self.btn_selecionar)

        self.texto_status = QTextEdit()
        self.texto_status.setReadOnly(True)
        self.layout.addWidget(self.texto_status)

        self.setLayout(self.layout)

    def processar_arquivo(self):
        arquivo, _ = QFileDialog.getOpenFileName(
            self,
            "Selecione o arquivo Excel",
            "",
            "Arquivos Excel (*.xlsx)"
        )
        return arquivo

    def processar_dados(self, arquivo):
        if not arquivo:
            self.texto_status.append("Nenhum arquivo selecionado.")
            return

        df = pd.read_excel(arquivo)
        self.texto_status.append(f"Arquivo carregado: {arquivo}\n")

        # Nomes das colunas
        dados = []
        i = 0
        indice = 'indice'
        doc = 'doc'
        valor_extrato = 'valor_extrato'
        descricao = 'descricao'
        valor_sys = 'valor_sys'

        # Verifica se as colunas existem
        colunas_necessarias = [indice, doc, valor_extrato, descricao, valor_sys]
        for col in colunas_necessarias:
            if col not in df.columns:
                self.texto_status.append(f"Coluna '{col}' não encontrada no arquivo Excel.")
                return

        # Conversão das colunas em arrays, removendo espaços
        indice_array = df[indice].astype(str).str.strip().values
        doc_array = df[doc].astype(str).str.strip().values
        valor_extrato_array = df[valor_extrato].astype(str).str.strip().values
        descricao_array = df[descricao].astype(str).str.strip().values
        valor_sys_array = df[valor_sys].astype(str).str.strip().values

        indices_usados = set()

        while i < len(valor_extrato_array):
            valor = valor_extrato_array[i]
            encontrou = False

            for j in range(len(valor_sys_array)):
                if j in indices_usados:
                    continue

                if valor == valor_sys_array[j]:
                    dados.append({
                        'valor_extrato': valor,
                        'doc': doc_array[j],
                        'descricao': descricao_array[j],
                        'valor_sys': valor_sys_array[j],
                    })
                    indices_usados.add(j)
                    encontrou = True
                    break

            if not encontrou:
                dados.append({
                    'valor_extrato': valor,
                    'doc': '---',
                    'descricao': '---',
                    'valor_sys': '---',
                })

            i += 1

        df2 = pd.DataFrame(dados)
        df2.to_excel('arquivo_feito2.xlsx', index=False)
        self.texto_status.append("Processamento concluído. Arquivo salvo como 'arquivo_feito2.xlsx'.")

    def selecionar_e_processar(self):
        arquivo = self.processar_arquivo()
        self.processar_dados(arquivo)

if __name__ == "__main__":
    app = QApplication(sys.argv)
    janela = AppExcelSegundo()
    janela.show()
    sys.exit(app.exec())
