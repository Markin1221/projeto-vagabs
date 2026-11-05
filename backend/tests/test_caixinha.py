import io
from datetime import date, datetime

from openpyxl import Workbook

from app import caixinha


def _planilha(linhas):
    wb = Workbook(); ws = wb.active
    ws.append([None, "Data", 1000, "Crédito", "Débito", "Descrição"])
    saldo = 1000
    for dt, cred, deb, desc in linhas:
        saldo += (cred or 0) - (deb or 0)
        ws.append([None, dt, saldo, cred, deb, desc])
    ws.append([None, None, None, None, round(sum(d or 0 for _, _, d, _ in linhas), 2), None])  # total no rodapé: fica fora
    b = io.BytesIO(); wb.save(b)
    return b.getvalue()


def test_classifica_e_numera_repetidos():
    arq = _planilha([(None, None, 250, "Folguista"), (None, None, 250, "FOLGUISTA"), (None, None, 100, "Aguas"),
                     (datetime(2026, 7, 21), 350, None, "Venda de oleo"), (None, None, 252, "Passagens"),
                     (None, None, 10, "coisa estranha"), (None, None, 5, "Cheque descontado 29/08")])
    (bloco,) = caixinha.ler_blocos(arq)
    out = caixinha.montar(bloco["linhas"], date(2026, 7, 21))
    assert [l["titulo"] for l in out] == ["Folguista no posto", "Folguista no posto 01", "Águas minerais",
                                          "Venda de óleo queimado", "Passagens do jovem aprendiz Daniel", None]
    assert out[0]["codigo_centro_de_custo"] == "ADM03" and out[0]["codigo_item_despesa"] == "*028"
    assert out[3]["tipo_lancamento"] == "CREDITO"
    assert out[4]["codigo_item_despesa"] == "500"
    assert caixinha.pendentes(out) == ["coisa estranha"]
    ok = [l for l in out if not l["revisar"]]
    assert caixinha.para_csv(ok).splitlines()[1] == \
        "Folguista no posto;Caixinha;DEBITO;ADM03;46604-2;*028;;;;21/07/2026;;250,00;Caixinha;;PAGO;21/07/2026;46604-2"


def test_api_pendente_bloqueia_e_regra_salva_resolve(client):
    arq = _planilha([(None, None, 30, "recarga celular"), (None, None, 80, "Kit socorros")])
    dados = {"data_lancamento": "2026-07-21"}
    r = client.post("/caixinha/processar", files={"arquivo": ("c.xlsx", arq)}, data=dados)
    assert r.json()["pendentes"] == ["Kit socorros"] and len(r.json()["meses"]) == 1
    assert client.post("/caixinha/csv", files={"arquivo": ("c.xlsx", arq)}, data=dados).status_code == 422
    r = client.post("/caixinha/regras", json={"kw": "Kit socorros", "titulo": "Kit de primeiros socorros",
                                               "centro": "ADM01", "item": 51})
    assert r.status_code == 201 and r.json()["kw"] == "kit socorros"
    r = client.post("/caixinha/csv", files={"arquivo": ("c.xlsx", arq)}, data=dados)
    assert r.status_code == 200 and "Kit de primeiros socorros;Caixinha;DEBITO;ADM01;46604-2;*051" in r.content.decode("utf-8-sig")


def test_api_editar_excluir_e_fixas(client):
    rid = client.post("/caixinha/regras", json={"kw": "Coroa", "titulo": "Coroa de flores", "centro": "ADM01", "item": 51}).json()["id"]
    r = client.put(f"/caixinha/regras/{rid}", json={"kw": "coroa de flores", "titulo": "Coroa", "centro": "ADM01", "item": 37})
    assert r.status_code == 200 and r.json()["item"] == 37
    assert [x["kw"] for x in client.get("/caixinha/regras").json()] == ["coroa de flores"]
    assert client.delete(f"/caixinha/regras/{rid}").status_code == 204
    assert client.get("/caixinha/regras").json() == []
    assert any(x["titulo"] == "Folguista no posto" for x in client.get("/caixinha/regras-fixas").json())


def test_varios_meses_viram_zip(client):
    import zipfile
    wb = Workbook(); ws = wb.active
    for c0, (cheque, dt, desc) in zip((2, 9), ((859962, datetime(2025, 8, 4), "Aguas"), (859967, None, "Folguista"))):
        ws.cell(3, c0, "Cheque"); ws.cell(4, c0, cheque)
        for k, v in enumerate(["Data", 1000, "Crédito", "Débito", "Descrição"]):
            ws.cell(8, c0 + k, v)
        for k, v in enumerate([dt, 900, None, 100, desc]):
            ws.cell(9, c0 + k, v)
    b = io.BytesIO(); wb.save(b)
    r = client.post("/caixinha/processar", files={"arquivo": ("c.xlsx", b.getvalue())}, data={"data_lancamento": "2026-07-21"})
    m = r.json()["meses"]
    assert [x["rotulo"] for x in m] == ["Caixinha 1 · cheque 859962 · ago/2025", "Caixinha 2 · cheque 859967 · sem datas"]
    assert [x["data_lancamento"] for x in m] == ["2025-08-04", "2026-07-21"]
    r = client.post("/caixinha/csv", files={"arquivo": ("c.xlsx", b.getvalue())}, data={"data_lancamento": "2026-07-21"})
    assert r.headers["content-type"] == "application/zip"
    z = zipfile.ZipFile(io.BytesIO(r.content))
    assert z.namelist() == ["caixinha_01_cheque-859962_08-2025.csv", "caixinha_02_cheque-859967.csv"]
    assert "Águas minerais" in z.read(z.namelist()[0]).decode("utf-8-sig")


def test_planilha_sem_coluna_de_saldo_e_com_linha_vazia():
    """Planilha copiada só com valores: saldo vazio e linhas em branco no meio; o total depois do fim fica fora."""
    wb = Workbook(); ws = wb.active
    for k, v in enumerate(["Data", None, "Crédito", "Débito", "Descrição"]):
        ws.cell(10, 3 + k, v)
    ws.cell(11, 6, 3.6); ws.cell(11, 7, "PARAFUSOS OFICINA")
    ws.cell(13, 6, 180); ws.cell(13, 7, "Almoços")
    ws.cell(40, 6, 183.6)  # total no rodapé
    b = io.BytesIO(); wb.save(b)
    (bloco,) = caixinha.ler_blocos(b.getvalue())
    assert [(l["descricao"], l["valor"]) for l in bloco["linhas"]] == [("PARAFUSOS OFICINA", 3.6), ("Almoços", 180.0)]
