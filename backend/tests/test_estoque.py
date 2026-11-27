from app.routers.estoque import chave_pessoa, nome_pessoa


def _produto(client, nome="Caneta azul", qtd=10):
    p = client.post("/estoque/produtos", json={"nome": nome, "minimo": 2}).json()
    client.post("/estoque/movimentos", json={"produto_id": p["id"], "tipo": "ENTRADA", "quantidade": qtd})
    return p


def test_nome_pessoa():
    assert nome_pessoa("  joão  DA silva ") == "João da Silva"


def test_entrada_e_saida_atualizam_saldo(client):
    p = _produto(client)
    r = client.post("/estoque/movimentos", json={"produto_id": p["id"], "tipo": "SAIDA", "quantidade": 3,
                                                 "pessoa": "maria", "data": "2026-11-20"})
    assert r.status_code == 201 and r.json()["pessoa"] == "Maria"
    assert client.get("/estoque/produtos").json()[0]["saldo"] == 7
    # sem pessoa ou sem saldo, não sai
    assert client.post("/estoque/movimentos", json={"produto_id": p["id"], "tipo": "SAIDA", "quantidade": 1}).status_code == 422
    assert client.post("/estoque/movimentos", json={"produto_id": p["id"], "tipo": "SAIDA", "quantidade": 99,
                                                    "pessoa": "Maria"}).status_code == 422
    # desfazer devolve o saldo
    assert client.delete(f"/estoque/movimentos/{r.json()['id']}").status_code == 204
    assert client.get("/estoque/produtos").json()[0]["saldo"] == 10


def test_ultima_retirada_por_pessoa(client):
    a, b = _produto(client), _produto(client, "Papel A4", 5)
    for pid, dt in ((a["id"], "2026-11-01"), (b["id"], "2026-11-15")):
        client.post("/estoque/movimentos", json={"produto_id": pid, "tipo": "SAIDA", "quantidade": 1, "pessoa": "Ana", "data": dt})
    ficha = client.get("/estoque/pessoas/ana").json()
    assert ficha["existe"] and ficha["resumo"]["ultima_retirada"] == "2026-11-15"
    assert ficha["resumo"]["ultimo_produto"] == "Papel A4" and ficha["resumo"]["retiradas"] == 2
    assert client.get("/estoque/pessoas/Fulano").json()["existe"] is False


def test_pedido_pendente_e_atendido(client):
    p = _produto(client)
    ped = client.post("/estoque/pedidos", json={"pessoa": "carlos", "produto_id": p["id"], "quantidade": 2}).json()
    assert ped["status"] == "PENDENTE"
    assert client.get("/estoque/pessoas/Carlos").json()["resumo"]["pendentes"] == 1
    at = client.post(f"/estoque/pedidos/{ped['id']}/atender", json={}).json()
    assert at["status"] == "ATENDIDO" and client.get("/estoque/produtos").json()[0]["saldo"] == 8
    assert client.post(f"/estoque/pedidos/{ped['id']}/atender", json={}).status_code == 409
    mov = client.get("/estoque/movimentos", params={"pessoa": "Carlos"}).json()[0]
    assert mov["pedido_id"] == ped["id"]
    client.delete(f"/estoque/movimentos/{mov['id']}")  # desfaz: pedido volta a pendente
    assert client.get("/estoque/pedidos", params={"status": "PENDENTE"}).json()[0]["id"] == ped["id"]


def test_pedido_de_produto_nao_cadastrado(client):
    r = client.post("/estoque/pedidos", json={"pessoa": "Bia", "descricao": "Grampeador"})
    assert r.status_code == 201 and r.json()["produto"] == "Grampeador"
    assert client.post("/estoque/pedidos", json={"pessoa": "Bia"}).status_code == 422


def test_nao_exclui_produto_com_movimento(client):
    p = _produto(client)
    assert client.delete(f"/estoque/produtos/{p['id']}").status_code == 409
    assert client.post("/estoque/produtos", json={"nome": "Caneta  azul"}).status_code == 409


def test_mesma_pessoa_escrita_diferente(client):
    assert chave_pessoa("Joao Silva") == chave_pessoa("JOÃO  da silva")
    p = _produto(client)
    client.post("/estoque/movimentos", json={"produto_id": p["id"], "tipo": "SAIDA", "quantidade": 1, "pessoa": "João da Silva"})
    r = client.post("/estoque/movimentos", json={"produto_id": p["id"], "tipo": "SAIDA", "quantidade": 1, "pessoa": "joao silva"})
    assert r.json()["pessoa"] == "João da Silva"
    assert client.post("/estoque/pedidos", json={"pessoa": "JOAO DA SILVA", "descricao": "Clips"}).json()["pessoa"] == "João da Silva"
    assert [x["pessoa"] for x in client.get("/estoque/pessoas").json()] == ["João da Silva"]
    assert client.get("/estoque/pessoas/joao silva").json()["resumo"]["retiradas"] == 2
