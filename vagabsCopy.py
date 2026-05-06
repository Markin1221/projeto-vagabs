import sys
import pandas as pd
import numpy as np
import re
from PyQt6.QtWidgets import (
    QApplication, QWidget, QLabel, QPushButton, QVBoxLayout, QFileDialog
)


arquivo_excel = None  # variável global para armazenar o caminho


def processar_arquivo(label_status):
    global arquivo_excel
    arquivo_excel, _ = QFileDialog.getOpenFileName(
        None, "Selecione o arquivo Excel", "", "Arquivos Excel (*.xlsx)"
    )
    if arquivo_excel:
        label_status.setText(f"Arquivo selecionado:\n{arquivo_excel}")
    else:
        label_status.setText("Nenhum arquivo selecionado.")


def extracao_titulo(titulo):
    numero = re.search(r'\b\d+\b', titulo)
    numero = numero.group() if numero else 'Não encontrado'

    parcela = re.search(r'\b\d+/\d+\b', titulo)
    parcela = parcela.group() if parcela else 'Não encontrada'

    return numero, parcela


def resto(label_status):
    global arquivo_excel
    if not arquivo_excel:
        label_status.setText("Selecione um arquivo primeiro!")
        return

    try:
        df = pd.read_excel(arquivo_excel)

        titulo = 'Titulo'
        preco = 'Valor'
        cap = 'Cap'
        empresa = 'Fornecedor'

        titulo_array = df[titulo].astype(str).str.strip().values
        preco_array = df[preco].astype(str).str.strip().values
        cap_array = df[cap].astype(str).str.strip().values
        empresa_array = df[empresa].astype(str).str.strip().values

        dados = []

        for titulo in titulo_array:
            numero, parcela = extracao_titulo(titulo)

            indice = np.where(titulo_array == titulo)[0][0]

            cap_valor = cap_array[indice]
            if pd.isna(cap_valor):
                cap_valor = 'N/A'
            else:
                cap_valor = str(int(float(cap_valor))) if str(cap_valor).replace('.', '', 1).isdigit() else str(cap_valor)

            preco_valor = preco_array[indice]

            descricao = ['CAP', cap_valor, '/', empresa_array[indice], '-', parcela]
            descricao = [str(item) for item in descricao]

            dados.append({
                'documento': numero,
                'descricao': ' '.join(descricao),
                'valor_monetario': preco_valor
            })

        df2 = pd.DataFrame(dados)
        df2.to_excel('arquivo_feito.xlsx', index=False)

        label_status.setText("Processamento concluído! Arquivo salvo como 'arquivo_feito.xlsx'.")

    except Exception as e:
        label_status.setText(f"Erro: {e}")


class AppExcelPrimeiro(QWidget):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("Facilitador do Processamento dos Extratos")

        layout = QVBoxLayout()

        label = QLabel("Selecione aqui o arquivo do sistema")
        layout.addWidget(label)

        botao_arquivo = QPushButton("Selecionar planilha")
        layout.addWidget(botao_arquivo)

        botao_processar = QPushButton("Processar")
        layout.addWidget(botao_processar)

        self.label_status = QLabel("")
        layout.addWidget(self.label_status)

        botao_arquivo.clicked.connect(lambda: processar_arquivo(self.label_status))
        botao_processar.clicked.connect(lambda: resto(self.label_status))

        self.setLayout(layout)


if __name__ == "__main__":
    app = QApplication(sys.argv)
    janela = AppExcelPrimeiro()
    janela.show()
    sys.exit(app.exec())
