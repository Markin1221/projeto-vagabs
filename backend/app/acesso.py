"""Senha única de acesso: POST /login troca a senha por um token assinado; as demais rotas exigem o token."""
import hashlib
import hmac
import time

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from . import config

router = APIRouter(tags=["acesso"])
ABERTAS = ("/saude", "/login")


def _token() -> str:
    return hmac.new(config.SENHA_ACESSO.encode(), b"vagabs-acesso", hashlib.sha256).hexdigest()


class Login(BaseModel):
    senha: str


@router.post("/login")
def login(d: Login):
    if config.SENHA_ACESSO and not hmac.compare_digest(d.senha.strip(), config.SENHA_ACESSO):
        time.sleep(0.8)  # atrapalha tentativa em massa
        raise HTTPException(401, "Senha incorreta")
    return {"token": _token() if config.SENHA_ACESSO else ""}


async def exigir_token(request, call_next):
    """Middleware: com SENHA_ACESSO definida, toda rota (menos /saude, /login e o preflight do CORS) pede o token."""
    if config.SENHA_ACESSO and request.method != "OPTIONS" and request.url.path not in ABERTAS:
        enviado = request.headers.get("authorization", "").removeprefix("Bearer ").strip()
        if not hmac.compare_digest(enviado, _token()):
            return JSONResponse({"detail": "Acesso negado. Entre com a senha."}, status_code=401)
    return await call_next(request)
