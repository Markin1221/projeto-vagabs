import sys
from collections import defaultdict, deque

import pandas as pd
from PyQt6.QtWidgets import (
    QApplication, QWidget, QLabel, QPushButton, QVBoxLayout, QFileDialog, QTextEdit
)

COLUNAS_NECESSARIAS = ['indice', 'doc', 'valor_extrato', 'descricao', 'valor_sys']
ARQUIVO_SAIDA = 'arquivo_feito2.xlsx'
SEM_PAR = '---'


def coluna_como_texto(df, coluna):
    """Pega uma coluna do DataFrame como lista de textos, sem espaços nas pontas."""
    return df[coluna].astype(str).str.strip().tolist()


def cruzar_extrato_com_sistema(df):
    """
    Para cada valor_extrato, procura um valor_sys igual que ainda não foi usado.
    Se achar, traz doc e descricao dessa linha; se não, preenche com '---'.
    """
    valor_extrato = coluna_como_texto(df, 'valor_extrato')
    valor_sys = coluna_como_texto(df, 'valor_sys')
    doc = coluna_como_texto(df, 'doc')
    descricao = coluna_como_texto(df, 'descricao')

    # valor -> fila com as posições onde ele aparece em valor_sys (em ordem).
    # Tirar da fila equivale a pegar "o primeiro ainda não usado".
    posicoes = defaultdict(deque)
    for posicao, valor in enumerate(valor_sys):
        posicoes[valor].append(posicao)

    dados = []
    for valor in valor_extrato:
        if posicoes[valor]:
            j = posicoes[valor].popleft()
            dados.append({
                'valor_extrato': valor,
                'doc': doc[j],
                'descricao': descricao[j],
                'valor_sys': valor_sys[j],
            })
        else:
            dados.append({
                'valor_extrato': valor,
                'doc': SEM_PAR,
                'descricao': SEM_PAR,
                'valor_sys': SEM_PAR,
            })

    return pd.DataFrame(dados)


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

    def escolher_arquivo(self):
        arquivo, _ = QFileDialog.getOpenFileName(
            self,
            "Selecione o arquivo Excel",
            "",
            "Arquivos Excel (*.xlsx)"
        )
        return arquivo

    def colunas_faltando(self, df):
        return [col for col in COLUNAS_NECESSARIAS if col not in df.columns]

    def processar_dados(self, arquivo):
        if not arquivo:
            self.texto_status.append("Nenhum arquivo selecionado.")
            return

        df = pd.read_excel(arquivo)
        self.texto_status.append(f"Arquivo carregado: {arquivo}\n")

        faltando = self.colunas_faltando(df)
        if faltando:
            self.texto_status.append(f"Coluna '{faltando[0]}' não encontrada no arquivo Excel.")
            return

        resultado = cruzar_extrato_com_sistema(df)
        resultado.to_excel(ARQUIVO_SAIDA, index=False)
        self.texto_status.append(
            f"Processamento concluído. Arquivo salvo como '{ARQUIVO_SAIDA}'."
        )

    def selecionar_e_processar(self):
        arquivo = self.escolher_arquivo()
        self.processar_dados(arquivo)


if __name__ == "__main__":
    app = QApplication(sys.argv)
    janela = AppExcelSegundo()
    janela.show()
    sys.exit(app.exec())