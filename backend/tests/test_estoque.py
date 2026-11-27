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


def test_editar_movimento_recalcula_saldo(client):
    p = _produto(client)  # entrada de 10
    s = client.post("/estoque/movimentos", json={"produto_id": p["id"], "tipo": "SAIDA", "quantidade": 2, "pessoa": "Ana"}).json()
    r = client.put(f"/estoque/movimentos/{s['id']}", json={"quantidade": 5, "pessoa": "bia", "data": "2026-11-01"})
    assert r.status_code == 200 and r.json()["pessoa"] == "Bia" and r.json()["data"] == "2026-11-01"
    assert client.get("/estoque/produtos").json()[0]["saldo"] == 5
    assert client.put(f"/estoque/movimentos/{s['id']}", json={"quantidade": 11, "pessoa": "Bia", "data": "2026-11-01"}).status_code == 422
    assert client.put(f"/estoque/movimentos/{s['id']}", json={"quantidade": 1, "pessoa": "", "data": "2026-11-01"}).status_code == 422


def test_limpar_tudo(client):
    p = _produto(client)
    client.post("/estoque/pedidos", json={"pessoa": "Ana", "produto_id": p["id"]})
    assert client.post("/estoque/limpar", json={}).json() == {"movimentos": 1, "pedidos": 0, "produtos": 0}
    assert client.get("/estoque/produtos").json()[0]["saldo"] == 0 and client.get("/estoque/movimentos").json() == []
    assert client.post("/estoque/limpar", json={"produtos": True}).json() == {"movimentos": 0, "pedidos": 1, "produtos": 1}
    assert client.get("/estoque/produtos").json() == [] and client.get("/estoque/pessoas").json() == []


def test_renomear_e_juntar_pessoas(client):
    p = _produto(client)
    for n in ("Ana Lima", "Aninha"):
        client.post("/estoque/movimentos", json={"produto_id": p["id"], "tipo": "SAIDA", "quantidade": 1, "pessoa": n})
    client.post("/estoque/pedidos", json={"pessoa": "Aninha", "descricao": "Clips"})
    assert client.put("/estoque/pessoas/ana lima", json={"nome": "Ána Lima"}).json() == {"pessoa": "Ána Lima", "juntou": False}
    r = client.put("/estoque/pessoas/Aninha", json={"nome": "ana lima"}).json()
    assert r == {"pessoa": "Ána Lima", "juntou": True}
    (so,) = client.get("/estoque/pessoas").json()
    assert so["pessoa"] == "Ána Lima" and so["retiradas"] == 2 and so["pendentes"] == 1
    assert client.put("/estoque/pessoas/Ninguem", json={"nome": "X"}).status_code == 404


def test_apagar_pessoa_devolve_estoque(client):
    p = _produto(client)  # 10
    client.post("/estoque/movimentos", json={"produto_id": p["id"], "tipo": "SAIDA", "quantidade": 3, "pessoa": "Ana"})
    ped = client.post("/estoque/pedidos", json={"pessoa": "Ana", "produto_id": p["id"], "quantidade": 2}).json()
    client.post(f"/estoque/pedidos/{ped['id']}/atender", json={})
    assert client.get("/estoque/produtos").json()[0]["saldo"] == 5
    assert client.delete("/estoque/pessoas/ana").json() == {"pessoa": "Ana", "retiradas": 2, "pedidos": 1}
    assert client.get("/estoque/produtos").json()[0]["saldo"] == 10
    assert client.get("/estoque/pessoas").json() == [] and client.get("/estoque/pedidos").json() == []


def test_saida_com_varios_itens_tudo_ou_nada(client):
    a, b = _produto(client, "Caneta", 10), _produto(client, "Papel", 2)
    r = client.post("/estoque/saidas", json={"pessoa": "ana", "itens": [{"produto_id": a["id"], "quantidade": 3},
                                                                         {"produto_id": b["id"], "quantidade": 1}]})
    assert r.status_code == 201 and [m["pessoa"] for m in r.json()] == ["Ana", "Ana"]
    falha = client.post("/estoque/saidas", json={"pessoa": "Ana", "itens": [{"produto_id": a["id"], "quantidade": 1},
                                                                            {"produto_id": b["id"], "quantidade": 5}]})
    assert falha.status_code == 422
    saldos = {p["nome"]: p["saldo"] for p in client.get("/estoque/produtos").json()}
    assert saldos == {"Caneta": 7, "Papel": 1}  # a caneta da saída que falhou não saiu


def test_produto_com_tamanhos(client):
    p = client.post("/estoque/produtos", json={"nome": "Camiseta", "tamanhos": ["p", "M", "g", "m"]}).json()
    assert [t["tamanho"] for t in p["tamanhos"]] == ["P", "M", "G"]
    mov = lambda **k: client.post("/estoque/movimentos", json={"produto_id": p["id"], **k})
    assert mov(tipo="ENTRADA", quantidade=5).status_code == 422                     # sem tamanho
    assert mov(tipo="ENTRADA", quantidade=5, tamanho="m").json()["tamanho"] == "M"
    assert mov(tipo="ENTRADA", quantidade=2, tamanho="gg").status_code == 201       # tamanho novo na entrada
    assert mov(tipo="SAIDA", quantidade=1, tamanho="P", pessoa="Ana").status_code == 422  # P está zerado
    s = mov(tipo="SAIDA", quantidade=2, tamanho="M", pessoa="Ana").json()
    prod = client.get("/estoque/produtos").json()[0]
    assert prod["saldo"] == 5 and {t["tamanho"]: t["saldo"] for t in prod["tamanhos"]} == {"P": 0, "M": 3, "G": 0, "GG": 2}
    assert client.get("/estoque/pessoas/Ana").json()["resumo"]["ultimo_produto"] == "Camiseta (M)"
    # editar e desfazer mexem no tamanho certo
    client.put(f"/estoque/movimentos/{s['id']}", json={"quantidade": 3, "pessoa": "Ana", "data": "2026-11-27"})
    assert {t["tamanho"]: t["saldo"] for t in client.get("/estoque/produtos").json()[0]["tamanhos"]}["M"] == 2
    client.delete(f"/estoque/movimentos/{s['id']}")
    assert client.get("/estoque/produtos").json()[0]["saldo"] == 7
    # não tira tamanho com estoque; tira o zerado
    base = {"nome": "Camiseta", "unidade": "un", "minimo": 0, "ativo": True}
    assert client.put(f"/estoque/produtos/{p['id']}", json={**base, "tamanhos": ["P", "G"]}).status_code == 422
    r = client.put(f"/estoque/produtos/{p['id']}", json={**base, "tamanhos": ["M", "GG"]}).json()
    assert [t["tamanho"] for t in r["tamanhos"]] == ["M", "GG"]


def test_pedido_com_tamanho(client):
    p = client.post("/estoque/produtos", json={"nome": "Bota", "tamanhos": ["38", "40"]}).json()
    client.post("/estoque/movimentos", json={"produto_id": p["id"], "tipo": "ENTRADA", "quantidade": 1, "tamanho": "40"})
    assert client.post("/estoque/pedidos", json={"pessoa": "Rui", "produto_id": p["id"]}).status_code == 422
    ped = client.post("/estoque/pedidos", json={"pessoa": "Rui", "produto_id": p["id"], "tamanho": "40"}).json()
    assert ped["tamanho"] == "40"
    client.post(f"/estoque/pedidos/{ped['id']}/atender", json={})
    prod = client.get("/estoque/produtos").json()[0]
    assert prod["saldo"] == 0 and client.get("/estoque/movimentos").json()[0]["tamanho"] == "40"


def test_nao_separa_por_tamanho_com_estoque_sem_tamanho(client):
    p = _produto(client)  # 10 sem tamanho
    base = {"nome": p["nome"], "unidade": "un", "minimo": 0, "ativo": True}
    assert client.put(f"/estoque/produtos/{p['id']}", json={**base, "tamanhos": ["P"]}).status_code == 422
    assert client.get("/estoque/produtos").json()[0]["tamanhos"] == []
