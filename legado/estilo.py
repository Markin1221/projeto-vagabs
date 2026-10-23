"""Visual único para todos os apps (só PyQt6, sem biblioteca extra).

Uso: depois de criar o QApplication, chame  estilo.aplicar(app).
Todas as janelas abertas depois disso ficam no mesmo padrão automaticamente."""
import re

from PyQt6.QtCore import QEvent, QObject, Qt
from PyQt6.QtWidgets import QDialog, QLabel, QPushButton, QWidget

AZUL = "#2563EB"

TEMA = f"""
QWidget {{ font-family: "Segoe UI", "Noto Sans", "DejaVu Sans", sans-serif; font-size: 10pt; color: #1F2937; }}
QWidget#janela, QDialog {{ background: #F3F5F9; }}
QLabel {{ background: transparent; }}
QLabel[titulo="true"] {{ font-size: 19pt; font-weight: 700; color: #111827; }}
QLabel[sub="true"] {{ color: #64748B; padding-bottom: 6px; }}
QLabel[caminho="true"] {{ color: #64748B; font-size: 9pt; padding: 0 2px 4px 2px; }}

QPushButton {{ background: #FFFFFF; border: 1px solid #D5DBE5; border-radius: 8px; padding: 8px 16px; min-height: 22px; }}
QPushButton:hover {{ background: #EEF4FF; border-color: #93B4F5; }}
QPushButton:pressed {{ background: #DCE8FF; }}
QPushButton:disabled {{ color: #9CA3AF; background: #F1F3F6; border-color: #E5E7EB; }}
QPushButton[acao="true"] {{ background: {AZUL}; border: 1px solid {AZUL}; color: #FFFFFF; font-weight: 600; }}
QPushButton[acao="true"]:hover {{ background: #1D4ED8; border-color: #1D4ED8; }}
QPushButton[acao="true"]:pressed {{ background: #1E40AF; }}
QPushButton[acao="true"]:disabled {{ background: #A9BDF0; border-color: #A9BDF0; color: #FFFFFF; }}
QPushButton[menu="true"] {{ text-align: left; padding: 13px 18px; font-size: 10.5pt; }}

QTextEdit, QPlainTextEdit, QLineEdit {{ background: #FFFFFF; border: 1px solid #D5DBE5; border-radius: 8px; padding: 8px;
    font-family: Consolas, "DejaVu Sans Mono", monospace; font-size: 9.5pt; selection-background-color: {AZUL}; }}
QCheckBox {{ spacing: 8px; padding: 3px 0; }}
QComboBox {{ background: #FFFFFF; border: 1px solid #D5DBE5; border-radius: 6px; padding: 6px 10px; }}
QScrollBar:vertical {{ background: transparent; width: 10px; margin: 2px; }}
QScrollBar::handle:vertical {{ background: #CBD5E1; border-radius: 4px; min-height: 30px; }}
QScrollBar::add-line:vertical, QScrollBar::sub-line:vertical {{ height: 0; }}
"""

_ACOES = re.compile(r"Processar|Gerar|Comparar|Preencher|Classificar|Renomear|Iniciar|Importar", re.I)


def _repolir(w):
    w.style().unpolish(w)
    w.style().polish(w)


def polir(janela: QWidget):
    """Ajusta uma janela: margens, botão principal em azul, rótulos de caminho em cinza."""
    if janela.property("polido"):
        return
    janela.setProperty("polido", True)
    janela.setObjectName("janela")
    lay = janela.layout  # alguns apps fazem self.layout = QVBoxLayout() e escondem o método
    lay = lay() if callable(lay) else lay
    if lay is not None:
        lay.setContentsMargins(22, 20, 22, 20)
        lay.setSpacing(10)
    janela.setMinimumWidth(max(janela.minimumWidth(), 460))
    for b in janela.findChildren(QPushButton):
        texto = b.text().strip()
        if texto.startswith("Abrir"):
            b.setProperty("menu", True)
        elif _ACOES.search(texto):
            b.setProperty("acao", True)
        b.setCursor(Qt.CursorShape.PointingHandCursor)
        _repolir(b)
    for lb in janela.findChildren(QLabel):
        if lb.property("titulo") or lb.property("sub"):
            continue
        lb.setWordWrap(True)  # caminhos longos quebram a linha em vez de alargar a janela
        if lb.text().startswith("Nenhum"):
            lb.setProperty("caminho", True)
            _repolir(lb)
    _repolir(janela)  # aplica o fundo (#janela)


class _Polidor(QObject):
    def eventFilter(self, obj, ev):
        if ev.type() == QEvent.Type.Show and isinstance(obj, QWidget) and obj.isWindow() \
                and not isinstance(obj, QDialog):
            polir(obj)
        return False


def aplicar(app):
    app.setStyle("Fusion")
    app.setStyleSheet(TEMA)
    app._polidor = _Polidor(app)  # guarda a referência
    app.installEventFilter(app._polidor)
