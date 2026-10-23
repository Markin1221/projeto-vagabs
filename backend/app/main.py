from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import models  # noqa: F401  (registra as tabelas)
from . import acesso, config
from .config import CORS_ORIGENS
from .routers import centros_custo, classificador, comparador, eventos, folha

app = FastAPI(title="VAGABS API", version="0.1.0")
app.middleware("http")(acesso.exigir_token)  # antes do CORS: o CORS precisa ficar por fora para responder 401 com os cabeçalhos
app.add_middleware(CORSMiddleware, allow_origins=CORS_ORIGENS, allow_methods=["*"], allow_headers=["*"])
app.include_router(acesso.router)
app.include_router(centros_custo.router)
app.include_router(eventos.router)
app.include_router(folha.router)
app.include_router(classificador.router)
app.include_router(comparador.router)


@app.get("/saude")
def saude():
    return {"status": "ok", "protegido": bool(config.SENHA_ACESSO)}
