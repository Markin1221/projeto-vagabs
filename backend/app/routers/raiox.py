"""Raio-X do caixa: aba protegida por uma senha própria (RAIOX_SENHA), além da senha geral do sistema.

POST /raiox/login           troca a senha do Raio-X por um token (mandado depois no cabeçalho X-Raiox-Token)
GET  /raiox/meses           histórico salvo (época boa + meses enviados)
POST /raiox/analisar        prévia de um extrato mensal, comparada com o histórico (não salva)
POST /raiox/salvar          analisa o extrato e grava o mês (substitui se já existir)
DELETE /raiox/meses/{id}    apaga um mês
POST /raiox/meses/{id}/parecer   pede o parecer à IA (Anthropic) e guarda no mês
GET  /raiox/completa       análise do período inteiro (empréstimos e devoluções entre meses se compensam)
POST /raiox/completa/parecer     parecer da IA sobre o período inteiro
"""
import hashlib
import hmac
import json
import time

import httpx
from fastapi import APIRouter, Depends, File, Header, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import config
from .. import raiox as rx
from ..db import get_db
from ..models import RaioxMes, RaioxParecer
from ..seed.carregar import carregar_raiox_base

router = APIRouter(prefix="/raiox", tags=["raiox"])


def _token() -> str:
    return hmac.new(config.RAIOX_SENHA.encode(), b"vagabs-raiox", hashlib.sha256).hexdigest()


def exigir_raiox(x_raiox_token: str = Header(default="")):
    if not hmac.compare_digest(x_raiox_token.strip(), _token()):
        raise HTTPException(403, "Área protegida. Entre com a senha do Raio-X.")


class Login(BaseModel):
    senha: str


@router.post("/login")
def login(d: Login):
    if not hmac.compare_digest(d.senha.strip(), config.RAIOX_SENHA):
        time.sleep(0.8)
        raise HTTPException(403, "Senha do Raio-X incorreta")
    return {"token": _token()}


def _doc(m: RaioxMes) -> dict:
    d = json.loads(m.dados)
    d["parecer"], d["parecerEm"] = m.parecer, m.parecer_em
    return d


def _historico(db: Session) -> list[dict]:
    carregar_raiox_base(db)
    return [_doc(m) for m in db.scalars(select(RaioxMes).order_by(RaioxMes.id))]


async def _processar(arquivo: UploadFile, db: Session) -> dict:
    try:
        return rx.processar(await arquivo.read(), arquivo.filename or "", _historico(db))
    except ValueError as e:
        raise HTTPException(422, str(e))
    except Exception as e:
        raise HTTPException(422, f"Não consegui ler a planilha: {e}")


@router.get("/meses", dependencies=[Depends(exigir_raiox)])
def meses(db: Session = Depends(get_db)):
    return _historico(db)


@router.post("/analisar", dependencies=[Depends(exigir_raiox)])
async def analisar(arquivo: UploadFile = File(...), db: Session = Depends(get_db)):
    doc = await _processar(arquivo, db)
    doc["jaExiste"] = db.get(RaioxMes, doc["id"]) is not None
    return doc


@router.post("/salvar", dependencies=[Depends(exigir_raiox)])
async def salvar(arquivo: UploadFile = File(...), db: Session = Depends(get_db)):
    doc = await _processar(arquivo, db)
    m = db.get(RaioxMes, doc["id"])
    if m is None:
        m = RaioxMes(id=doc["id"])
        db.add(m)
    m.rotulo, m.formato, m.arquivo, m.enviado_em = doc["rotulo"], doc["formato"], doc["arquivo"], doc["enviadoEm"]
    m.dados, m.parecer, m.parecer_em = json.dumps(doc, ensure_ascii=False, default=str), None, None
    db.commit()
    return _doc(m)


@router.delete("/meses/{mes_id}", dependencies=[Depends(exigir_raiox)])
def apagar(mes_id: str, db: Session = Depends(get_db)):
    m = db.get(RaioxMes, mes_id)
    if m is None:
        raise HTTPException(404, "Mês não encontrado")
    db.delete(m)
    db.commit()
    return {"ok": True}


def pedir_parecer(prompt: str) -> str:
    """Chama a API da Anthropic. Separado para os testes poderem trocar por um falso."""
    if not config.ANTHROPIC_API_KEY:
        raise HTTPException(503, "Parecer com IA desligado: defina ANTHROPIC_API_KEY no backend/.env (ou no Render).")
    try:
        r = httpx.post("https://api.anthropic.com/v1/messages", timeout=180,
                       headers={"x-api-key": config.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json"},
                       json={"model": config.RAIOX_MODELO, "max_tokens": 3000, "messages": [{"role": "user", "content": prompt}]})
    except httpx.HTTPError as e:
        raise HTTPException(502, f"Não consegui falar com a IA: {e}")
    if r.status_code != 200:
        raise HTTPException(502, f"A IA recusou o pedido ({r.status_code}): {r.text[:300]}")
    return "".join(b.get("text", "") for b in r.json().get("content", []) if b.get("type") == "text").strip()


@router.post("/meses/{mes_id}/parecer", dependencies=[Depends(exigir_raiox)])
def parecer(mes_id: str, db: Session = Depends(get_db)):
    m = db.get(RaioxMes, mes_id)
    if m is None:
        raise HTTPException(404, "Mês não encontrado. Salve o mês antes de pedir o parecer.")
    if m.formato != "novo":
        raise HTTPException(422, "Os meses de referência (formato antigo) não têm parecer.")
    hist = _historico(db)
    texto = pedir_parecer(rx.prompt_parecer(_doc(m), hist))
    m.parecer, m.parecer_em = texto, time.strftime("%Y-%m-%dT%H:%M:%S")
    db.commit()
    return {"parecer": texto, "parecerEm": m.parecer_em}


@router.get("/completa", dependencies=[Depends(exigir_raiox)])
def completa(db: Session = Depends(get_db)):
    c = rx.analise_completa(_historico(db))
    p = db.get(RaioxParecer, "completa")
    c["parecer"], c["parecerEm"], c["parecerMeses"] = (p.texto, p.em, p.meses) if p else (None, None, None)
    return c


@router.post("/completa/parecer", dependencies=[Depends(exigir_raiox)])
def parecer_completa(db: Session = Depends(get_db)):
    hist = _historico(db)
    c = rx.analise_completa(hist)
    if not c["meses"]:
        raise HTTPException(422, "Salve pelo menos um mês no formato novo antes de pedir a análise completa.")
    texto = pedir_parecer(rx.prompt_completa(c, hist))
    p = db.get(RaioxParecer, "completa") or RaioxParecer(id="completa")
    p.texto, p.em, p.meses = texto, time.strftime("%Y-%m-%dT%H:%M:%S"), c["periodo"]
    db.add(p)
    db.commit()
    return {"parecer": texto, "parecerEm": p.em, "parecerMeses": p.meses}
