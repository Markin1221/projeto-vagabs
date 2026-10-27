from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import models  # noqa: F401  (registra as tabelas)
from . import acesso, config
from .config import CORS_ORIGENS
from .db import Base, engine
from .routers import centros_custo, classificador, comparador, eventos, folha, quinzena

@asynccontextmanager
async def ciclo_de_vida(_):
    """Cria as tabelas que ainda não existem (ex.: tabela nova após uma atualização), sem apagar dados."""
    try:
        Base.metadata.create_all(engine)
    except Exception as e:  # banco fora do ar: a API sobe mesmo assim e os erros aparecem nas rotas
        print("Aviso: não consegui criar as tabelas:", e)
    yield


app = FastAPI(title="VAGABS API", version="0.1.0", lifespan=ciclo_de_vida)
app.middleware("http")(acesso.exigir_token)  # antes do CORS: o CORS precisa ficar por fora para responder 401 com os cabeçalhos
app.add_middleware(CORSMiddleware, allow_origins=CORS_ORIGENS, allow_methods=["*"], allow_headers=["*"])
app.include_router(acesso.router)
app.include_router(centros_custo.router)
app.include_router(eventos.router)
app.include_router(folha.router)
app.include_router(classificador.router)
app.include_router(comparador.router)
app.include_router(quinzena.router)


@app.get("/saude")
def saude():
    return {"status": "ok", "protegido": bool(config.SENHA_ACESSO)}
