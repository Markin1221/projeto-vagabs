from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import models  # noqa: F401  (registra as tabelas)
from .config import CORS_ORIGENS
from .routers import centros_custo, eventos, folha

app = FastAPI(title="VAGABS API", version="0.1.0")
app.add_middleware(CORSMiddleware, allow_origins=CORS_ORIGENS, allow_methods=["*"], allow_headers=["*"])
app.include_router(centros_custo.router)
app.include_router(eventos.router)
app.include_router(folha.router)


@app.get("/saude")
def saude():
    return {"status": "ok"}
