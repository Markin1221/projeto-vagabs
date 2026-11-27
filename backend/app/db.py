from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from .config import DATABASE_URL


class Base(DeclarativeBase):
    pass


engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def criar_colunas_novas(eng) -> list[str]:
    """create_all não mexe em tabela que já existe. Aqui entram as colunas novas (só as que aceitam vazio) que o
    modelo ganhou depois, ex.: `tamanho` no estoque. Não apaga nem altera nada que já está no banco."""
    insp = inspect(eng)
    feitas = []
    with eng.begin() as con:
        for t in Base.metadata.sorted_tables:
            if not insp.has_table(t.name):
                continue
            existentes = {c["name"] for c in insp.get_columns(t.name)}
            for col in t.columns:
                if col.name not in existentes and col.nullable:
                    con.execute(text(f'ALTER TABLE {t.name} ADD COLUMN {col.name} {col.type.compile(eng.dialect)}'))
                    feitas.append(f"{t.name}.{col.name}")
    return feitas
