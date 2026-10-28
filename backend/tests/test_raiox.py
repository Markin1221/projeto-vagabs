from pathlib import Path

import pytest

from app import config, raiox
from app.routers import raiox as rota

EXTRATO = Path(__file__).parent / "fixtures" / "extrato_junho_2026.xlsx"


@pytest.fixture()
def rx(client, monkeypatch):
    monkeypatch.setattr(config, "RAIOX_SENHA", "secreta123")
    token = client.post("/raiox/login", json={"senha": "secreta123"}).json()["token"]
    return {"X-Raiox-Token": token}


def _arq():
    return {"arquivo": ("Junho_2026.xlsx", EXTRATO.read_bytes())}


def test_senha_do_raiox(client, monkeypatch):
    monkeypatch.setattr(config, "RAIOX_SENHA", "secreta123")
    assert client.post("/raiox/login", json={"senha": "errada"}).status_code == 403
    assert client.get("/raiox/meses").status_code == 403
    assert client.get("/raiox/meses", headers={"X-Raiox-Token": "x"}).status_code == 403
    assert client.post("/raiox/login", json={"senha": " secreta123\n"}).status_code == 200


def test_historico_comeca_com_epoca_boa(client, rx):
    meses = client.get("/raiox/meses", headers=rx).json()
    assert [m["id"] for m in meses] == ["2025-11", "2025-12", "2026-01", "2026-02"]
    assert all(m["formato"] == "antigo" for m in meses)


def test_regras_de_junho():
    doc, own = raiox.analisar(raiox.ler_planilha(EXTRATO.read_bytes()))
    assert doc["id"] == "2026-06"
    assert round(doc["receita"]) == 304613
    assert round(doc["resultado"]) == -111375
    chaves = {f["key"] for f in doc["flags"]}
    assert {"conta-garantida", "posto", "garantida-posto", "duplicados", "falta-quinzena:Interbairros"} <= chaves
    assert len(doc["lanc"]["dup"]) == 21


def test_analisar_compara_com_historico_e_salvar(client, rx):
    prev = client.post("/raiox/analisar", files=_arq(), headers=rx).json()
    assert prev["jaExiste"] is False
    picos = {a["key"] for a in prev["anomalias"]}
    assert "pico:Almoxarifado (estoque matriz)" in picos and "queda-receita" in picos
    assert prev["risco"] == 100
    assert len(client.get("/raiox/meses", headers=rx).json()) == 4  # prévia não salva
    client.post("/raiox/salvar", files=_arq(), headers=rx)
    client.post("/raiox/salvar", files=_arq(), headers=rx)  # mesmo mês substitui
    meses = client.get("/raiox/meses", headers=rx).json()
    assert [m["id"] for m in meses][-1] == "2026-06" and len(meses) == 5
    assert client.delete("/raiox/meses/2026-06", headers=rx).status_code == 200
    assert len(client.get("/raiox/meses", headers=rx).json()) == 4


def test_planilha_errada(client, rx):
    r = client.post("/raiox/analisar", files={"arquivo": ("x.xlsx", b"nao e planilha")}, headers=rx)
    assert r.status_code == 422


def test_parecer(client, rx, monkeypatch):
    client.post("/raiox/salvar", files=_arq(), headers=rx)
    pedidos = []
    monkeypatch.setattr(rota, "pedir_parecer", lambda p: pedidos.append(p) or "RESUMO\nBuraco de R$ 111 mil.")
    r = client.post("/raiox/meses/2026-06/parecer", headers=rx).json()
    assert r["parecer"].startswith("RESUMO") and "jun/26" in pedidos[0]
    junho = client.get("/raiox/meses", headers=rx).json()[-1]
    assert junho["parecer"].startswith("RESUMO")


def test_parecer_sem_chave(client, rx, monkeypatch):
    monkeypatch.setattr(config, "ANTHROPIC_API_KEY", "")
    client.post("/raiox/salvar", files=_arq(), headers=rx)
    assert client.post("/raiox/meses/2026-06/parecer", headers=rx).status_code == 503
