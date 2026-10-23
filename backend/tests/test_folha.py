from pathlib import Path

import pytest

PDF = Path(__file__).parent / "fixtures" / "folha_oficina.pdf"


def enviar(client, centro="ADM03", rota="/folha/processar", **extra):
    dados = {"centro_custo": centro, **extra} if centro else extra
    return client.post(rota, files={"arquivo": ("folha.pdf", PDF.read_bytes(), "application/pdf")}, data=dados)


@pytest.fixture()
def resp(client):
    r = enviar(client)
    assert r.status_code == 200, r.text
    return r.json()


def por_desc(resp):
    return {l["descricao"]: l for l in resp["linhas"]}


def test_cabecalho_e_periodo(resp):
    assert resp["departamento_pdf"] == "OFICINA" and resp["centro_custo"]["codigo"] == "ADM03"
    assert resp["periodo"] == {"inicio": "2026-05-01", "fim": "2026-05-31"} and resp["avisos"] == []


def test_evento_do_departamento_usa_o_centro_escolhido(resp):
    sal = por_desc(resp)["Salário Base"]
    assert (sal["valor"], sal["codigo_centro_de_custo"], sal["codigo_item_despesa"]) == (54244.65, "ADM03", "*070")
    assert sal["titulo"] == "Folha Oficina" and sal["observacoes"] == "Folha maio 26 Oficina"
    assert sal["data_inicial"] == sal["data_liquidacao"] == "2026-05-30"


def test_evento_fixo_vai_para_ctpas_com_item_sem_prefixo(resp):
    inss = por_desc(resp)["INSS Folha"]
    assert (inss["valor"], inss["codigo_centro_de_custo"], inss["codigo_item_despesa"], inss["tipo_lancamento"]) \
        == (5542.99, "CTPAS", "501", "CREDITO")


def test_por_padrao_traz_as_49_linhas_como_o_excel(resp):
    assert len(resp["linhas"]) == 49
    d = por_desc(resp)
    assert d["Saldo de Salário"]["valor"] == 0 and d["Plano Odontológico"]["valor"] == 0


def test_ocultar_zerados(client):
    linhas = enviar(client, ocultar_zerados="true").json()["linhas"]
    assert 0 < len(linhas) < 49 and all(l["valor"] != 0 for l in linhas)


def test_conferencias_batem_no_pdf_da_oficina(resp):
    conf = {c["nome"]: c for c in resp["conferencias"]}
    assert all(c["ok"] for c in conf.values()), conf
    assert conf["Total de adicionais"]["pdf"] == 91656.18 and conf["GPS Total Líquido"]["pdf"] == 27870.18
    assert len(conf) == 6


def test_calculados(resp):
    d = por_desc(resp)
    assert d["PIS Folha"]["valor"] == d["PIS Folha - Oficina"]["valor"] == 702.18
    assert d["Total FGTS  MÊS"]["valor"] == d["Total FGTS apurado recibos s/CS"]["valor"] == 5892.58
    assert d["Plano de Saúde - Total "]["valor"] == 1350.84  # Plano De Saúde - Mens. (675.42) x 2
    assert d["TOTAL LÍQUIDO A PAGAR SEM FÉRIAS"]["valor"] == 32387.41  # líquido - adiantamento - líquido de férias
    assert d["Total Líquido INSS - Oficina"]["valor"] == 21677.82  # soma dos componentes da GPS
    assert d["Desconto Empréstimo Crédito Trabalhador"]["valor"] == 0  # Total - Ativos


def test_ordem_segue_o_csv_original(resp):
    ordem = [l["descricao"] for l in resp["linhas"]]
    assert ordem[0] == "Salário Base" and ordem.index("INSS Folha") < ordem.index("Empresa Funcionários")


def test_sem_centro_sugere_pelo_departamento_do_pdf(client):
    r = enviar(client, centro=None)
    assert r.status_code == 200 and r.json()["centro_custo"]["codigo"] == "ADM03"


def test_centro_invalido(client):
    assert enviar(client, centro="CTPAS").status_code == 422
    assert enviar(client, centro="XXX").status_code == 422


def test_pdf_invalido(client):
    r = client.post("/folha/processar", files={"arquivo": ("x.pdf", b"nao e pdf", "application/pdf")},
                    data={"centro_custo": "ADM03"})
    assert r.status_code == 422


def test_evento_novo_gera_alerta_e_some_depois_de_cadastrar(client, db):
    from app.models import Evento
    from sqlalchemy import select
    ev = db.scalar(select(Evento).where(Evento.nome_pdf == "Hora Extra 50%"))
    ev.nome_pdf = "Hora Extra 50% (renomeada)"  # simula evento que o banco não conhece
    db.commit()
    novos = enviar(client).json()["eventos_novos"]
    assert [n["nome_pdf"] for n in novos] == ["Hora Extra 50%"] and novos[0]["codigo_pdf"] == "401"
    ev.nome_pdf = "Hora Extra 50%"
    db.commit()
    assert enviar(client).json()["eventos_novos"] == []


def test_csv_tem_as_17_colunas_na_ordem(client):
    r = enviar(client, rota="/folha/csv")
    assert r.status_code == 200 and "lancamentos_ADM03_2026-05.csv" in r.headers["content-disposition"]
    linhas = r.content.decode("utf-8-sig").splitlines()
    assert linhas[0] == ("titulo;descricao;tipo_lancamento;codigo_centro_de_custo;numero_conta;codigo_item_despesa;"
                         "codigo_fonte_recurso;id_forma_pagamento;num_parcelas;data_inicial;dias_intervalo;valor;"
                         "observacoes;id_lancamento_grupo;status_pagamento;data_liquidacao;banco_liquidacao")
    assert linhas[1] == ("Folha Oficina;Salário Base;DEBITO;ADM03;1-1;*070;;;;30/05/2026;;54244,65;"
                         "Folha maio 26 Oficina;;PAGO;30/05/2026;1-1")


ADM = Path(__file__).parent / "fixtures" / "folha_administrativo_08.pdf"
# valores do CSV de agosto que o Excel/usuário esperava (Administrativo, ADM01)
ESPERADO_ADM = {
    "Salário Base": 13610.31, "Férias": 3686.65, "Periculosidade 30%": 494.16, "Adicional Noturno 20%": 327.36,
    "Repouso Remunerado": 62.96, "1/3 Férias": 1393.61, "Salário Família": 67.54, "Vale Transporte": 223.85,
    "Plano De Saúde": 225.14, "Plano De Saúde - Mens.": 1350.84, "Plano Odontológico": 45.0,
    "Plano Odontológico - Mens.": 180.0, "INSS Férias": 453.05, "INSS Folha": 1090.05,
    "TOTAL LÍQUIDO A PAGAR (FÉRIAS)": 4851.23, "TOTAL LÍQUIDO A PAGAR SEM FÉRIAS": 5802.03,
    "Empresa Funcionários": 3915.01, "RAT Emp (RAT x FAP = 5,0721 %)": 992.86, "Terceiros 5,80 %": 1135.35,
    "PIS Folha": 195.75, "Total Líquido INSS - Oficina": 6043.22, "PIS Folha - Oficina": 195.75,
    "Total FGTS apurado recibos s/CS": 1468.71, "Total FGTS  MÊS": 1468.71, "Plano de Saúde - Total ": 2701.68,
}


def test_administrativo_agosto(client):
    r = client.post("/folha/processar", files={"arquivo": ("a.pdf", ADM.read_bytes(), "application/pdf")})
    assert r.status_code == 200, r.text
    corpo = r.json()
    assert corpo["centro_custo"]["codigo"] == "ADM01" and corpo["avisos"] == []
    assert corpo["eventos_novos"] == []  # "Periculosidade" é apelido de "Periculosidade 30%"
    assert all(c["ok"] for c in corpo["conferencias"]), corpo["conferencias"]
    linhas = {l["descricao"]: l["valor"] for l in corpo["linhas"] if l["valor"]}
    # "Plano de Saúde - Total " aparece 2x (débito/crédito): o dict guarda o valor, que é o mesmo
    assert linhas == ESPERADO_ADM
    assert len(corpo["linhas"]) == 49


def test_irrf_ferias_do_bloco_darf_nao_vira_desconto(resp):
    # no PDF da Oficina o 'IRRF Férias' só existe no bloco DARF IR, não é desconto da folha
    assert "IRRF Férias" in por_desc(resp) and por_desc(resp)["IRRF Férias"]["valor"] == 0


def test_vincular_apelido(client):
    from sqlalchemy import select  # noqa: F401
    eventos = client.get("/eventos", params={"q": "Hora Extra 50%"}).json()
    r = client.post(f"/eventos/{eventos[0]['id']}/apelidos", json={"nome": "Hora Extra 60%"})
    assert r.status_code == 201 and r.json()["apelidos"] == ["Hora Extra 60%"]
    assert client.post(f"/eventos/{eventos[0]['id']}/apelidos", json={"nome": "hora extra 60%"}).status_code == 409
