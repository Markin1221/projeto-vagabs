import io
import re
import tempfile
import zipfile
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


def _processar_bytes(db: Session, conteudo: bytes, centro_custo: str | None, ocultar_zerados: bool = False,
                     nome_arquivo: str | None = None):
    with tempfile.TemporaryDirectory() as pasta:
        caminho = Path(pasta) / "folha.pdf"
        caminho.write_bytes(conteudo)
        try:
            cab, df, blocos, avisos = ler_pdf(str(caminho))
        except ValueError as e:
            raise HTTPException(422, str(e))
        except Exception:
            raise HTTPException(422, "Não consegui ler o arquivo. Ele é o PDF 'Resumo Geral' da folha?")
    grupo = folha.detectar_grupo(df)
    # Centro de custo: o escolhido pelo usuário > o nome do arquivo > o departamento do cabeçalho do PDF
    if centro_custo:
        centro = db.scalar(select(CentroCusto).where(CentroCusto.codigo == centro_custo))
        if not centro or centro.tipo != "departamento":
            raise HTTPException(422, f"'{centro_custo}' não é um centro de custo de departamento")
        cab["origem_centro"] = "escolhido"
    elif grupo == "conselho":
        centro = db.scalar(select(CentroCusto).where(CentroCusto.codigo == folha.CENTRO_CONSELHO))
        cab["origem_centro"] = "padrão dos Sócios"
    else:
        do_arquivo = folha.sugerir_centro_por_arquivo(db, nome_arquivo)
        do_pdf = folha.sugerir_centro(db, cab["departamento"])
        centro = do_arquivo or do_pdf
        if not centro:
            raise HTTPException(422, f"Não sei o centro de custo: o departamento '{cab['departamento']}' do PDF e o "
                                     "nome do arquivo não batem com nenhum centro. Informe o centro_custo.")
        cab["origem_centro"] = "nome do arquivo" if do_arquivo else "cabeçalho do PDF"
        if do_arquivo and do_pdf and do_arquivo.codigo != do_pdf.codigo:
            avisos = [*avisos, f"O nome do arquivo indica {do_arquivo.nome}, mas o PDF diz '{cab['departamento']}'. "
                               f"Usei {do_arquivo.nome} (nome do arquivo)."]
    fontes = folha.montar_fontes(df, blocos)
    return (cab, df, centro, avisos, folha.montar_lancamentos(db, cab, fontes, centro, ocultar_zerados, grupo),
            folha.eventos_novos(db, df, grupo), folha.conferencias(db, fontes, grupo), grupo)


@router.post("/processar")
async def processar(arquivo: UploadFile = File(...), centro_custo: str | None = Form(None),
                    ocultar_zerados: bool = Form(False), db: Session = Depends(get_db)):
    """Lê o PDF e devolve as linhas do CSV, os avisos e os eventos novos (que ainda precisam ser cadastrados)."""
    cab, _, centro, avisos, linhas, novos, conf, grupo = _processar_bytes(db, await arquivo.read(), centro_custo,
                                                                          ocultar_zerados, arquivo.filename)
    return {
        "periodo": {"inicio": cab["inicio"].date(), "fim": cab["fim"].date()},
        "departamento_pdf": cab["departamento"],
        "perfil": grupo,
        "origem_centro": cab["origem_centro"],
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
    cab, _, centro, _, linhas, _, _, grupo = _processar_bytes(db, await arquivo.read(), centro_custo, ocultar_zerados, arquivo.filename)
    nome = _nome_csv(centro, grupo, cab)
    return Response(folha.para_csv(linhas, separador, decimal).encode("utf-8-sig"), media_type="text/csv",
                    headers={"Content-Disposition": f'attachment; filename="{nome}"'})


# ---------- vários PDFs de uma vez ----------
def _nome_csv(centro, grupo, cab) -> str:
    """lancamentos_Coleta_08-2026.csv (nome do departamento, não o código); Sócios = lancamentos_Conselho_..."""
    nome = "Conselho" if grupo == "conselho" else re.sub(r"[^\w-]+", "_", centro.nome).strip("_")
    return f"lancamentos_{nome}_{cab['fim']:%m-%Y}.csv"


def _problemas(novos, conf) -> list[dict]:
    """O que impede de gerar os lançamentos, em palavras para o usuário."""
    saida = [{"tipo": "evento_novo", "titulo": f"Evento novo: {n['nome_pdf']}",
              "detalhe": f"O evento {n['codigo_pdf']} {n['nome_pdf']} ({n['secao']}) tem valor no PDF mas não está "
                         "cadastrado. Cadastre-o, ou diga que é o mesmo que um evento existente.",
              "evento": n} for n in novos]
    for c in conf:
        if not c["ok"]:
            saida.append({"tipo": "conferencia", "titulo": f"{c['nome']} não bate",
                          "detalhe": f"O PDF diz {c['pdf']:.2f}, a soma dos eventos dá {c['calculado']:.2f} "
                                     f"(diferença de {c['diferenca']:.2f}). Abra a conferência para ver as parcelas.",
                          "conferencia": c["nome"]})
    return saida


@router.post("/lote/processar")
async def processar_lote(arquivos: list[UploadFile] = File(...), centros: list[str] = Form(default=[]),
                         ocultar_zerados: bool = Form(False), db: Session = Depends(get_db)):
    """Pré-checagem de cada PDF: centro, período, linhas, conferências e `problemas` (o que bloqueia a geração).
    Um PDF com erro não derruba os outros. `centros[i]` (opcional, vazio = detectar) é o centro do i-ésimo arquivo."""
    saida = []
    for i, arq in enumerate(arquivos):
        centro_i = centros[i] if i < len(centros) and centros[i] else None
        try:
            cab, _, centro, avisos, linhas, novos, conf, grupo = _processar_bytes(
                db, await arq.read(), centro_i, ocultar_zerados, arq.filename)
        except HTTPException as e:
            saida.append({"arquivo": arq.filename, "ok": False, "erro": e.detail,
                          "problemas": [{"tipo": "leitura", "titulo": "Não foi possível ler o arquivo",
                                         "detalhe": e.detail}]})
            continue
        problemas = _problemas(novos, conf)
        saida.append({
            "arquivo": arq.filename, "ok": not problemas, "erro": None, "perfil": grupo,
            "departamento_pdf": cab["departamento"],
            "periodo": {"inicio": cab["inicio"].date(), "fim": cab["fim"].date()},
            "centro_custo": {"codigo": centro.codigo, "nome": centro.nome}, "n_linhas": len(linhas),
            "avisos": avisos, "eventos_novos": novos, "conferencias": conf, "problemas": problemas,
            "conferencias_ok": all(c["ok"] for c in conf), "origem_centro": cab["origem_centro"],
            "nome_csv": _nome_csv(centro, grupo, cab),
            "linhas": [{**l, "data_inicial": l["data_inicial"].date(), "data_liquidacao": l["data_liquidacao"].date()}
                       for l in linhas]})
    return {"arquivos": saida}


@router.post("/trecho")
async def trecho(arquivo: UploadFile = File(...), nome: str = Form(...), origem: str = Form("resumo"),
                 valor: float | None = Form(None)):
    """Imagem (PNG) do pedaço do PDF onde o evento aparece, com a linha destacada."""
    from ..leitor_pdf import recorte_png
    with tempfile.TemporaryDirectory() as pasta:
        caminho = Path(pasta) / "folha.pdf"
        caminho.write_bytes(await arquivo.read())
        try:
            png = recorte_png(str(caminho), nome, origem, valor)
        except Exception:
            raise HTTPException(422, "Não consegui abrir o PDF")
    if png is None:
        raise HTTPException(404, f"Não achei '{nome}' no PDF")
    return Response(png, media_type="image/png")


@router.post("/lote/csv")
async def baixar_zip(arquivos: list[UploadFile] = File(...), centros: list[str] = Form(default=[]),
                     separador: str = Form(";"), decimal: str = Form(","), ocultar_zerados: bool = Form(False),
                     db: Session = Depends(get_db)):
    """ZIP com um CSV por PDF enviado. PDFs com erro ficam de fora e são listados em LEIAME-erros.txt."""
    buf, usados, erros = io.BytesIO(), {}, []
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for i, arq in enumerate(arquivos):
            centro_i = centros[i] if i < len(centros) and centros[i] else None
            try:
                cab, _, centro, _, linhas, _, _, grupo = _processar_bytes(db, await arq.read(), centro_i,
                                                                         ocultar_zerados, arq.filename)
            except HTTPException as e:
                erros.append(f"{arq.filename}: {e.detail}")
                continue
            nome = _nome_csv(centro, grupo, cab)
            usados[nome] = usados.get(nome, 0) + 1
            if usados[nome] > 1:  # dois PDFs do mesmo centro/mês: não sobrescrever
                nome = nome.replace(".csv", f"_{usados[nome]}.csv")
            z.writestr(nome, folha.para_csv(linhas, separador, decimal).encode("utf-8-sig"))
        if erros:
            z.writestr("LEIAME-erros.txt", "Estes arquivos não foram convertidos:\n\n" + "\n".join(erros))
    if not usados:
        raise HTTPException(422, "Nenhum arquivo pôde ser convertido: " + "; ".join(erros))
    return Response(buf.getvalue(), media_type="application/zip",
                    headers={"Content-Disposition": 'attachment; filename="lancamentos.zip"'})
