from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import CentroCusto, ItemDespesa
from ..schemas import CentroCustoOut, ItemDespesaOut

router = APIRouter(tags=["cadastros"])


@router.get("/centros-custo", response_model=list[CentroCustoOut])
def listar_centros(db: Session = Depends(get_db)):
    return db.scalars(select(CentroCusto).order_by(CentroCusto.codigo)).all()


@router.get("/itens-despesa", response_model=list[ItemDespesaOut])
def listar_itens(db: Session = Depends(get_db)):
    return db.scalars(select(ItemDespesa).order_by(ItemDespesa.codigo)).all()
