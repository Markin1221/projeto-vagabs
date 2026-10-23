import os
from pathlib import Path


def _carregar_env() -> None:
    """Lê backend/.env (se existir). Variáveis já definidas no ambiente têm prioridade."""
    arq = Path(__file__).resolve().parent.parent / ".env"
    if not arq.is_file():
        return
    for linha in arq.read_text(encoding="utf-8-sig").splitlines():
        linha = linha.strip()
        if not linha or linha.startswith("#") or "=" not in linha:
            continue
        chave, valor = linha.split("=", 1)
        os.environ.setdefault(chave.strip(), valor.strip().strip('"').strip("'"))


_carregar_env()

# PostgreSQL por padrão (ver docker-compose.yml, porta 5433). Nos testes usa-se SQLite em memória.
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+psycopg://vagabs:vagabs@localhost:5433/vagabs")
# Neon/Render entregam "postgresql://..." ou "postgres://...": o SQLAlchemy precisa do driver psycopg explícito
for _prefixo in ("postgres://", "postgresql://"):
    if DATABASE_URL.startswith(_prefixo):
        DATABASE_URL = "postgresql+psycopg://" + DATABASE_URL[len(_prefixo):]
CORS_ORIGENS = [o.strip().rstrip("/") for o in os.getenv("CORS_ORIGENS", "http://localhost:3000").split(",") if o.strip()]  # frontend Next.js

# Senha de acesso ao sistema. Vazia = sem senha (uso local). No Render, defina SENHA_ACESSO.
SENHA_ACESSO = os.getenv("SENHA_ACESSO", "").strip()  # copiar/colar costuma trazer espaço ou quebra de linha no fim
