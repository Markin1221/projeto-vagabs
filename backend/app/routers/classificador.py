from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import classificador
from ..db import get_db
from ..models import RegraClassificacao

router = APIRouter(tags=["classificador"])


class RegraIn(BaseModel):
    kw: str
    nat: str | None = None
    centro: str = ""
    item: str = ""
    fonte: str = ""
    forma: str = ""
    titulo: str = ""


class RegraOut(RegraIn):
    id: int
    model_config = {"from_attributes": True}


def _validar(d: RegraIn) -> RegraIn:
    d.kw = d.kw.strip()
    if not d.kw:
        raise HTTPException(422, "Informe a palavra-chave da regra")
    if d.nat not in (None, "", "DEBITO", "CREDITO"):
        raise HTTPException(422, "Tipo deve ser DEBITO, CREDITO ou vazio (qualquer)")
    d.nat = d.nat or None
    if not (d.centro or d.item):
        raise HTTPException(422, "Informe ao menos o centro de custo ou o item de despesa")
    return d


@router.get("/regras", response_model=list[RegraOut])
def listar(db: Session = Depends(get_db)):
    return db.scalars(select(RegraClassificacao).order_by(RegraClassificacao.id)).all()


@router.post("/regras", response_model=RegraOut, status_code=201)
def criar(d: RegraIn, db: Session = Depends(get_db)):
    d = _validar(d)
    if db.scalar(select(RegraClassificacao).where(RegraClassificacao.kw.ilike(d.kw), RegraClassificacao.nat == d.nat)):
        raise HTTPException(409, f"Já existe uma regra para '{d.kw}' com esse tipo")
    r = RegraClassificacao(**d.model_dump())
    db.add(r); db.commit(); db.refresh(r)
    return r


@router.put("/regras/{rid}", response_model=RegraOut)
def atualizar(rid: int, d: RegraIn, db: Session = Depends(get_db)):
    r = db.get(RegraClassificacao, rid)
    if not r:
        raise HTTPException(404, "Regra não encontrada")
    for k, v in _validar(d).model_dump().items():
        setattr(r, k, v)
    db.commit(); db.refresh(r)
    return r


@router.delete("/regras/{rid}", status_code=204)
def excluir(rid: int, db: Session = Depends(get_db)):
    r = db.get(RegraClassificacao, rid)
    if not r:
        raise HTTPException(404, "Regra não encontrada")
    db.delete(r); db.commit()


async def _classificar(arquivo: UploadFile, db: Session):
    try:
        df = classificador.ler_extrato_sol(await arquivo.read())
    except Exception as e:
        raise HTTPException(422, f"Não consegui ler o extrato do Sol: {e}")
    if df.empty:
        raise HTTPException(422, "Não encontrei lançamentos no arquivo.")
    return [{k: (None if isinstance(v, float) and v != v else v) for k, v in l.items()}
            for l in classificador.classificar(db, df)]


@router.post("/classificador/processar")
async def processar(arquivo: UploadFile = File(...), db: Session = Depends(get_db)):
    linhas = await _classificar(arquivo, db)
    return {"resumo": classificador.resumo(linhas), "linhas": linhas}


@router.post("/classificador/xlsx")
async def baixar(arquivo: UploadFile = File(...), db: Session = Depends(get_db)):
    linhas = await _classificar(arquivo, db)
    return Response(classificador.para_xlsx(linhas),
                    media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    headers={"Content-Disposition": 'attachment; filename="extrato_classificado.xlsx"'})
