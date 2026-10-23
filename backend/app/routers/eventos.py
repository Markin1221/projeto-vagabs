from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import CentroCusto, Evento, EventoApelido, ItemDespesa
from ..schemas import ApelidoIn, EventoIn, EventoOut

router = APIRouter(prefix="/eventos", tags=["eventos"])


def _saida(e: Evento) -> EventoOut:
    return EventoOut(
        id=e.id, ordem=e.ordem, codigo_pdf=e.codigo_pdf, nome_pdf=e.nome_pdf, descricao=e.descricao, secao=e.secao,
        tipo_lancamento=e.tipo_lancamento, gera_lancamento=e.gera_lancamento, calculo=e.calculo, ativo=e.ativo, apelidos=[a.nome for a in e.apelidos], apelidos_ids=[a.id for a in e.apelidos], grupo=e.grupo, observacao=e.observacao,
        centro_custo_fixo=e.centro_custo_fixo.codigo if e.centro_custo_fixo else None,
        item_despesa=e.item_despesa.codigo if e.item_despesa else None)


def _aplicar(db: Session, e: Evento, dados: EventoIn) -> None:
    centro = item = None
    if dados.centro_custo_fixo:
        centro = db.scalar(select(CentroCusto).where(CentroCusto.codigo == dados.centro_custo_fixo))
        if not centro:
            raise HTTPException(422, f"Centro de custo '{dados.centro_custo_fixo}' não existe")
    if dados.item_despesa is not None:
        item = db.scalar(select(ItemDespesa).where(ItemDespesa.codigo == dados.item_despesa))
        if not item:
            raise HTTPException(422, f"Item de despesa {dados.item_despesa} não existe")
    if dados.gera_lancamento and (dados.tipo_lancamento is None or item is None):
        raise HTTPException(422, "Evento que gera lançamento precisa de tipo (DEBITO/CREDITO) e item de despesa")
    if dados.ordem is None and e.ordem is None:
        e.ordem = (db.scalar(select(func.max(Evento.ordem)).where(Evento.ordem < 1000)) or 0) + 1
    elif dados.ordem is not None:
        e.ordem = dados.ordem
    e.codigo_pdf, e.nome_pdf, e.descricao, e.secao = dados.codigo_pdf, dados.nome_pdf, dados.descricao, dados.secao
    e.tipo_lancamento, e.gera_lancamento, e.calculo = dados.tipo_lancamento, dados.gera_lancamento, dados.calculo
    e.centro_custo_fixo, e.item_despesa = centro, item
    e.grupo, e.observacao, e.ativo = dados.grupo, dados.observacao, dados.ativo


@router.get("", response_model=list[EventoOut])
def listar(secao: str | None = None, grupo: str | None = None, gera_lancamento: bool | None = None, q: str | None = None,
           db: Session = Depends(get_db)):
    cons = select(Evento).order_by(Evento.ordem)
    if secao:
        cons = cons.where(Evento.secao == secao)
    if grupo:
        cons = cons.where(Evento.grupo == grupo)
    if gera_lancamento is not None:
        cons = cons.where(Evento.gera_lancamento == gera_lancamento)
    if q:
        cons = cons.where(Evento.descricao.ilike(f"%{q}%") | Evento.nome_pdf.ilike(f"%{q}%"))
    return [_saida(e) for e in db.scalars(cons).unique()]


@router.get("/{evento_id}", response_model=EventoOut)
def obter(evento_id: int, db: Session = Depends(get_db)):
    e = db.get(Evento, evento_id)
    if not e:
        raise HTTPException(404, "Evento não encontrado")
    return _saida(e)


@router.post("", response_model=EventoOut, status_code=201)
def cadastrar(dados: EventoIn, db: Session = Depends(get_db)):
    if dados.nome_pdf and db.scalar(select(Evento).where(func.lower(Evento.nome_pdf) == dados.nome_pdf.lower())):
        raise HTTPException(409, f"Já existe um evento com o nome '{dados.nome_pdf}'")
    e = Evento(ordem=None)
    _aplicar(db, e, dados)
    db.add(e)
    db.commit()
    return _saida(e)


@router.put("/{evento_id}", response_model=EventoOut)
def atualizar(evento_id: int, dados: EventoIn, db: Session = Depends(get_db)):
    e = db.get(Evento, evento_id)
    if not e:
        raise HTTPException(404, "Evento não encontrado")
    _aplicar(db, e, dados)
    db.commit()
    return _saida(e)


@router.post("/{evento_id}/apelidos", response_model=EventoOut, status_code=201)
def vincular_apelido(evento_id: int, dados: ApelidoIn, db: Session = Depends(get_db)):
    """Diz que um nome novo do PDF é o mesmo evento (o valor passa a ser somado nele)."""
    e = db.get(Evento, evento_id)
    if not e:
        raise HTTPException(404, "Evento não encontrado")
    nome = dados.nome.strip()
    if db.scalar(select(Evento).where(func.lower(Evento.nome_pdf) == nome.lower())) or \
            db.scalar(select(EventoApelido).where(func.lower(EventoApelido.nome) == nome.lower())):
        raise HTTPException(409, f"'{nome}' já está cadastrado")
    e.apelidos.append(EventoApelido(nome=nome))
    db.commit()
    return _saida(e)


@router.delete("/{evento_id}", status_code=204)
def excluir(evento_id: int, db: Session = Depends(get_db)):
    """Exclui o evento (e os apelidos dele). Para só tirar do CSV sem perder o cadastro, desative (ativo=false)."""
    e = db.get(Evento, evento_id)
    if not e:
        raise HTTPException(404, "Evento não encontrado")
    db.delete(e)
    db.commit()


@router.delete("/{evento_id}/apelidos/{apelido_id}", response_model=EventoOut)
def remover_apelido(evento_id: int, apelido_id: int, db: Session = Depends(get_db)):
    e = db.get(Evento, evento_id)
    ap = db.get(EventoApelido, apelido_id)
    if not e or not ap or ap.evento_id != e.id:
        raise HTTPException(404, "Apelido não encontrado")
    e.apelidos.remove(ap)
    db.commit()
    return _saida(e)
