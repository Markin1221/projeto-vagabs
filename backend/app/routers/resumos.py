"""Resumos financeiros (área secreta): usa o mesmo token do Raio-X (cabeçalho X-Raiox-Token).

GET  /resumos/custos                custos fixos guardados (faixas de meses por categoria)
PUT  /resumos/custos                substitui os custos fixos
POST /resumos/custos/texto          lê faixas de um texto colado (ex.: mensagens do WhatsApp); não salva
POST /resumos/custos/planilha       lê faixas de uma planilha ("3350,00 - 01/25"); não salva
POST /resumos/previa                confere os relatórios enviados e mostra as contas de cada mês
POST /resumos/gerar                 devolve um .zip com cada mês tratado + o resumo de todos (formato: xlsx, pdf ou ambos)
"""
import json

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from .. import resumos as rs
from ..db import get_db
from ..models import ResumoCustos
from .raiox import exigir_raiox

router = APIRouter(prefix="/resumos", tags=["resumos"], dependencies=[Depends(exigir_raiox)])
MES = r"^\d{4}-(0[1-9]|1[0-2])$"


class Faixa(BaseModel):
    de: str = Field(pattern=MES)
    ate: str | None = Field(default=None, pattern=MES)
    valor: float


class Custos(BaseModel):
    motorista1: list[Faixa] = []
    motorista2: list[Faixa] = []
    permissionario: list[Faixa] = []


class Texto(BaseModel):
    texto: str
    categoria: str = "auto"


def ler_custos(db: Session) -> dict:
    c = db.get(ResumoCustos, "custos")
    d = json.loads(c.dados) if c else {}
    return {k: d.get(k, []) for k in rs.CATEGORIAS}


@router.get("/custos")
def custos(db: Session = Depends(get_db)):
    return ler_custos(db)


@router.put("/custos")
def salvar_custos(d: Custos, db: Session = Depends(get_db)):
    for lista in (d.motorista1, d.motorista2, d.permissionario):
        for f in lista:
            if f.ate and f.ate < f.de:
                raise HTTPException(422, f"Faixa invertida: {rs.rotulo(f.de)} até {rs.rotulo(f.ate)}.")
    c = db.get(ResumoCustos, "custos") or ResumoCustos(id="custos")
    c.dados = d.model_dump_json()
    db.add(c)
    db.commit()
    return ler_custos(db)


def _checar_cat(categoria: str):
    if categoria not in ("auto", "motoristas", *rs.CATEGORIAS):
        raise HTTPException(422, "Categoria inválida")


@router.post("/custos/texto")
def custos_texto(d: Texto):
    _checar_cat(d.categoria)
    return rs.ler_texto(d.texto, d.categoria)


@router.post("/custos/planilha")
async def custos_planilha(arquivo: UploadFile = File(...), categoria: str = Form("auto")):
    _checar_cat(categoria)
    try:
        return rs.ler_planilha_custos(await arquivo.read(), categoria)
    except Exception as e:
        raise HTTPException(422, f"Não consegui ler a planilha de custos: {e}")


async def _arquivos(arquivos: list[UploadFile]) -> list[tuple[str, bytes]]:
    if not arquivos:
        raise HTTPException(422, "Envie pelo menos um relatório.")
    return [(a.filename or "relatorio.xlsx", await a.read()) for a in arquivos]


@router.post("/previa")
async def previa(arquivos: list[UploadFile] = File(...), db: Session = Depends(get_db)):
    custos, meses, erros = ler_custos(db), [], []
    for nome, conteudo in await _arquivos(arquivos):
        try:
            meses.append(rs.calcular(rs.ler_relatorio(conteudo, nome), custos))
        except Exception as e:
            erros.append(str(e) if isinstance(e, ValueError) else f"{nome}: {e}")
    meses.sort(key=lambda m: m["id"])
    return {"meses": meses, "erros": erros, "saldoTotal": round(sum(m["saldo"] for m in meses), 2)}


@router.post("/gerar")
async def gerar(arquivos: list[UploadFile] = File(...), formato: str = Form("xlsx"), db: Session = Depends(get_db)):
    if formato not in ("xlsx", "pdf", "ambos"):
        raise HTTPException(422, "Formato inválido (xlsx, pdf ou ambos)")
    try:
        conteudo, nome = rs.gerar_zip(await _arquivos(arquivos), ler_custos(db), formato)
    except ValueError as e:
        raise HTTPException(422, str(e))
    return Response(conteudo, media_type="application/zip", headers={"Content-Disposition": f'attachment; filename="{nome}"'})
