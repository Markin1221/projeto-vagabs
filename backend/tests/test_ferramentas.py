import io

import pandas as pd


def xlsx(df, **kw):
    b = io.BytesIO(); df.to_excel(b, index=False, **kw); return b.getvalue()


def extrato_banco():
    linhas = [["Data", "Historico", "Valor R$", None], ["01/08/2026", "Pix enviado", 100.0, None],
              ["02/08/2026", "Boleto", 50.0, None], ["03/08/2026", "Deposito", None, 30.0],
              ["04/08/2026", "BB Rende Facil", 10.0, None], ["05/08/2026", "Tarifa", 7.5, None]]
    return xlsx(pd.DataFrame(linhas), header=False)


def ddata():
    return xlsx(pd.DataFrame({"Data": ["01/08/2026", "03/08/2026", "09/08/2026"], "Valor": [-100.0, 30.0, -50.0],
                              "Título": ["a", "b", "c"], "Descrição": ["x", "y", "z"]}))


def test_comparador(client):
    r = client.post("/comparador/comparar", files={"extrato": ("e.xlsx", extrato_banco()), "ddata": ("d.xlsx", ddata())},
                    data={"ignorar_rende": "true"}).json()
    assert [f["Histórico"] for f in r["faltando"]] == ["Tarifa"]                      # Rende ignorado
    assert [o["Histórico"] for o in r["outra_data"]] == ["Boleto"] and r["outra_data"][0]["Diferença (dias)"] == 7
    assert r["so_ddata"] == []
    x = client.post("/comparador/xlsx", files={"extrato": ("e.xlsx", extrato_banco()), "ddata": ("d.xlsx", ddata())})
    assert x.status_code == 200 and x.content[:2] == b"PK"


def test_comparador_so_valores(client):
    r = client.post("/comparador/comparar", files={"extrato": ("e.xlsx", extrato_banco()), "ddata": ("d.xlsx", ddata())},
                    data={"ignorar_datas": "true", "ignorar_rende": "true"}).json()
    assert [f["Histórico"] for f in r["faltando"]] == ["Tarifa"] and r["outra_data"] == []


def test_comparador_arquivo_errado(client):
    assert client.post("/comparador/comparar", files={"extrato": ("e.xlsx", extrato_banco()), "ddata": ("d.xlsx", extrato_banco())}).status_code == 422


def sol():
    cab = ["Data", "Banco", "Origem", "Tipo", "Título", "Descrição", "Centro", "Item", "Fonte", "Valor", "Saldo", "Obs"]
    linhas = [["01/08", "BB", "Pix", "Debito", "TAR. AGRUPADAS", "tarifa", None, None, None, -10.0, 0, None],
              ["02/08", "BB", "Transferência", "Debito", "X", "y", None, None, None, -5.0, 0, None],
              ["03/08", "BB", "Pix", "Debito", "PAGAMENTO DE BOLETO", "forn", None, None, None, -9.0, 0, None],
              ["04/08", "BB", "Pix", "Debito", "OUTRO", "coisa", "ADM01 - ADMINISTRAÇÃO", "070 - X", "14", -1.0, 0, None],
              ["05/08", "BB", "Pix", "Credito", "MISTERIO", "z", None, None, None, 3.0, 0, None]]
    df = pd.DataFrame(linhas, columns=cab); df.insert(0, "n", range(len(df)))
    b = io.BytesIO()
    with pd.ExcelWriter(b) as w:
        pd.DataFrame([["Extrato"]]).to_excel(w, index=False, header=False, startrow=0)
        df.to_excel(w, index=False, startrow=1)
    return b.getvalue()


def test_classificador(client):
    r = client.post("/classificador/processar", files={"arquivo": ("s.xlsx", sol())})
    assert r.status_code == 200, r.text
    r = r.json()
    por = {l["titulo"]: l for l in r["linhas"]}
    assert por["TAR. AGRUPADAS"]["como"] == "regra" and por["TAR. AGRUPADAS"]["item"].startswith("048")
    assert por["X"]["como"] == "heuristica" and por["X"]["item"].startswith("521")
    assert por["PAGAMENTO DE BOLETO"]["item"].startswith("520")
    assert por["OUTRO"]["como"] == "sol" and por["MISTERIO"]["como"] == "manual"
    assert r["resumo"] == {"total": 5, "regra": 1, "sol": 1, "heuristica": 2, "manual": 1}


def test_regras_crud(client):
    n = len(client.get("/regras").json())
    assert n >= 50
    nova = client.post("/regras", json={"kw": "MISTERIO", "centro": "ADM01 - ADMINISTRAÇÃO", "item": "070 - Z"})
    assert nova.status_code == 201
    assert client.post("/regras", json={"kw": "misterio", "centro": "A"}).status_code == 409
    assert client.post("/regras", json={"kw": "", "centro": "A"}).status_code == 422
    rid = nova.json()["id"]
    assert client.post("/classificador/processar", files={"arquivo": ("s.xlsx", sol())}).json()["resumo"]["manual"] == 0
    assert client.delete(f"/regras/{rid}").status_code == 204
