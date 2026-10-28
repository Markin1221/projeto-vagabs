from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import Response

from .. import comparador

router = APIRouter(prefix="/comparador", tags=["comparador"])


def _rodar(extrato, ddata, rende, creditos, datas):
    try:
        ex = comparador.ler_extrato(extrato.file.read())
        dd = comparador.ler_ddata(ddata.file.read())
    except Exception as e:
        raise HTTPException(422, f"Erro ao ler os arquivos: {e}")
    if dd is None:
        raise HTTPException(422, "Não encontrei as colunas 'Data' e 'Valor' na planilha do DDATA.")
    if ex.empty:
        raise HTTPException(422, "Não encontrei lançamentos no extrato. Confira se o primeiro arquivo é o extrato do banco.")
    return comparador.comparar(ex, dd, rende, creditos, datas)


def _json(df):
    return [] if df.empty else df.astype(object).where(df.notna(), None).to_dict("records")


@router.post("/comparar")
def comparar(extrato: UploadFile = File(...), ddata: UploadFile = File(...), ignorar_rende: bool = Form(True),
                   ignorar_creditos: bool = Form(False), ignorar_datas: bool = Form(False)):
    r = _rodar(extrato, ddata, ignorar_rende, ignorar_creditos, ignorar_datas)
    return {"n_extrato": r["n_extrato"], "n_ddata": r["n_ddata"], "faltando": _json(r["faltando"]),
            "outra_data": _json(r["outra_data"]), "so_ddata": _json(r["so_ddata"])}


@router.post("/xlsx")
def baixar(extrato: UploadFile = File(...), ddata: UploadFile = File(...), ignorar_rende: bool = Form(True),
                 ignorar_creditos: bool = Form(False), ignorar_datas: bool = Form(False)):
    r = _rodar(extrato, ddata, ignorar_rende, ignorar_creditos, ignorar_datas)
    return Response(comparador.para_xlsx(r), media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    headers={"Content-Disposition": 'attachment; filename="transferencias_faltando_ddata.xlsx"'})
