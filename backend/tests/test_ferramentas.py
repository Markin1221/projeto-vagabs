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
    assert r["origem"] == "DDATA" and [f["Histórico"] for f in r["faltando"]] == ["Tarifa"]   # Rende ignorado
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


def extrato_cd():
    """Extrato do banco com coluna 'Inf.' (C/D), datas em texto e valor '1.234,56 '."""
    linhas = [["Extrato Conta Corrente"], ["Agencia", "06971"],
              ["Data", "observacao", "Data balancete", "Agencia Origem", "Lote", "Numero Documento", "Cod. Historico", "Historico", "Valor R$ ", "Inf.", "Detalhamento Hist."],
              ["25/11/2026", " ", "25/11/2026", "0000", "0", "0", "0", "Saldo Anterior   ", "2.410,40 ", "C", " "],
              ["26/11/2026", " ", "26/11/2026", "0", "1", "00000000000112601", "109", "Pagamento de Boleto", "1.081,50 ", "D", "REDIESEL"],
              ["26/11/2026", " ", "26/11/2026", "0", "1", "00000000000112602", "109", "Pagamento de Boleto", "512,18 ", "D", "CUMMINS"],
              ["26/11/2026", " ", "26/11/2026", "0", "1", "00000000000112603", "821", "Pix - Recebido", "20.000,00 ", "C", "COOPERNORTE"],
              ["26/11/2026", " ", "26/11/2026", "0", "0", "0", "848", "BB RF Simples Ágil", "10.924,16 ", "C", " "],
              ["27/11/2026", " ", "27/11/2026", "0", "0", "0", "999", "S A L D O", "130,00 ", "D", " "],
              [None], ["Saldo", "33.656,52", "C"]]
    return xlsx(pd.DataFrame(linhas), header=False)


def conferencia():
    """Planilha da conferência: cabeçalho com 'Situação', uma linha por pagamento (colunas deslocadas, como a original)."""
    from datetime import datetime
    d = datetime(2026, 11, 26)
    linhas = [[None] * 5, [None] * 5, [None, None, None, "Valor", "Total diário", "Situação", "Documento", "Sequencial"],
              [None, None, None, None, d, "Cobranca 1", 1081.5, None, "DEBITADO", 82601, 1],
              [None, None, None, None, d, "TED BCO:004", 999.99, None, "DEBITADO", 82602, 2],
              [None, None, None, None, None, None, 2000.0]]
    return xlsx(pd.DataFrame(linhas), header=False)


def test_comparador_extrato_cd_com_planilha_de_conferencia(client):
    r = client.post("/comparador/comparar", files={"extrato": ("e.xlsx", extrato_cd()), "ddata": ("c.xlsx", conferencia())}).json()
    assert r["n_extrato"] == 2 and r["n_ddata"] == 2                       # saldo, crédito e RF Simples ficam de fora
    assert [f["Valor"] for f in r["faltando"]] == [512.18]                 # pago no banco, não está na conferência
    assert [f["Tipo"] for f in r["faltando"]] == ["Débito"] and r["faltando"][0]["Documento"] == "112602"
    assert [s["Valor"] for s in r["so_ddata"]] == [-999.99]                # está na conferência, não saiu do banco


def conferencia_dias():
    """Conferência com uma aba por dia: B = crédito, C = débito, E = justificativa; 'dda' soma vários boletos; há linha de total."""
    b = io.BytesIO()
    cab = [[None], ["BANCO DO BRASIL - MATRIS"], [None, "CREDITO ", "DEBITO "], [None]]
    dia = pd.DataFrame(cab + [[None, 20000.0, None, None, None], [None, None, 1593.68, None, "dda"], [None, None, 512.18 + 0, None, "cap 51"],
                              [None, None, 2105.86, None, None]])  # última = total
    with pd.ExcelWriter(b) as w:
        dia.to_excel(w, sheet_name="26.11.26", index=False, header=False)
        dia.to_excel(w, sheet_name="27.11.26", index=False, header=False)
        pd.DataFrame([[1]]).to_excel(w, sheet_name="Planilha1", index=False, header=False)
    return b.getvalue()


def test_comparador_conferencia_por_dia_soma_dda(client):
    ext = [["Data", "Historico", "Valor R$", "Inf."], ["26/11/2026", "Pagamento de Boleto", "1.000,00 ", "D"],
           ["26/11/2026", "Pagamento de Boleto", "593,68 ", "D"], ["26/11/2026", "TED", "512,18 ", "D"],
           ["26/11/2026", "Pix - Recebido", "20.000,00 ", "C"], ["26/11/2026", "Tar DOC/TED", "13,60 ", "D"]]
    r = client.post("/comparador/comparar", files={"extrato": ("e.xlsx", xlsx(pd.DataFrame(ext), header=False)),
                                                    "ddata": ("c.xlsx", conferencia_dias())}).json()
    assert r["origem"] == "Conferência"
    x = client.post("/comparador/xlsx", files={"extrato": ("e.xlsx", xlsx(pd.DataFrame(ext), header=False)), "ddata": ("c.xlsx", conferencia_dias())})
    assert "conferencia" in x.headers["content-disposition"] and pd.ExcelFile(io.BytesIO(x.content)).sheet_names[0] == "Faltando na Conferência"
    assert [f["Histórico"] for f in r["faltando"]] == ["Tar DOC/TED"]             # só a tarifa não está na conferência
    assert len(r["agrupados"]) == 1 and r["agrupados"][0]["Lançamentos no banco"] == 2 and r["agrupados"][0]["Valor"] == -1593.68
    assert r["so_ddata"] == []                                                     # total do dia descartado; 27/11 ignorada
