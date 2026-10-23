from app import config


def test_sem_senha_tudo_aberto(client):
    assert client.get("/eventos").status_code == 200
    assert client.get("/saude").json()["protegido"] is False


def test_com_senha(client, monkeypatch):
    monkeypatch.setattr(config, "SENHA_ACESSO", "segredo")
    assert client.get("/saude").json()["protegido"] is True
    assert client.get("/eventos").status_code == 401
    assert client.post("/login", json={"senha": "errada"}).status_code == 401
    token = client.post("/login", json={"senha": "segredo"}).json()["token"]
    assert client.get("/eventos").status_code == 401
    assert client.get("/eventos", headers={"Authorization": f"Bearer {token}"}).status_code == 200
    assert client.get("/eventos", headers={"Authorization": "Bearer x"}).status_code == 401
