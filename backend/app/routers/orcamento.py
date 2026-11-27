from fastapi import APIRouter, File, HTTPException, UploadFile

from .. import orcamento

router = APIRouter(prefix="/orcamento", tags=["orcamento"])


@router.post("/ler")
def ler(arquivo: UploadFile = File(...)):
    """Lê o Relatório Orçado x Realizado (.xlsx) e devolve os eventos para os gráficos."""
    try:
        return orcamento.ler(arquivo.file.read())
    except ValueError as e:
        raise HTTPException(422, str(e))
    except Exception:
        raise HTTPException(422, "Não consegui ler a planilha. Ela é o .xlsx do Relatório Orçado x Realizado?")
