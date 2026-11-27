from datetime import date

from sqlalchemy import select

from app.models import PagamentoAgendado
from app.routers.pagamentos import descrever, ocorre


def _p(**kw):
    base = dict(titulo="X", frequencia="MENSAL", dias="31", inicio=date(2026, 1, 1), fim=None, ativo=True)
    return PagamentoAgendado(**{**base, **kw})


def test_mensal_dia_31_cai_no_ultimo_dia():
    p = _p()
    assert ocorre(p, date(2026, 1, 31)) and ocorre(p, date(2026, 2, 28)) and ocorre(p, date(2026, 4, 30))
    assert not ocorre(p, date(2026, 4, 29))


def test_semanal_diario_e_prazo():
    seg_sex = _p(frequencia="SEMANAL", dias="0,4", fim=date(2026, 12, 31))
    assert ocorre(seg_sex, date(2026, 11, 23)) and ocorre(seg_sex, date(2026, 11, 27))  # segunda e sexta
    assert not ocorre(seg_sex, date(2026, 11, 24)) and not ocorre(seg_sex, date(2027, 1, 1))
    todo_dia = _p(frequencia="DIARIO", dias="")
    assert ocorre(todo_dia, date(2026, 11, 29)) and not ocorre(todo_dia, date(2025, 12, 31))  # antes do início
    assert descrever(todo_dia) == "Todo dia, sem prazo para acabar"
    assert descrever(_p(dias="5,20", fim=date(2027, 3, 1))) == "Todo mês no dia 5 e 20, até 01/03/2027"


def test_planilha_ja_vem_cadastrada(client):
    lista = {p["titulo"]: p for p in client.get("/pagamentos").json()}
    assert len(lista) == 23
    adv = lista["ADVOGADA FENATRAL"]
    assert adv["valor"] == 100.0 and adv["dias"] == [4] and "041.207.404-47" in adv["detalhes"]
    assert lista["PENSÃO CAP - 57"]["dias"] == [1, 15] and lista["CARNÊ CAP - 75"]["dias"] == [22, 29]
    dia19 = client.get("/pagamentos/agenda?de=2026-11-19&ate=2026-11-19").json()
    assert {i["titulo"] for i in dia19} == {"COMPESA", "INSS / FGTS", "TELEFONE / INTERNET", "GRANJA"}


def test_seed_v1_vira_v2(db):
    from app.models import Configuracao
    from app.seed.carregar import carregar_pagamentos_base
    db.add(Configuracao(chave="pagamentos_base", valor="1"))
    db.add(PagamentoAgendado(titulo="Allana Fenatral", detalhes="PIX 041.207.404-47", valor=100, frequencia="MENSAL", dias="1",
                             inicio=date(2026, 11, 1), ativo=True))
    db.add(PagamentoAgendado(titulo="Aluguel", frequencia="MENSAL", dias="5", inicio=date(2026, 11, 1), ativo=True))
    db.flush()
    assert carregar_pagamentos_base(db) == 21  # aluguel já existia (com outro dia: fica como está) e a Allana foi renomeada
    adv = db.scalar(select(PagamentoAgendado).where(PagamentoAgendado.titulo == "ADVOGADA FENATRAL"))
    assert adv.dias == "4" and float(adv.valor) == 100
    assert carregar_pagamentos_base(db) == 0


def test_cadastrar_editar_excluir(client):
    r = client.post("/pagamentos", json={"titulo": " Aluguel ", "valor": 1500, "frequencia": "mensal", "dias": [10],
                                         "inicio": "2026-11-01"})
    assert r.status_code == 201 and r.json()["titulo"] == "Aluguel" and r.json()["fim"] is None
    pid = r.json()["id"]
    assert client.post("/pagamentos", json={"titulo": "Y", "frequencia": "SEMANAL", "dias": []}).status_code == 422
    assert client.post("/pagamentos", json={"titulo": "Y", "frequencia": "MENSAL", "dias": [32]}).status_code == 422
    assert client.post("/pagamentos", json={"titulo": "Y", "frequencia": "MENSAL", "dias": [1], "inicio": "2026-11-10",
                                            "fim": "2026-11-01"}).status_code == 422
    r = client.put(f"/pagamentos/{pid}", json={"titulo": "Aluguel", "frequencia": "SEMANAL", "dias": [2], "inicio": "2026-11-01",
                                               "fim": "2026-12-31"})
    assert r.status_code == 200 and r.json()["dias"] == [2] and r.json()["fim"] == "2026-12-31"
    assert client.delete(f"/pagamentos/{pid}").status_code == 204
    assert len(client.get("/pagamentos").json()) == 23


def test_hoje_atrasados_e_pagar(client):
    pid = client.post("/pagamentos", json={"titulo": "Internet", "frequencia": "MENSAL", "dias": [20, 27],
                                           "inicio": "2026-11-01"}).json()["id"]
    r = client.get("/pagamentos/hoje?data=2026-11-27").json()
    assert "Internet" in [i["titulo"] for i in r["hoje"]]
    assert any(i["pagamento_id"] == pid and i["data"] == "2026-11-20" for i in r["atrasados"])
    assert client.post(f"/pagamentos/{pid}/pagar", json={"data": "2026-11-20"}).status_code == 201
    assert client.post(f"/pagamentos/{pid}/pagar", json={"data": "2026-11-21"}).status_code == 422  # não cai nesse dia
    r = client.get("/pagamentos/hoje?data=2026-11-27").json()
    assert not any(i["pagamento_id"] == pid for i in r["atrasados"])
    ag = client.get("/pagamentos/agenda?de=2026-11-01&ate=2026-11-30").json()
    assert [(i["data"], i["pago"]) for i in ag if i["pagamento_id"] == pid] == [("2026-11-20", True), ("2026-11-27", False)]
    assert client.delete(f"/pagamentos/{pid}/pagar/2026-11-20").status_code == 204
    assert any(i["data"] == "2026-11-20" for i in client.get("/pagamentos/hoje?data=2026-11-27").json()["atrasados"])
