import tempfile
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import folha
from ..db import get_db
from ..leitor_pdf import ler_pdf
from ..models import CentroCusto

router = APIRouter(prefix="/folha", tags=["folha"])


async def _processar(db: Session, arquivo: UploadFile, centro_custo: str | None, ocultar_zerados: bool = False):
    with tempfile.TemporaryDirectory() as pasta:
        caminho = Path(pasta) / "folha.pdf"
        caminho.write_bytes(await arquivo.read())
        try:
            cab, df, blocos, avisos = ler_pdf(str(caminho))
        except ValueError as e:
            raise HTTPException(422, str(e))
        except Exception:
            raise HTTPException(422, "Não consegui ler o arquivo. Ele é o PDF 'Resumo Geral' da folha?")
    if centro_custo:
        centro = db.scalar(select(CentroCusto).where(CentroCusto.codigo == centro_custo))
        if not centro or centro.tipo != "departamento":
            raise HTTPException(422, f"'{centro_custo}' não é um centro de custo de departamento")
    else:
        centro = folha.sugerir_centro(db, cab["departamento"])
        if not centro:
            raise HTTPException(422, f"Departamento '{cab['departamento']}' do PDF não bate com nenhum centro de "
                                     "custo; informe o centro_custo.")
    fontes = folha.montar_fontes(df, blocos)
    return (cab, df, centro, avisos, folha.montar_lancamentos(db, cab, fontes, centro, ocultar_zerados),
            folha.eventos_novos(db, df), folha.conferencias(db, fontes))


@router.post("/processar")
async def processar(arquivo: UploadFile = File(...), centro_custo: str | None = Form(None),
                    ocultar_zerados: bool = Form(False), db: Session = Depends(get_db)):
    """Lê o PDF e devolve as linhas do CSV, os avisos e os eventos novos (que ainda precisam ser cadastrados)."""
    cab, _, centro, avisos, linhas, novos, conf = await _processar(db, arquivo, centro_custo, ocultar_zerados)
    return {
        "periodo": {"inicio": cab["inicio"].date(), "fim": cab["fim"].date()},
        "departamento_pdf": cab["departamento"],
        "centro_custo": {"codigo": centro.codigo, "nome": centro.nome},
        "avisos": avisos,
        "eventos_novos": novos,
        "conferencias": conf,
        "linhas": [{**l, "data_inicial": l["data_inicial"].date(), "data_liquidacao": l["data_liquidacao"].date()}
                   for l in linhas],
    }


@router.post("/csv")
async def baixar_csv(arquivo: UploadFile = File(...), centro_custo: str | None = Form(None),
                     separador: str = Form(";"), decimal: str = Form(","), ocultar_zerados: bool = Form(False),
                     db: Session = Depends(get_db)):
    """Gera o CSV de lançamentos. Eventos novos não entram: cadastre-os e envie o PDF de novo."""
    cab, _, centro, _, linhas, _, _ = await _processar(db, arquivo, centro_custo, ocultar_zerados)
    nome = f"lancamentos_{centro.codigo}_{cab['fim']:%Y-%m}.csv"
    return Response(folha.para_csv(linhas, separador, decimal).encode("utf-8-sig"), media_type="text/csv",
                    headers={"Content-Disposition": f'attachment; filename="{nome}"'})
