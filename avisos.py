import sys
import os
import threading
import queue
import time
from PyQt6.QtWidgets import QApplication, QWidget, QVBoxLayout, QPushButton, QTextEdit, QFileDialog, QLabel
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler

# ===== Fila para comunicação entre thread do Watchdog e GUI =====
event_queue = queue.Queue()

# ===== Classe de eventos do Watchdog =====
class MeuHandler(FileSystemEventHandler):
    def on_created(self, event):
        event_queue.put(f"📂 Criado: {event.src_path}")

    def on_deleted(self, event):
        event_queue.put(f"❌ Deletado: {event.src_path}")

    def on_modified(self, event):
        event_queue.put(f"✏️ Modificado: {event.src_path}")

    def on_moved(self, event):
        event_queue.put(f"➡️ Movido de {event.src_path} para {event.dest_path}")

# ===== Função que roda o Watchdog =====
def monitorar_pasta(path):
    handler = MeuHandler()
    observer = Observer()
    observer.schedule(handler, path, recursive=True)
    observer.start()
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        observer.stop()
    observer.join()

# ===== GUI =====
class MonitorGUI(QWidget):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("Monitor de Pasta")
        self.setGeometry(200, 200, 600, 400)

        layout = QVBoxLayout()

        self.label = QLabel("Escolha a pasta para monitorar:")
        layout.addWidget(self.label)

        self.btn_selecionar = QPushButton("Selecionar Pasta")
        self.btn_selecionar.clicked.connect(self.selecionar_pasta)
        layout.addWidget(self.btn_selecionar)

        self.btn_iniciar = QPushButton("Iniciar Monitoramento")
        self.btn_iniciar.clicked.connect(self.iniciar_monitoramento)
        layout.addWidget(self.btn_iniciar)

        self.log = QTextEdit()
        self.log.setReadOnly(True)
        layout.addWidget(self.log)

        self.setLayout(layout)
        self.pasta = None

        # Timer para atualizar log
        self.start_timer()

    def selecionar_pasta(self):
        pasta = QFileDialog.getExistingDirectory(self, "Escolher pasta")
        if pasta:
            self.pasta = pasta
            self.label.setText(f"Pasta selecionada: {pasta}")

    def iniciar_monitoramento(self):
        if not self.pasta:
            self.log.append("⚠️ Nenhuma pasta selecionada!")
            return
        self.log.append(f"🚀 Monitorando: {self.pasta}")
        t = threading.Thread(target=monitorar_pasta, args=(self.pasta,), daemon=True)
        t.start()

    def start_timer(self):
        # Timer que atualiza o log a cada 500ms
        from PyQt6.QtCore import QTimer
        timer = QTimer(self)
        timer.timeout.connect(self.atualizar_logs)
        timer.start(500)

    def atualizar_logs(self):
        while not event_queue.empty():
            evento = event_queue.get()
            self.log.append(evento)


# ===== Inicialização =====
if __name__ == "__main__":
    app = QApplication(sys.argv)
    window = MonitorGUI()
    window.show()
    sys.exit(app.exec())
