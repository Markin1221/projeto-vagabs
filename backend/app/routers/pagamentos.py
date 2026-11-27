"""Calendário de pagamentos do financeiro: pagamentos que se repetem (diário, semanal ou mensal), em quais dias caem,
até quando (ou sem fim) e o que já foi pago em cada dia. A tela abre no "pagar hoje" para ninguém esquecer."""
import calendar
from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import BaixaPagamento, PagamentoAgendado

router = APIRouter(prefix="/pagamentos", tags=["pagamentos"])

FREQUENCIAS = ("DIARIO", "SEMANAL", "MENSAL")
SEMANA = ["segunda", "terça", "quarta", "quinta", "sexta", "sábado", "domingo"]
DIAS_ATRASO = 60  # até quantos dias para trás um pagamento não marcado aparece como atrasado
MAX_PERIODO = 400


def _lista_dias(s: str | None) -> list[int]:
    return sorted({int(x) for x in (s or "").split(",") if x.strip()})


def ocorre(p: PagamentoAgendado, d: date) -> bool:
    """O pagamento cai no dia `d`?"""
    if not p.ativo or d < p.inicio or (p.fim and d > p.fim):
        return False
    dias = _lista_dias(p.dias)
    if p.frequencia == "DIARIO":
        return not dias or d.weekday() in dias
    if p.frequencia == "SEMANAL":
        return d.weekday() in dias
    ultimo = calendar.monthrange(d.year, d.month)[1]  # MENSAL: dia 31 em mês de 30 cai no dia 30
    return d.day in dias or (d.day == ultimo and any(x > ultimo for x in dias))


def descrever(p: PagamentoAgendado) -> str:
    """'Todo mês no dia 5 e 20', 'Toda segunda e sexta', 'Todo dia'..."""
    dias = _lista_dias(p.dias)
    juntar = lambda xs: xs[0] if len(xs) == 1 else ", ".join(xs[:-1]) + " e " + xs[-1]
    if p.frequencia == "MENSAL":
        txt = f"Todo mês no dia {juntar([str(x) for x in dias])}"
    elif p.frequencia == "DIARIO" and (not dias or len(dias) == 7):
        txt = "Todo dia"
    elif p.frequencia == "DIARIO" and dias == [0, 1, 2, 3, 4]:
        txt = "Todo dia útil (segunda a sexta)"
    else:
        txt = ("Todo dia de " if p.frequencia == "DIARIO" else "Toda ") + juntar([SEMANA[x] for x in dias])
    return txt + (f", até {p.fim:%d/%m/%Y}" if p.fim else ", sem prazo para acabar")


class PagamentoIn(BaseModel):
    titulo: str
    detalhes: str | None = None
    valor: float | None = Field(None, ge=0)
    frequencia: str
    dias: list[int] = []
    inicio: date | None = None
    fim: date | None = None  # vazio = sem fim
    observacao: str | None = None
    ativo: bool = True


class PagamentoOut(BaseModel):
    id: int
    titulo: str
    detalhes: str | None
    valor: float | None
    frequencia: str
    dias: list[int]
    inicio: date
    fim: date | None
    observacao: str | None
    ativo: bool
    descricao: str


def _out(p: PagamentoAgendado) -> dict:
    return {"id": p.id, "titulo": p.titulo, "detalhes": p.detalhes, "valor": float(p.valor) if p.valor is not None else None,
            "frequencia": p.frequencia, "dias": _lista_dias(p.dias), "inicio": p.inicio, "fim": p.fim,
            "observacao": p.observacao, "ativo": p.ativo, "descricao": descrever(p)}


def _validar(d: PagamentoIn) -> dict:
    titulo = " ".join(d.titulo.split())
    if not titulo:
        raise HTTPException(422, "Informe o que é para pagar")
    freq = (d.frequencia or "").upper()
    if freq not in FREQUENCIAS:
        raise HTTPException(422, "Frequência deve ser diária, semanal ou mensal")
    dias = sorted(set(d.dias))
    if freq == "MENSAL":
        if not dias:
            raise HTTPException(422, "Escolha em quais dias do mês o pagamento cai")
        if any(x < 1 or x > 31 for x in dias):
            raise HTTPException(422, "Dia do mês deve ser de 1 a 31")
    else:
        if freq == "SEMANAL" and not dias:
            raise HTTPException(422, "Escolha em quais dias da semana o pagamento cai")
        if any(x < 0 or x > 6 for x in dias):
            raise HTTPException(422, "Dia da semana inválido")
    inicio = d.inicio or date.today()
    if d.fim and d.fim < inicio:
        raise HTTPException(422, "A data final não pode ser antes do início")
    return {"titulo": titulo, "detalhes": (d.detalhes or "").strip() or None, "valor": d.valor, "frequencia": freq,
            "dias": ",".join(map(str, dias)), "inicio": inicio, "fim": d.fim,
            "observacao": (d.observacao or "").strip() or None, "ativo": d.ativo}


def _pag(db: Session, pid: int) -> PagamentoAgendado:
    p = db.get(PagamentoAgendado, pid)
    if not p:
        raise HTTPException(404, "Pagamento não encontrado")
    return p


@router.get("", response_model=list[PagamentoOut])
def listar(db: Session = Depends(get_db)):
    return [_out(p) for p in db.scalars(select(PagamentoAgendado).order_by(PagamentoAgendado.titulo)).all()]


@router.post("", response_model=PagamentoOut, status_code=201)
def criar(d: PagamentoIn, db: Session = Depends(get_db)):
    p = PagamentoAgendado(**_validar(d))
    db.add(p); db.commit(); db.refresh(p)
    return _out(p)


@router.put("/{pid}", response_model=PagamentoOut)
def editar(pid: int, d: PagamentoIn, db: Session = Depends(get_db)):
    p = _pag(db, pid)
    for k, v in _validar(d).items():
        setattr(p, k, v)
    db.commit(); db.refresh(p)
    return _out(p)


@router.delete("/{pid}", status_code=204)
def excluir(pid: int, db: Session = Depends(get_db)):
    """Apaga o pagamento e o que já foi marcado como pago dele."""
    db.delete(_pag(db, pid)); db.commit()


def _agenda(db: Session, de: date, ate: date) -> list[dict]:
    pags = db.scalars(select(PagamentoAgendado).where(PagamentoAgendado.ativo.is_(True))).all()
    baixas = {(b.pagamento_id, b.data): b.pago_em for b in
              db.scalars(select(BaixaPagamento).where(BaixaPagamento.data >= de, BaixaPagamento.data <= ate))}
    itens, d = [], de
    while d <= ate:
        for p in pags:
            if ocorre(p, d):
                pago = baixas.get((p.id, d))
                itens.append({"data": d, "pagamento_id": p.id, "titulo": p.titulo, "detalhes": p.detalhes,
                              "valor": float(p.valor) if p.valor is not None else None,
                              "pago": pago is not None, "pago_em": pago})
        d += timedelta(days=1)
    return sorted(itens, key=lambda i: (i["data"], i["titulo"].lower()))


@router.get("/agenda")
def agenda(de: date, ate: date, db: Session = Depends(get_db)):
    """Todos os pagamentos que caem entre `de` e `ate`, dizendo se já foram pagos."""
    if ate < de:
        raise HTTPException(422, "Período inválido")
    if (ate - de).days > MAX_PERIODO:
        raise HTTPException(422, f"Período muito grande (máximo {MAX_PERIODO} dias)")
    return _agenda(db, de, ate)


@router.get("/hoje")
def do_dia(data: date | None = None, db: Session = Depends(get_db)):
    """O que tem para pagar hoje e o que ficou para trás (até 60 dias) sem marcar como pago."""
    hoje = data or date.today()
    lista = _agenda(db, hoje - timedelta(days=DIAS_ATRASO), hoje)
    return {"data": hoje, "hoje": [i for i in lista if i["data"] == hoje],
            "atrasados": [i for i in lista if i["data"] < hoje and not i["pago"]]}


class PagarIn(BaseModel):
    data: date
    pago_em: date | None = None


@router.post("/{pid}/pagar", status_code=201)
def pagar(pid: int, d: PagarIn, db: Session = Depends(get_db)):
    """Marca como pago o pagamento do dia `data`."""
    p = _pag(db, pid)
    if not ocorre(p, d.data):
        raise HTTPException(422, f"'{p.titulo}' não cai em {d.data:%d/%m/%Y}")
    b = db.scalar(select(BaixaPagamento).where(BaixaPagamento.pagamento_id == pid, BaixaPagamento.data == d.data))
    if not b:
        b = BaixaPagamento(pagamento_id=pid, data=d.data, pago_em=d.pago_em or date.today())
        db.add(b); db.commit()
    return {"pagamento_id": pid, "data": b.data, "pago_em": b.pago_em}


@router.delete("/{pid}/pagar/{dia}", status_code=204)
def desmarcar(pid: int, dia: date, db: Session = Depends(get_db)):
    """Desfaz o 'paguei' daquele dia."""
    b = db.scalar(select(BaixaPagamento).where(BaixaPagamento.pagamento_id == pid, BaixaPagamento.data == dia))
    if b:
        db.delete(b); db.commit()
