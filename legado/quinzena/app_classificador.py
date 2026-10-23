"""Tela do classificador do extrato (PyQt6), no estilo dos outros módulos do projeto."""
import json
import os
import shutil
import sys

from PyQt6.QtWidgets import QWidget, QLabel, QPushButton, QVBoxLayout, QFileDialog, QTextEdit

from .classificador import classificar
from .extrato import carregar_extrato
from .padroes import aprender_favorecidos, aprender_padroes
from .regras import carregar_regras
from .revisao import exportar_revisao, importar_decisoes

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(AQUI)
if getattr(sys, "frozen", False):
    # dentro do .exe: a config vai embutida; o regras.json fica AO LADO do .exe (assim as regras
    # novas ficam salvas). Na primeira execução copia o regras.json embutido como ponto de partida.
    CONFIG = os.path.join(sys._MEIPASS, "quinzena", "config_classificador.json")
    REGRAS = os.path.join(os.path.dirname(sys.executable), "regras.json")
    _padrao = os.path.join(sys._MEIPASS, "regras.json")
    if not os.path.exists(REGRAS) and os.path.exists(_padrao):
        shutil.copy(_padrao, REGRAS)
else:
    REGRAS = os.path.join(RAIZ, "regras.json")
    CONFIG = os.path.join(AQUI, "config_classificador.json")


class AppClassificador(QWidget):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("Classificador do extrato (DDATA SOL)")
        self.setGeometry(400, 200, 650, 450)
        self.extrato = ""
        lay = QVBoxLayout()
        b1 = QPushButton("1) Selecionar extrato do Sol")
        b1.clicked.connect(self.selecionar)
        self.lbl = QLabel("Nenhum arquivo selecionado")
        b2 = QPushButton("2) Classificar e gerar planilha de revisão")
        b2.clicked.connect(self.classificar)
        b3 = QPushButton("3) Importar decisões da revisão (vira regra nova)")
        b3.clicked.connect(self.importar)
        self.log = QTextEdit(); self.log.setReadOnly(True)
        for w in (b1, self.lbl, b2, b3, self.log):
            lay.addWidget(w)
        self.setLayout(lay)

    def selecionar(self):
        f, _ = QFileDialog.getOpenFileName(self, "Extrato do Sol", "", "Excel (*.xlsx)")
        if f:
            self.extrato = f
            self.lbl.setText(f)

    def classificar(self):
        if not self.extrato:
            self.log.append("Selecione o extrato primeiro."); return
        df = carregar_extrato(self.extrato)
        with open(CONFIG, encoding="utf-8") as fh:
            cfg = json.load(fh)
        out = classificar(df, carregar_regras(REGRAS), aprender_padroes(df), aprender_favorecidos(df), cfg)
        destino = os.path.splitext(self.extrato)[0] + "_revisao.xlsx"
        exportar_revisao(out, destino)
        n = int(out["manual"].sum())
        self.log.append(f"{len(out)} linhas; {len(out) - n} sugeridas, {n} MANUAL.\nRevisão: {destino}")

    def importar(self):
        f, _ = QFileDialog.getOpenFileName(self, "Planilha de revisão preenchida", "", "Excel (*.xlsx)")
        if f:
            self.log.append(f"{importar_decisoes(f, REGRAS)} regra(s) nova(s) gravada(s) em {REGRAS}")
