def test_saude(client):
    assert client.get("/saude").json() == {"status": "ok", "protegido": False}


def test_lista_centros_e_itens(client):
    assert {c["codigo"] for c in client.get("/centros-custo").json()} >= {"ADM01", "ADM03", "CTPAS"}
    assert len(client.get("/itens-despesa").json()) == 98


def test_lista_eventos_com_filtro(client):
    todos = client.get("/eventos").json()
    assert len(todos) == 91  # 80 da folha + 11 do conselho (sócios)
    lanca = client.get("/eventos", params={"gera_lancamento": True, "grupo": "folha"}).json()
    assert len(lanca) == 49 and lanca[0]["nome_pdf"] == "Salário Base"
    assert [e["nome_pdf"] for e in client.get("/eventos", params={"q": "insS folha"}).json()] == ["INSS Folha"]


def test_cadastrar_evento_novo(client):
    novo = {"codigo_pdf": "777", "nome_pdf": "Gratificação X", "descricao": "Gratificação X", "secao": "adicional",
            "tipo_lancamento": "DEBITO", "item_despesa": 70}
    r = client.post("/eventos", json=novo)
    assert r.status_code == 201
    corpo = r.json()
    assert corpo["centro_custo_fixo"] is None and corpo["item_despesa"] == 70 and corpo["ordem"] == 50
    assert client.post("/eventos", json=novo).status_code == 409  # mesmo nome no PDF


def test_cadastro_valida_centro_item_e_campos_obrigatorios(client):
    base = {"nome_pdf": "Y", "descricao": "Y", "secao": "adicional", "tipo_lancamento": "DEBITO", "item_despesa": 70}
    assert client.post("/eventos", json={**base, "centro_custo_fixo": "NAOEXISTE"}).status_code == 422
    assert client.post("/eventos", json={**base, "item_despesa": 99999}).status_code == 422
    assert client.post("/eventos", json={**base, "item_despesa": None}).status_code == 422  # gera lançamento sem item
    ok = client.post("/eventos", json={**base, "gera_lancamento": False, "item_despesa": None, "tipo_lancamento": None})
    assert ok.status_code == 201


def test_atualizar_evento(client):
    e = client.get("/eventos", params={"q": "Salário Família"}).json()[0]
    corpo = {**e, "centro_custo_fixo": "ADM01"}
    corpo.pop("id"); corpo.pop("ativo")
    r = client.put(f"/eventos/{e['id']}", json=corpo)
    assert r.status_code == 200 and r.json()["centro_custo_fixo"] == "ADM01"
    assert client.get("/eventos/99999").status_code == 404


def test_excluir_evento_e_apelido(client):
    e = client.get("/eventos", params={"q": "Periculosidade 30%"}).json()[0]
    assert e["apelidos"] == ["Periculosidade"] and len(e["apelidos_ids"]) == 1
    sem = client.delete(f"/eventos/{e['id']}/apelidos/{e['apelidos_ids'][0]}").json()
    assert sem["apelidos"] == []
    assert client.delete(f"/eventos/{e['id']}").status_code == 204
    assert client.get(f"/eventos/{e['id']}").status_code == 404
    assert client.delete(f"/eventos/{e['id']}").status_code == 404


def test_desativar_evento_tira_do_csv(client):
    from pathlib import Path
    pdf = Path(__file__).parent / "fixtures" / "folha_oficina_08.pdf"
    e = client.get("/eventos", params={"q": "Salário Base"}).json()[0]
    corpo = {k: v for k, v in e.items() if k not in ("id", "apelidos", "apelidos_ids")}
    assert client.put(f"/eventos/{e['id']}", json={**corpo, "ativo": False}).json()["ativo"] is False
    linhas = client.post("/folha/processar", files={"arquivo": ("o.pdf", pdf.read_bytes(), "application/pdf")}).json()["linhas"]
    assert "Salário Base" not in [l["descricao"] for l in linhas]
