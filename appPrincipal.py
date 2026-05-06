from PyQt6.QtWidgets import QApplication, QWidget, QPushButton, QVBoxLayout
from vagabsCopy import AppExcelPrimeiro   
from appContinued import AppExcelSegundo  
from hapvida import AppHapvida  
from avisos import MonitorGUI  
import openpyxl
import pandas as pd
import numpy as np
import re
import sys
import os
import threading
import queue
import time
from PyQt6.QtWidgets import QApplication, QWidget, QVBoxLayout, QPushButton, QTextEdit, QFileDialog, QLabel
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler


class AppPrincipal(QWidget):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("App Principal")
        self.setGeometry(400, 200, 300, 200)
        
        layout = QVBoxLayout()
        
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
        
        self.setLayout(layout)
        
        # Variáveis separadas para cada janela
        self.janela_excel1 = None
        self.janela_excel2 = None
        self.janela_avisos = None
        self.janela_renomear = None

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

if __name__ == "__main__":
    import sys
    app = QApplication(sys.argv)
    principal = AppPrincipal()
    principal.show()
    sys.exit(app.exec())
