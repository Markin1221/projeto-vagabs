import io
import json
import re
import zipfile
from datetime import date

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import quinzena as q
from ..db import get_db
from ..models import Configuracao, LinhaQuinzena, RegraQuinzena

router = APIRouter(prefix="/quinzena", tags=["quinzena"])
XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


# ---------- configuração e cadastros ----------
class ConfigIn(BaseModel):
    taxa_cooperativa: float
    taxa_sindicato: float
    conta_quinzena: str
    terminais: dict[str, list[str]] | None = None


@router.get("/config")
def ler_config(db: Session = Depends(get_db)):
    c = q.config(db)
    return {"taxa_cooperativa": float(c.get("taxa_cooperativa", 0)), "taxa_sindicato": float(c.get("taxa_sindicato", 0)),
            "conta_quinzena": c.get("conta_quinzena", ""), "terminais": json.loads(c.get("terminais") or "{}")}


@router.put("/config")
def salvar_config(d: ConfigIn, db: Session = Depends(get_db)):
    if d.taxa_cooperativa < 0 or d.taxa_sindicato < 0:
        raise HTTPException(422, "As taxas não podem ser negativas")
    dados = d.model_dump()
    if dados["terminais"] is None:
        dados.pop("terminais")
    else:
        dados["terminais"] = json.dumps({k: [p.strip() for p in v if p.strip()] for k, v in dados["terminais"].items()})
    for chave, valor in dados.items():
        reg = db.get(Configuracao, chave)
        if reg:
            reg.valor = str(valor)
        else:
            db.add(Configuracao(chave=chave, valor=str(valor)))
    db.commit()
    return ler_config(db)


@router.get("/linhas")
def listar_linhas(db: Session = Depends(get_db)):
    linhas = [{"codigo": l.codigo, "ordem": l.ordem, "descricao": l.descricao, "tipo_lancamento": l.tipo_lancamento,
               "centro": l.centro, "item": q.codigo_item(l.item) if l.item is not None else None, "fonte": l.fonte}
              for l in db.scalars(select(LinhaQuinzena).order_by(LinhaQuinzena.ordem))]
    especiais = [{"codigo": k, "descricao": v, "especial": True} for k, v in q.ESPECIAIS.items()]
    return {"linhas": linhas, "especiais": especiais}


class RegraIn(BaseModel):
    padrao: str
    linha: str
    ordem: int | None = None


def _validar_regra(d: RegraIn, db: Session) -> RegraIn:
    d.padrao = q.norm(d.padrao)
    if len(d.padrao) < 3:
        raise HTTPException(422, "O padrão precisa ter pelo menos 3 letras")
    if d.linha not in q.ESPECIAIS and not db.scalar(select(LinhaQuinzena).where(LinhaQuinzena.codigo == d.linha)):
        raise HTTPException(422, f"Linha '{d.linha}' não existe")
    return d


def _regra_out(r):
    return {"id": r.id, "ordem": r.ordem, "padrao": r.padrao, "linha": r.linha}


@router.get("/regras")
def listar_regras(db: Session = Depends(get_db)):
    return [_regra_out(r) for r in db.scalars(select(RegraQuinzena).order_by(RegraQuinzena.ordem, RegraQuinzena.id))]


@router.post("/regras", status_code=201)
def criar_regra(d: RegraIn, db: Session = Depends(get_db)):
    d = _validar_regra(d, db)
    if db.scalar(select(RegraQuinzena).where(RegraQuinzena.padrao == d.padrao)):
        raise HTTPException(409, f"Já existe uma regra para '{d.padrao}'")
    # regra nova sem ordem vai para o começo: é mais específica que as genéricas do cadastro inicial
    r = RegraQuinzena(padrao=d.padrao, linha=d.linha, ordem=d.ordem if d.ordem is not None else 5)
    db.add(r); db.commit(); db.refresh(r)
    return _regra_out(r)


@router.put("/regras/{rid}")
def atualizar_regra(rid: int, d: RegraIn, db: Session = Depends(get_db)):
    r = db.get(RegraQuinzena, rid)
    if not r:
        raise HTTPException(404, "Regra não encontrada")
    d = _validar_regra(d, db)
    r.padrao, r.linha = d.padrao, d.linha
    if d.ordem is not None:
        r.ordem = d.ordem
    db.commit()
    return _regra_out(r)


@router.delete("/regras/{rid}", status_code=204)
def excluir_regra(rid: int, db: Session = Depends(get_db)):
    r = db.get(RegraQuinzena, rid)
    if not r:
        raise HTTPException(404, "Regra não encontrada")
    db.delete(r); db.commit()


# ---------- processamento ----------
def _float(txt: str | None):
    if txt is None or str(txt).strip() == "":
        return None
    t = str(txt).strip()
    if "," in t:
        t = t.replace(".", "").replace(",", ".")
    try:
        return float(t)
    except ValueError:
        raise HTTPException(422, f"Valor inválido: {txt}")


def _um(db, arq: UploadFile, grupo: str | None, credito: str | None, data_lanc: date, observacao: str,
              conta: str | None, incluir_zeradas: bool) -> dict:
    try:
        df = q.ler_relatorio(arq.file.read())
    except ValueError as e:
        raise HTTPException(422, str(e))
    except Exception:
        raise HTTPException(422, "Não consegui abrir o arquivo. Ele é o relatório de remuneração em Excel (.xlsx)?")
    eventos = q.eventos_do_relatorio(df)
    grupo = grupo or q.detectar_grupo(arq.filename, eventos)
    if not grupo:
        raise HTTPException(422, "Não sei se o relatório é Interbairros, Alimentadora ou Intermunicipal: o nome do "
                                 "arquivo não diz. Escolha o grupo no arquivo.")
    return q.processar(db, df, grupo, data_lanc, observacao, conta, _float(credito), incluir_zeradas)


def _nome_arquivo(grupo: str, data_lanc: date, ext: str) -> str:
    return f"lancamentos_quinzena_{re.sub(r'[^A-Za-z]+', '', grupo)}_{data_lanc:%d-%m-%Y}.{ext}"


def _iso(linha: dict) -> dict:
    return {**linha, "data_inicial": linha["data_inicial"].isoformat()}


@router.post("/processar")
def processar(arquivos: list[UploadFile] = File(...), grupos: list[str] = Form(default=[]),
                    creditos: list[str] = Form(default=[]), data: date = Form(...), observacao: str = Form(...),
                    conta: str | None = Form(None), incluir_zeradas: bool = Form(False), db: Session = Depends(get_db)):
    """Pré-checagem de cada relatório: linhas do lançamento com a composição de cada uma e os `problemas`
    (eventos sem regra) que impedem de gerar o arquivo."""
    saida = []
    for i, arq in enumerate(arquivos):
        g = grupos[i] if i < len(grupos) and grupos[i] else None
        c = creditos[i] if i < len(creditos) else None
        try:
            r = _um(db, arq, g, c, data, observacao, conta, incluir_zeradas)
        except HTTPException as e:
            saida.append({"arquivo": arq.filename, "ok": False, "erro": e.detail,
                          "problemas": [{"tipo": "leitura", "titulo": "Não foi possível usar o arquivo", "detalhe": e.detail}]})
            continue
        saida.append({"arquivo": arq.filename, "ok": not r["problemas"], "erro": None, **r,
                      "linhas": [_iso(l) for l in r["linhas"]], "nome_arquivo": _nome_arquivo(r["grupo"], data, "xlsx")})
    return {"arquivos": saida}


@router.post("/gerar")
def gerar(arquivos: list[UploadFile] = File(...), grupos: list[str] = Form(default=[]),
                creditos: list[str] = Form(default=[]), data: date = Form(...), observacao: str = Form(...),
                conta: str | None = Form(None), incluir_zeradas: bool = Form(False), formato: str = Form("xlsx"),
                db: Session = Depends(get_db)):
    """Um arquivo de lançamentos por relatório (ZIP quando são vários). Recusa se algum tiver evento sem regra."""
    ext = "csv" if formato == "csv" else "xlsx"
    gerados = []
    for i, arq in enumerate(arquivos):
        g = grupos[i] if i < len(grupos) and grupos[i] else None
        c = creditos[i] if i < len(creditos) else None
        r = _um(db, arq, g, c, data, observacao, conta, incluir_zeradas)
        if r["problemas"]:
            raise HTTPException(422, f"{arq.filename}: {len(r['problemas'])} evento(s) sem regra. Resolva antes de gerar.")
        conteudo = q.para_xlsx(r["linhas"]) if ext == "xlsx" else q.para_csv(r["linhas"]).encode("utf-8-sig")
        gerados.append((_nome_arquivo(r["grupo"], data, ext), conteudo))
    if len(gerados) == 1:
        nome, conteudo = gerados[0]
        return Response(conteudo, media_type=XLSX if ext == "xlsx" else "text/csv",
                        headers={"Content-Disposition": f'attachment; filename="{nome}"'})
    buf, usados = io.BytesIO(), {}
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for nome, conteudo in gerados:
            usados[nome] = usados.get(nome, 0) + 1
            if usados[nome] > 1:
                nome = nome.replace(f".{ext}", f"_{usados[nome]}.{ext}")
            z.writestr(nome, conteudo)
    return Response(buf.getvalue(), media_type="application/zip",
                    headers={"Content-Disposition": 'attachment; filename="lancamentos_quinzena.zip"'})


@router.get("/observacao")
def observacao(quinzena: int, mes: int, ano: int):
    if quinzena not in (1, 2) or not 1 <= mes <= 12:
        raise HTTPException(422, "Quinzena 1 ou 2, mês de 1 a 12")
    return {"observacao": q.observacao_padrao(quinzena, mes, ano)}
