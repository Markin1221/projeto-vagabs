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
    ws.append([None, None, None, None, 999, None])  # total no rodapé: fica fora
    b = io.BytesIO(); wb.save(b)
    return b.getvalue()


def test_classifica_e_numera_repetidos():
    arq = _planilha([(None, None, 250, "Folguista"), (None, None, 250, "FOLGUISTA"), (None, None, 100, "Aguas"),
                     (datetime(2026, 7, 21), 350, None, "Venda de oleo"), (None, None, 252, "Passagens"),
                     (None, None, 10, "coisa estranha"), (None, None, 5, "Cheque descontado 29/08")])
    linhas, _ = caixinha.ler_planilha(arq)
    out = caixinha.montar(linhas, date(2026, 7, 21))
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
    assert r.json()["pendentes"] == ["Kit socorros"]
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
