"""Estoque do administrativo: produtos, entradas/saídas (quem pegou e quando) e pedidos (quem já pediu)."""
import unicodedata
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import MovimentoEstoque, PedidoEstoque, ProdutoEstoque, TamanhoEstoque

router = APIRouter(prefix="/estoque", tags=["estoque"])

PARTICULAS = {"da", "de", "do", "das", "dos", "e"}


def nome_pessoa(p: str | None) -> str:
    """'  joão  DA silva ' -> 'João da Silva' (assim a mesma pessoa não aparece duas vezes)."""
    partes = (p or "").split()
    return " ".join(w.lower() if i and w.lower() in PARTICULAS else w.capitalize() for i, w in enumerate(partes))


def chave_pessoa(p: str | None) -> str:
    """Para comparar nomes: sem acento, minúsculo e sem 'da/de/do'. 'Joao Silva' == 'João da Silva'."""
    s = unicodedata.normalize("NFD", p or "").encode("ascii", "ignore").decode().lower()
    return " ".join(w for w in s.split() if w not in PARTICULAS)


def pessoa_canonica(db: Session, p: str | None) -> str:
    """Se já existe alguém com o mesmo nome escrito de outro jeito, usa a grafia que já está gravada."""
    n = nome_pessoa(p)
    if not n:
        return ""
    k = chave_pessoa(n)
    gravados = set(db.scalars(select(MovimentoEstoque.pessoa).where(MovimentoEstoque.pessoa.is_not(None)).distinct())) | \
        set(db.scalars(select(PedidoEstoque.pessoa).distinct()))
    return next((g for g in sorted(gravados) if chave_pessoa(g) == k), n)


# ---------- produtos ----------
class ProdutoIn(BaseModel):
    nome: str
    unidade: str = "un"
    minimo: int = Field(0, ge=0)
    ativo: bool = True
    tamanhos: list[str] | None = None  # None = não mexe; [] = produto sem tamanho


class TamanhoOut(BaseModel):
    tamanho: str
    saldo: int
    model_config = {"from_attributes": True}


class ProdutoOut(BaseModel):
    id: int
    nome: str
    unidade: str
    minimo: int
    ativo: bool
    saldo: int
    tamanhos: list[TamanhoOut]
    model_config = {"from_attributes": True}


def nome_tamanho(t: str | None) -> str:
    """' gg ' -> 'GG'; '38' fica '38'."""
    return " ".join((t or "").split()).upper()


def _tam(p: ProdutoEstoque, t: str | None, criar: bool = False) -> TamanhoEstoque | None:
    """O tamanho `t` do produto. Produto sem tamanhos: None (e não aceita tamanho, a não ser que `criar`).
    Com tamanhos: o tamanho é obrigatório; se `criar` (entrada), um tamanho novo é cadastrado na hora."""
    t = nome_tamanho(t)
    if not p.tamanhos and not (criar and t):
        if t:
            raise HTTPException(422, f"'{p.nome}' não tem tamanhos")
        return None
    if not t:
        raise HTTPException(422, f"Escolha o tamanho de '{p.nome}' ({', '.join(x.tamanho for x in p.tamanhos)})")
    achado = next((x for x in p.tamanhos if x.tamanho == t), None)
    if achado:
        return achado
    if not criar:
        raise HTTPException(422, f"'{p.nome}' não tem o tamanho {t}")
    if not p.tamanhos and p.saldo:
        raise HTTPException(422, f"'{p.nome}' tem {p.saldo} {p.unidade} sem tamanho. Zere o estoque dele antes de separar por tamanho.")
    novo = TamanhoEstoque(tamanho=t, saldo=0, ordem=len(p.tamanhos))
    p.tamanhos.append(novo)
    return novo


def _ajustar(p: ProdutoEstoque, tam: TamanhoEstoque | None, delta: int, acao: str = "") -> None:
    """Único lugar que mexe no saldo: no produto e, se tiver, no tamanho. Nunca deixa ficar negativo."""
    atual = tam.saldo if tam else p.saldo
    if atual + delta < 0:
        onde = f"{p.nome} ({tam.tamanho})" if tam else p.nome
        raise HTTPException(422, f"Só tem {atual} {p.unidade} de '{onde}' no estoque{acao}")
    if tam:
        tam.saldo += delta
    p.saldo += delta


def _sincronizar_tamanhos(p: ProdutoEstoque, lista: list[str] | None) -> None:
    if lista is None:
        return
    nomes = list(dict.fromkeys(n for n in (nome_tamanho(t) for t in lista) if n))
    if nomes and not p.tamanhos and p.saldo:
        raise HTTPException(422, f"'{p.nome}' tem {p.saldo} {p.unidade} sem tamanho. Zere o estoque dele antes de separar por tamanho.")
    for t in list(p.tamanhos):
        if t.tamanho not in nomes:
            if t.saldo:
                raise HTTPException(422, f"O tamanho {t.tamanho} ainda tem {t.saldo} no estoque. Só dá para tirar tamanho zerado.")
            p.tamanhos.remove(t)
    existentes = {t.tamanho: t for t in p.tamanhos}
    for i, n in enumerate(nomes):
        t = existentes.get(n)
        if not t:
            t = TamanhoEstoque(tamanho=n, saldo=0)
            p.tamanhos.append(t)
        t.ordem = i
    p.tamanhos.sort(key=lambda t: t.ordem)


def _produto(db: Session, pid: int) -> ProdutoEstoque:
    p = db.get(ProdutoEstoque, pid)
    if not p:
        raise HTTPException(404, "Produto não encontrado")
    return p


@router.get("/produtos", response_model=list[ProdutoOut])
def listar_produtos(todos: bool = False, db: Session = Depends(get_db)):
    q = select(ProdutoEstoque).order_by(ProdutoEstoque.nome)
    return db.scalars(q if todos else q.where(ProdutoEstoque.ativo.is_(True))).all()


def _validar_produto(d: ProdutoIn, db: Session, pid: int | None = None) -> str:
    nome = " ".join(d.nome.split())
    if not nome:
        raise HTTPException(422, "Informe o nome do produto")
    outro = db.scalar(select(ProdutoEstoque).where(ProdutoEstoque.nome == nome, ProdutoEstoque.id != (pid or 0)))
    if outro:
        raise HTTPException(409, f"Já existe o produto '{nome}'")
    return nome


@router.post("/produtos", response_model=ProdutoOut, status_code=201)
def criar_produto(d: ProdutoIn, db: Session = Depends(get_db)):
    p = ProdutoEstoque(nome=_validar_produto(d, db), unidade=d.unidade.strip() or "un", minimo=d.minimo, ativo=d.ativo, saldo=0)
    _sincronizar_tamanhos(p, d.tamanhos)
    db.add(p); db.commit(); db.refresh(p)
    return p


@router.put("/produtos/{pid}", response_model=ProdutoOut)
def atualizar_produto(pid: int, d: ProdutoIn, db: Session = Depends(get_db)):
    p = _produto(db, pid)
    p.nome, p.unidade, p.minimo, p.ativo = _validar_produto(d, db, pid), d.unidade.strip() or "un", d.minimo, d.ativo
    try:
        _sincronizar_tamanhos(p, d.tamanhos)
    except HTTPException:
        db.rollback()
        raise
    db.commit(); db.refresh(p)
    return p


@router.delete("/produtos/{pid}", status_code=204)
def excluir_produto(pid: int, db: Session = Depends(get_db)):
    p = _produto(db, pid)
    usado = db.scalar(select(MovimentoEstoque.id).where(MovimentoEstoque.produto_id == pid).limit(1)) or \
        db.scalar(select(PedidoEstoque.id).where(PedidoEstoque.produto_id == pid).limit(1))
    if usado:
        raise HTTPException(409, "Esse produto já tem movimentos ou pedidos. Desative em vez de excluir.")
    db.delete(p); db.commit()


# ---------- movimentos (entradas e saídas) ----------
class MovimentoIn(BaseModel):
    produto_id: int
    tipo: str  # ENTRADA | SAIDA
    quantidade: int = Field(gt=0)
    tamanho: str | None = None
    pessoa: str | None = None
    data: date | None = None
    observacao: str | None = None


class MovimentoOut(BaseModel):
    id: int
    produto_id: int
    produto: str
    unidade: str
    tipo: str
    quantidade: int
    tamanho: str | None
    pessoa: str | None
    data: date
    observacao: str | None
    pedido_id: int | None


def _mov_out(m: MovimentoEstoque) -> dict:
    return {"id": m.id, "produto_id": m.produto_id, "produto": m.produto.nome, "unidade": m.produto.unidade, "tipo": m.tipo,
            "quantidade": m.quantidade, "tamanho": m.tamanho, "pessoa": m.pessoa, "data": m.data, "observacao": m.observacao, "pedido_id": m.pedido_id}


def _tam_do_mov(m: MovimentoEstoque) -> TamanhoEstoque | None:
    return next((t for t in m.produto.tamanhos if t.tamanho == m.tamanho), None) if m.tamanho else None


def _movimentar(db: Session, p: ProdutoEstoque, tipo: str, qtd: int, pessoa: str | None, dt: date | None,
                obs: str | None = None, pedido_id: int | None = None, tamanho: str | None = None) -> MovimentoEstoque:
    if tipo not in ("ENTRADA", "SAIDA"):
        raise HTTPException(422, "Tipo deve ser ENTRADA ou SAIDA")
    pessoa = pessoa_canonica(db, pessoa) or None
    if tipo == "SAIDA" and not pessoa:
        raise HTTPException(422, "Na saída, informe quem pegou")
    tam = _tam(p, tamanho, criar=tipo == "ENTRADA")  # entrada de um tamanho novo já cadastra o tamanho
    _ajustar(p, tam, qtd if tipo == "ENTRADA" else -qtd)
    m = MovimentoEstoque(produto=p, tipo=tipo, quantidade=qtd, tamanho=tam.tamanho if tam else None,
                         pessoa=pessoa, data=dt or date.today(),
                         observacao=(obs or "").strip() or None, pedido_id=pedido_id)
    db.add(m)
    return m


@router.get("/movimentos", response_model=list[MovimentoOut])
def listar_movimentos(pessoa: str | None = None, produto_id: int | None = None, tipo: str | None = None,
                      limite: int = 300, db: Session = Depends(get_db)):
    q = select(MovimentoEstoque).order_by(MovimentoEstoque.data.desc(), MovimentoEstoque.id.desc()).limit(limite)
    if pessoa:
        q = q.where(MovimentoEstoque.pessoa == pessoa_canonica(db, pessoa))
    if produto_id:
        q = q.where(MovimentoEstoque.produto_id == produto_id)
    if tipo:
        q = q.where(MovimentoEstoque.tipo == tipo)
    return [_mov_out(m) for m in db.scalars(q).all()]


@router.post("/movimentos", response_model=MovimentoOut, status_code=201)
def criar_movimento(d: MovimentoIn, db: Session = Depends(get_db)):
    try:
        m = _movimentar(db, _produto(db, d.produto_id), d.tipo, d.quantidade, d.pessoa, d.data, d.observacao, tamanho=d.tamanho)
    except HTTPException:
        db.rollback()
        raise
    db.commit(); db.refresh(m)
    return _mov_out(m)


class ItemSaida(BaseModel):
    produto_id: int
    quantidade: int = Field(gt=0)
    tamanho: str | None = None


class SaidaIn(BaseModel):
    pessoa: str
    data: date | None = None
    observacao: str | None = None
    itens: list[ItemSaida] = Field(min_length=1)


@router.post("/saidas", response_model=list[MovimentoOut], status_code=201)
def registrar_saida(d: SaidaIn, db: Session = Depends(get_db)):
    """Uma pessoa pegou vários produtos de uma vez. Ou registra tudo, ou nada (se faltar estoque de algum)."""
    try:
        movs = [_movimentar(db, _produto(db, it.produto_id), "SAIDA", it.quantidade, d.pessoa, d.data, d.observacao,
                            tamanho=it.tamanho) for it in d.itens]
        db.commit()
    except HTTPException:
        db.rollback()
        raise
    return [_mov_out(m) for m in movs]


class MovimentoEdit(BaseModel):
    quantidade: int = Field(gt=0)
    pessoa: str | None = None
    data: date
    observacao: str | None = None


@router.put("/movimentos/{mid}", response_model=MovimentoOut)
def editar_movimento(mid: int, d: MovimentoEdit, db: Session = Depends(get_db)):
    """Corrige quantidade, pessoa, data ou observação. O saldo do produto é recalculado com a diferença."""
    m = db.get(MovimentoEstoque, mid)
    if not m:
        raise HTTPException(404, "Movimento não encontrado")
    pessoa = pessoa_canonica(db, d.pessoa) or None
    if m.tipo == "SAIDA" and not pessoa:
        raise HTTPException(422, "Na saída, informe quem pegou")
    sinal = 1 if m.tipo == "ENTRADA" else -1
    _ajustar(m.produto, _tam_do_mov(m), sinal * (d.quantidade - m.quantidade), " para essa quantidade")
    m.quantidade, m.data, m.observacao = d.quantidade, d.data, (d.observacao or "").strip() or None
    m.pessoa = pessoa if m.tipo == "SAIDA" else None
    db.commit(); db.refresh(m)
    return _mov_out(m)


class LimparIn(BaseModel):
    pedidos: bool = False
    produtos: bool = False  # apagar os produtos também apaga os pedidos


@router.post("/limpar")
def limpar(d: LimparIn, db: Session = Depends(get_db)):
    """Apaga TODO o histórico de entradas e saídas e zera os saldos (para recomeçar depois de testar).
    Opcionalmente apaga também os pedidos e os produtos. Não tem volta."""
    movimentos = db.execute(delete(MovimentoEstoque)).rowcount
    pedidos = db.execute(delete(PedidoEstoque)).rowcount if d.pedidos or d.produtos else 0
    if d.produtos:
        db.execute(delete(TamanhoEstoque))
        produtos = db.execute(delete(ProdutoEstoque)).rowcount
    else:
        produtos = 0
        for p in db.scalars(select(ProdutoEstoque)).all():
            p.saldo = 0
            for t in p.tamanhos:
                t.saldo = 0
    db.commit()
    return {"movimentos": movimentos, "pedidos": pedidos, "produtos": produtos}


@router.delete("/movimentos/{mid}", status_code=204)
def desfazer_movimento(mid: int, db: Session = Depends(get_db)):
    """Apaga o movimento e devolve o saldo. Se veio de um pedido, o pedido volta a ficar pendente."""
    m = db.get(MovimentoEstoque, mid)
    if not m:
        raise HTTPException(404, "Movimento não encontrado")
    _ajustar(m.produto, _tam_do_mov(m), -m.quantidade if m.tipo == "ENTRADA" else m.quantidade,
             ". Não dá para desfazer essa entrada: parte dela já saiu")
    if m.pedido_id:
        ped = db.get(PedidoEstoque, m.pedido_id)
        ped.status, ped.data_atendido = "PENDENTE", None
    db.delete(m); db.commit()


# ---------- pedidos ----------
class PedidoIn(BaseModel):
    pessoa: str
    produto_id: int | None = None
    descricao: str | None = None
    quantidade: int = Field(1, gt=0)
    tamanho: str | None = None
    data_pedido: date | None = None
    observacao: str | None = None


class PedidoOut(BaseModel):
    id: int
    pessoa: str
    produto_id: int | None
    produto: str | None
    quantidade: int
    tamanho: str | None
    data_pedido: date
    status: str
    data_atendido: date | None
    observacao: str | None


def _ped_out(p: PedidoEstoque) -> dict:
    return {"id": p.id, "pessoa": p.pessoa, "produto_id": p.produto_id, "produto": p.produto.nome if p.produto else p.descricao,
            "quantidade": p.quantidade, "tamanho": p.tamanho, "data_pedido": p.data_pedido, "status": p.status, "data_atendido": p.data_atendido,
            "observacao": p.observacao}


def _pedido(db: Session, pid: int) -> PedidoEstoque:
    p = db.get(PedidoEstoque, pid)
    if not p:
        raise HTTPException(404, "Pedido não encontrado")
    return p


@router.get("/pedidos", response_model=list[PedidoOut])
def listar_pedidos(status: str | None = None, pessoa: str | None = None, db: Session = Depends(get_db)):
    q = select(PedidoEstoque).order_by(PedidoEstoque.data_pedido.desc(), PedidoEstoque.id.desc())
    if status:
        q = q.where(PedidoEstoque.status == status)
    if pessoa:
        q = q.where(PedidoEstoque.pessoa == pessoa_canonica(db, pessoa))
    return [_ped_out(p) for p in db.scalars(q).all()]


@router.post("/pedidos", response_model=PedidoOut, status_code=201)
def criar_pedido(d: PedidoIn, db: Session = Depends(get_db)):
    pessoa = pessoa_canonica(db, d.pessoa)
    if not pessoa:
        raise HTTPException(422, "Informe quem está pedindo")
    tamanho = nome_tamanho(d.tamanho) or None
    if d.produto_id:
        tam = _tam(_produto(db, d.produto_id), tamanho)  # produto com tamanhos exige um tamanho que existe
        tamanho = tam.tamanho if tam else None
    elif not (d.descricao or "").strip():
        raise HTTPException(422, "Escolha o produto ou descreva o que foi pedido")
    p = PedidoEstoque(pessoa=pessoa, produto_id=d.produto_id, descricao=(d.descricao or "").strip() or None,
                      quantidade=d.quantidade, tamanho=tamanho, data_pedido=d.data_pedido or date.today(), status="PENDENTE",
                      observacao=(d.observacao or "").strip() or None)
    db.add(p); db.commit(); db.refresh(p)
    return _ped_out(p)


class AtenderIn(BaseModel):
    data: date | None = None


@router.post("/pedidos/{pid}/atender", response_model=PedidoOut)
def atender_pedido(pid: int, d: AtenderIn | None = None, db: Session = Depends(get_db)):
    """Marca como atendido. Se o pedido tem produto cadastrado, já lança a saída no nome da pessoa."""
    p = _pedido(db, pid)
    if p.status != "PENDENTE":
        raise HTTPException(409, "Esse pedido não está pendente")
    dt = (d.data if d else None) or date.today()
    if p.produto_id:
        _movimentar(db, p.produto, "SAIDA", p.quantidade, p.pessoa, dt, f"Pedido de {p.data_pedido:%d/%m/%Y}", p.id, p.tamanho)
    p.status, p.data_atendido = "ATENDIDO", dt
    db.commit(); db.refresh(p)
    return _ped_out(p)


@router.post("/pedidos/{pid}/cancelar", response_model=PedidoOut)
def cancelar_pedido(pid: int, db: Session = Depends(get_db)):
    p = _pedido(db, pid)
    if p.status != "PENDENTE":
        raise HTTPException(409, "Esse pedido não está pendente")
    p.status = "CANCELADO"
    db.commit(); db.refresh(p)
    return _ped_out(p)


@router.delete("/pedidos/{pid}", status_code=204)
def excluir_pedido(pid: int, db: Session = Depends(get_db)):
    p = _pedido(db, pid)
    if p.status == "ATENDIDO":
        raise HTTPException(409, "Pedido atendido: desfaça a saída dele antes de excluir")
    db.delete(p); db.commit()


# ---------- pessoas ----------
def _resumo_pessoas(db: Session) -> dict[str, dict]:
    pessoas: dict[str, dict] = {}
    novo = lambda n: {"pessoa": n, "ultima_retirada": None, "ultimo_produto": None, "retiradas": 0, "pendentes": 0,
                      "pedidos": 0, "ultimo_pedido": None}
    saidas = db.scalars(select(MovimentoEstoque).where(MovimentoEstoque.tipo == "SAIDA", MovimentoEstoque.pessoa.is_not(None))
                        .order_by(MovimentoEstoque.data.desc(), MovimentoEstoque.id.desc())).all()
    for m in saidas:
        r = pessoas.setdefault(m.pessoa, novo(m.pessoa))
        r["retiradas"] += 1
        if not r["ultima_retirada"]:
            r["ultima_retirada"], r["ultimo_produto"] = m.data, m.produto.nome + (f" ({m.tamanho})" if m.tamanho else "")
    for p in db.scalars(select(PedidoEstoque).order_by(PedidoEstoque.data_pedido.desc())).all():
        r = pessoas.setdefault(p.pessoa, novo(p.pessoa))
        r["ultimo_pedido"] = r["ultimo_pedido"] or p.data_pedido
        r["pendentes"] += p.status == "PENDENTE"
        r["pedidos"] += 1
    return pessoas


@router.get("/pessoas")
def listar_pessoas(db: Session = Depends(get_db)):
    """Todo mundo que já pegou ou pediu algo: última retirada, quantas vezes pegou e pedidos pendentes."""
    return sorted(_resumo_pessoas(db).values(), key=lambda r: r["pessoa"])


@router.get("/pessoas/{nome}")
def ficha_pessoa(nome: str, db: Session = Depends(get_db)):
    """Ficha de uma pessoa: resumo, histórico de retiradas e pedidos (para ver se já pediu)."""
    n = pessoa_canonica(db, nome)
    resumo = _resumo_pessoas(db).get(n)
    return {"pessoa": n, "existe": resumo is not None,
            "resumo": resumo or {"pessoa": n, "ultima_retirada": None, "ultimo_produto": None, "retiradas": 0, "pendentes": 0, "pedidos": 0, "ultimo_pedido": None},
            "retiradas": listar_movimentos(pessoa=n, tipo="SAIDA", db=db),
            "pedidos": listar_pedidos(pessoa=n, db=db)}


def _registros_da_pessoa(db: Session, n: str) -> tuple[list[MovimentoEstoque], list[PedidoEstoque]]:
    movs = db.scalars(select(MovimentoEstoque).where(MovimentoEstoque.pessoa == n)).all()
    peds = db.scalars(select(PedidoEstoque).where(PedidoEstoque.pessoa == n)).all()
    if not movs and not peds:
        raise HTTPException(404, f"Não encontrei '{n}'")
    return movs, peds


class RenomearIn(BaseModel):
    nome: str


@router.put("/pessoas/{nome}")
def renomear_pessoa(nome: str, d: RenomearIn, db: Session = Depends(get_db)):
    """Troca o nome em todo o histórico e pedidos. Se o nome novo já é de outra pessoa, as duas viram uma só."""
    atual = pessoa_canonica(db, nome)
    movs, peds = _registros_da_pessoa(db, atual)
    novo = nome_pessoa(d.nome)
    if not novo:
        raise HTTPException(422, "Informe o nome")
    # mesma pessoa escrita de outro jeito (ex.: corrigir acento): usa o que foi digitado; senão, junta se já existir
    destino = novo if chave_pessoa(novo) == chave_pessoa(atual) else pessoa_canonica(db, novo)
    juntou = destino != atual and bool(
        db.scalar(select(MovimentoEstoque.id).where(MovimentoEstoque.pessoa == destino).limit(1))
        or db.scalar(select(PedidoEstoque.id).where(PedidoEstoque.pessoa == destino).limit(1)))
    for r in [*movs, *peds]:
        r.pessoa = destino
    db.commit()
    return {"pessoa": destino, "juntou": juntou}


@router.delete("/pessoas/{nome}")
def apagar_pessoa(nome: str, db: Session = Depends(get_db)):
    """Apaga a pessoa: as retiradas dela somem (o que pegou volta para o estoque) e os pedidos dela também."""
    n = pessoa_canonica(db, nome)
    movs, peds = _registros_da_pessoa(db, n)
    for m in movs:
        _ajustar(m.produto, _tam_do_mov(m), m.quantidade)  # só saída tem pessoa: devolve ao estoque
        db.delete(m)
    db.flush()
    for p in peds:
        db.delete(p)
    db.commit()
    return {"pessoa": n, "retiradas": len(movs), "pedidos": len(peds)}
