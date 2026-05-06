import sys
import os
from PyQt6.QtWidgets import (
    QApplication, QWidget, QLabel, QPushButton, QVBoxLayout,
    QFileDialog, QTextEdit
)

dicionario = {
    #aqui bota o nome das pessoas e a identificaçao do lado, no caso cap
}


class AppHapvida(QWidget):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("Renomeador de Arquivos CAP")
        self.setGeometry(300, 200, 700, 500)

        # Layout vertical
        self.layout = QVBoxLayout()

        # Botão para selecionar pasta
        self.btn_selecionar = QPushButton("Selecionar Pasta")
        self.btn_selecionar.clicked.connect(self.selecionar_pasta)
        self.layout.addWidget(self.btn_selecionar)

        # Label para mostrar a pasta selecionada
        self.label_pasta = QLabel("Nenhuma pasta selecionada")
        self.layout.addWidget(self.label_pasta)

        # Botão para renomear arquivos
        self.btn_renomear = QPushButton("Renomear Arquivos")
        self.btn_renomear.clicked.connect(self.renomear_arquivos)
        self.btn_renomear.setEnabled(False)
        self.layout.addWidget(self.btn_renomear)

        # Caixa de texto para mostrar log/status
        self.texto_status = QTextEdit()
        self.texto_status.setReadOnly(True)
        self.layout.addWidget(self.texto_status)

        self.setLayout(self.layout)

        # Variável para armazenar a pasta selecionada
        self.pasta = ""

    def selecionar_pasta(self):
        pasta = QFileDialog.getExistingDirectory(self, "Selecione a pasta")
        if pasta:
            self.pasta = pasta
            self.label_pasta.setText(f"Pasta selecionada: {pasta}")
            self.btn_renomear.setEnabled(True)
            self.texto_status.clear()

    def renomear_arquivos(self):
        if not self.pasta:
            return

        arquivos = [f for f in os.listdir(self.pasta) if os.path.isfile(os.path.join(self.pasta, f))]

        for arquivo in arquivos:
            nome_arquivo_upper = arquivo.upper()

            # Pula se já tiver 'CAP ' no nome
            if "CAP " in nome_arquivo_upper:
                self.texto_status.append(f"Arquivo já tem CAP: {arquivo}")
                continue

            encontrado = False

            for nome, cap in dicionario.items():
                if nome.upper() in nome_arquivo_upper:
                    base, ext = os.path.splitext(arquivo)
                    nome_novo = f"CAP {cap} {base}{ext}"
                    caminho_antigo = os.path.join(self.pasta, arquivo)
                    caminho_novo = os.path.join(self.pasta, nome_novo)
                    os.rename(caminho_antigo, caminho_novo)
                    self.texto_status.append(f"Renomeado:\nDe: {arquivo}\nPara: {nome_novo}\n")
                    encontrado = True
                    break

            if not encontrado:
                base, ext = os.path.splitext(arquivo)
                nome_novo = f"{base} CAP NAO ENCONTRADO{ext}"
                caminho_antigo = os.path.join(self.pasta, arquivo)
                caminho_novo = os.path.join(self.pasta, nome_novo)
                os.rename(caminho_antigo, caminho_novo)
                self.texto_status.append(f"Renomeado:\nDe: {arquivo}\nPara: {nome_novo}\n")

        self.texto_status.append("Processamento concluído!")

if __name__ == "__main__":
    app = QApplication(sys.argv)
    janela = AppHapvida()
    janela.show()
    sys.exit(app.exec())