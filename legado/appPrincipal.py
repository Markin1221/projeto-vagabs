import sys

from PyQt6.QtWidgets import QApplication, QLabel, QPushButton, QVBoxLayout, QWidget

import estilo
from vagabsCopy import AppExcelPrimeiro
from appContinued import AppExcelSegundo
from hapvida import AppHapvida
from avisos import MonitorGUI
from quinzena.app_classificador import AppClassificador
from AppDiferençaExtratos import AppPagamentosFaltando
from Appresumofolha import AppResumoFolha


class AppPrincipal(QWidget):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("App Principal")
        self.setGeometry(400, 200, 460, 440)
        
        layout = QVBoxLayout()

        titulo = QLabel("VAGABS")
        titulo.setProperty("titulo", True)
        sub = QLabel("Escolha a ferramenta que quer abrir")
        sub.setProperty("sub", True)
        layout.addWidget(titulo)
        layout.addWidget(sub)
        
        # Botões para abrir cada janela
        btn_excel1 = QPushButton("Abrir Processamento de Excel")
        btn_excel1.clicked.connect(self.abrir_excel1)
        layout.addWidget(btn_excel1)
        
        btn_excel2 = QPushButton("Abrir Processamento de Excel parte 2")
        btn_excel2.clicked.connect(self.abrir_excel2)
        layout.addWidget(btn_excel2)
        
        btn_avisos = QPushButton("Abrir Monitoramento de Pasta")
        btn_avisos.clicked.connect(self.abrir_avisos)
        layout.addWidget(btn_avisos)
        
        btn_renomear = QPushButton("Abrir Renomeador de Arquivos")
        btn_renomear.clicked.connect(self.abrir_renomear)
        layout.addWidget(btn_renomear)
        
        btn_class = QPushButton("Abrir Classificador do Extrato (Sol)")
        btn_class.clicked.connect(self.abrir_classificador)
        layout.addWidget(btn_class)
        
        btn_dif = QPushButton("Abrir Comparador de Extrato x DDATA")
        btn_dif.clicked.connect(self.abrir_diferenca)
        layout.addWidget(btn_dif)

        btn_resumo = QPushButton("Abrir Resumo da Folha (PDF -> planilha base)")
        btn_resumo.clicked.connect(self.abrir_resumo)
        layout.addWidget(btn_resumo)

        self.setLayout(layout)
        
        # Variáveis separadas para cada janela
        self.janela_excel1 = None
        self.janela_excel2 = None
        self.janela_avisos = None
        self.janela_renomear = None
        self.janela_classificador = None
        self.janela_diferenca = None
        self.janela_resumo = None

    # Métodos para abrir cada janela
    def abrir_excel1(self):
        if self.janela_excel1 is None:
            self.janela_excel1 = AppExcelPrimeiro()
        self.janela_excel1.show()
        
    def abrir_excel2(self):
        if self.janela_excel2 is None:
            self.janela_excel2 = AppExcelSegundo()
        self.janela_excel2.show()
    
    def abrir_avisos(self):
        if self.janela_avisos is None:
            self.janela_avisos = MonitorGUI()
        self.janela_avisos.show()
        
    def abrir_renomear(self):
        if self.janela_renomear is None:
            self.janela_renomear = AppHapvida()
        self.janela_renomear.show()

    def abrir_classificador(self):
        if self.janela_classificador is None:
            self.janela_classificador = AppClassificador()
        self.janela_classificador.show()

    def abrir_diferenca(self):
        if self.janela_diferenca is None:
            self.janela_diferenca = AppPagamentosFaltando()
        self.janela_diferenca.show()

    def abrir_resumo(self):
        if self.janela_resumo is None:
            self.janela_resumo = AppResumoFolha()
        self.janela_resumo.show()


if __name__ == "__main__":
    app = QApplication(sys.argv)
    estilo.aplicar(app)
    principal = AppPrincipal()
    principal.show()
    sys.exit(app.exec())
