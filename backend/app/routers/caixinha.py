import io
import zipfile
from datetime import date

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import caixinha
from ..db import get_db
from ..models import CentroCusto, ItemDespesa, RegraCaixinha

router = APIRouter(prefix="/caixinha", tags=["caixinha"])


def _gerar(arquivo: UploadFile, data_lancamento: date | None, data_da_linha: bool, db: Session) -> list[dict]:
    """Um item por mês da planilha. Data dos lançamentos: com um mês só, a escolhida na tela; com vários, a última
    data de cada mês (ou a escolhida, se o mês não tiver datas). `data_da_linha` usa a data de cada linha."""
    try:
        blocos = caixinha.ler_blocos(arquivo.file.read())
    except ValueError as e:
        raise HTTPException(422, str(e))
    except Exception:
        raise HTTPException(422, "Não consegui ler a planilha. Ela é o .xlsx da caixinha?")
    if not blocos:
        raise HTTPException(422, "Não encontrei lançamentos com valor na planilha.")
    salvas = db.scalars(select(RegraCaixinha)).all()
    padrao = data_lancamento or date.today()
    meses = []
    for b in blocos:
        dt = padrao if len(blocos) == 1 else (b["fim"] or padrao)
        linhas = caixinha.montar(b["linhas"], dt, data_da_linha, salvas)
        meses.append({"numero": b["numero"], "rotulo": b["rotulo"], "nome": b["nome"], "cheque": b["cheque"],
                      "inicio": b["inicio"], "fim": b["fim"], "data_lancamento": dt, "linhas": linhas,
                      "pendentes": caixinha.pendentes(linhas),
                      "total_debitos": round(sum(l["valor"] for l in linhas if l["tipo_lancamento"] == "DEBITO"), 2),
                      "total_creditos": round(sum(l["valor"] for l in linhas if l["tipo_lancamento"] == "CREDITO"), 2)})
    return meses


@router.post("/processar")
def processar(arquivo: UploadFile = File(...), data_lancamento: date | None = Form(None),
              data_da_linha: bool = Form(False), db: Session = Depends(get_db)):
    meses = _gerar(arquivo, data_lancamento, data_da_linha, db)
    pend = list(dict.fromkeys(p for m in meses for p in m["pendentes"]))
    return {"meses": meses, "pendentes": pend}


@router.post("/csv")
def baixar(arquivo: UploadFile = File(...), data_lancamento: date | None = Form(None),
           data_da_linha: bool = Form(False), db: Session = Depends(get_db)):
    """Um mês: o CSV. Vários meses: um .zip com um CSV por mês."""
    meses = _gerar(arquivo, data_lancamento, data_da_linha, db)
    pend = list(dict.fromkeys(p for m in meses for p in m["pendentes"]))
    if pend:
        raise HTTPException(422, f"{len(pend)} descrição(ões) sem classificação: {', '.join(p or '(vazia)' for p in pend)}")
    if len(meses) == 1:
        d = meses[0]["data_lancamento"]
        return Response(caixinha.para_csv(meses[0]["linhas"]).encode("utf-8-sig"), media_type="text/csv",
                        headers={"Content-Disposition": f'attachment; filename="caixinha_{d:%m-%Y}.csv"'})
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for m in meses:
            z.writestr(m["nome"], caixinha.para_csv(m["linhas"]).encode("utf-8-sig"))
    return Response(buf.getvalue(), media_type="application/zip",
                    headers={"Content-Disposition": f'attachment; filename="caixinhas_{len(meses)}_meses.zip"'})


# ---------- regras salvas pela tela ----------
class RegraIn(BaseModel):
    kw: str
    titulo: str
    centro: str
    item: int
    tipo: str | None = None


class RegraOut(RegraIn):
    id: int
    model_config = {"from_attributes": True}


@router.get("/regras", response_model=list[RegraOut])
def listar(db: Session = Depends(get_db)):
    return db.scalars(select(RegraCaixinha).order_by(RegraCaixinha.kw)).all()


@router.get("/regras-fixas")
def regras_fixas():
    """Regras que ficam no código (caixinha.REGRAS), só para consulta na tela."""
    return [{"padrao": p, "titulo": t, "centro": c, "item": i, "tipo": tp} for p, t, c, i, tp in caixinha.REGRAS if t]


def _validar(d: RegraIn, db: Session) -> tuple[str, str]:
    kw, titulo = caixinha.norm(d.kw), d.titulo.strip()
    if not kw or not titulo:
        raise HTTPException(422, "Informe a palavra-chave e o título")
    if d.tipo not in (None, "", "DEBITO", "CREDITO"):
        raise HTTPException(422, "Tipo deve ser DEBITO, CREDITO ou vazio")
    if not db.scalar(select(CentroCusto).where(CentroCusto.codigo == d.centro)):
        raise HTTPException(422, f"Centro de custo '{d.centro}' não existe")
    if not db.scalar(select(ItemDespesa).where(ItemDespesa.codigo == d.item)):
        raise HTTPException(422, f"Item de despesa {d.item} não existe")
    return kw, titulo


@router.post("/regras", response_model=RegraOut, status_code=201)
def salvar(d: RegraIn, db: Session = Depends(get_db)):
    """Cria a regra; se já existe uma com a mesma palavra-chave, atualiza."""
    kw, titulo = _validar(d, db)
    r = db.scalar(select(RegraCaixinha).where(RegraCaixinha.kw == kw)) or RegraCaixinha(kw=kw)
    r.titulo, r.centro, r.item, r.tipo = titulo, d.centro, d.item, d.tipo or None
    db.add(r); db.commit(); db.refresh(r)
    return r


@router.put("/regras/{rid}", response_model=RegraOut)
def atualizar(rid: int, d: RegraIn, db: Session = Depends(get_db)):
    r = db.get(RegraCaixinha, rid)
    if not r:
        raise HTTPException(404, "Regra não encontrada")
    kw, titulo = _validar(d, db)
    outra = db.scalar(select(RegraCaixinha).where(RegraCaixinha.kw == kw, RegraCaixinha.id != rid))
    if outra:
        raise HTTPException(409, f"Já existe uma regra para '{kw}'")
    r.kw, r.titulo, r.centro, r.item, r.tipo = kw, titulo, d.centro, d.item, d.tipo or None
    db.commit(); db.refresh(r)
    return r


@router.delete("/regras/{rid}", status_code=204)
def excluir(rid: int, db: Session = Depends(get_db)):
    r = db.get(RegraCaixinha, rid)
    if not r:
        raise HTTPException(404, "Regra não encontrada")
    db.delete(r); db.commit()
