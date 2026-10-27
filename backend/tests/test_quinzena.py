import io
from pathlib import Path

import pytest
from openpyxl import load_workbook

FIX = Path(__file__).parent / "fixtures"
DADOS = {"data": "2026-03-09", "observacao": "2° Quinzena de Fevereiro 2026"}


def arq(nome):
    return ("arquivos", (nome, (FIX / nome).read_bytes()))


def processar(client, *nomes, **extra):
    r = client.post("/quinzena/processar", files=[arq(n) for n in nomes], data={**DADOS, **extra})
    assert r.status_code == 200, r.text
    return r.json()["arquivos"]


def valores(a):
    return {l["codigo"]: l["valor"] for l in a["linhas"]}


def test_interbairros_bate_com_a_planilha(client):
    """1ª quinzena de março/2026: todas as linhas iguais à aba 'lancamentos' da planilha."""
    a = processar(client, "quinzena_interbairros_1q_marco.xlsx", data="2026-03-20")[0]
    assert a["ok"] and a["grupo"] == "Interbairros"
    assert valores(a) == {
        "credito": 477542.28, "diesel": 284972.02, "pecas": 121273.25, "bandeira": 85861.89, "taxa_coop": 88886.97,
        "taxa_sind": 1860.42, "fap": 1004.62, "tarifas": 1085.40, "processos": 403.95, "acordo": 2260.23,
        "estorno_acordo": 2260.23, "financiamento": 4990.92, "pensao": 1621.00}


def test_taxa_conta_os_carros_inclusive_o_que_paga_sozinho(client):
    a = processar(client, "quinzena_interbairros.xlsx")[0]
    assert a["taxa"]["carros"] == 89 and (valores(a)["taxa_coop"], valores(a)["taxa_sind"]) == (88886.97, 11870.82)
    assert a["avisos"] == []


def test_formato_das_linhas(client):
    a = processar(client, "quinzena_interbairros.xlsx")[0]
    por = {l["codigo"]: l for l in a["linhas"]}
    assert por["tarifas"]["codigo_item_despesa"] == "*048" and por["tarifas"]["codigo_centro_de_custo"] == "ADM01"
    assert por["taxa_coop"]["codigo_item_despesa"] is None and por["taxa_coop"]["codigo_fonte_recurso"] == "*05"
    assert por["acordo"]["tipo_lancamento"] == "DEBITO" and por["acordo"]["codigo_fonte_recurso"] is None
    assert por["estorno_acordo"]["data_inicial"] == "2026-03-24" and por["credito"]["data_inicial"] == "2026-03-09"
    assert por["credito"]["titulo"] == "Deposito Permissionários Interbairros"
    assert por["credito"]["numero_conta"] == "46604-2"
    assert sum(p["valor"] for p in por["pecas"]["composicao"]) == pytest.approx(-por["pecas"]["valor"], abs=0.01)


def test_intermunicipal_e_taxa_do_carro_sozinho(client):
    a = processar(client, "quinzena_intermunicipal.xlsx")[0]
    v = valores(a)
    assert a["grupo"] == "Intermunicipal" and v["salario"] == 1893.84 and v["diesel"] == 141535.89
    assert (v["taxa_coop"], v["taxa_sind"]) == (23969.52, 3201.12) and a["avisos"] == []


def test_credito_informado_substitui_o_calculado(client):
    a = processar(client, "quinzena_intermunicipal.xlsx", creditos="39593,00")[0]
    assert valores(a)["credito"] == 39593.00


def test_evento_sem_regra_bloqueia(client):
    regra = next(r for r in client.get("/quinzena/regras").json() if r["padrao"] == "SALARIO DE")
    client.delete(f"/quinzena/regras/{regra['id']}")
    a = processar(client, "quinzena_intermunicipal.xlsx")[0]
    assert not a["ok"] and a["problemas"][0]["evento"]["sugestao"] == "SALARIO DE KATIA"
    r = client.post("/quinzena/gerar", files=[arq("quinzena_intermunicipal.xlsx")], data=DADOS)
    assert r.status_code == 422
    assert client.post("/quinzena/regras", json={"padrao": "salário de katia", "linha": "salario"}).status_code == 201
    assert processar(client, "quinzena_intermunicipal.xlsx")[0]["ok"]


def test_gerar_xlsx_e_zip(client):
    r = client.post("/quinzena/gerar", files=[arq("quinzena_interbairros.xlsx")], data=DADOS)
    assert r.status_code == 200 and 'Interbairros_09-03-2026.xlsx' in r.headers["content-disposition"]
    ws = load_workbook(io.BytesIO(r.content)).active
    cab = [c.value for c in ws[1]]
    assert cab[:3] == ["titulo", "descricao", "tipo_lancamento"] and len(cab) == 13
    linha = {k: ws.cell(2, i + 1) for i, k in enumerate(cab)}
    assert linha["numero_conta"].value == "46604-2" and linha["numero_conta"].number_format == "@"
    assert linha["observacoes"].value == "2° Quinzena de Fevereiro 2026"
    z = client.post("/quinzena/gerar", files=[arq("quinzena_interbairros.xlsx"), arq("quinzena_intermunicipal.xlsx")],
                    data={**DADOS, "formato": "csv"})
    assert z.status_code == 200 and z.content[:2] == b"PK"


def test_config_da_taxa(client):
    assert client.put("/quinzena/config", json={"taxa_cooperativa": 1000, "taxa_sindicato": 132.11,
                                                 "conta_quinzena": "1-1"}).status_code == 200
    a = processar(client, "quinzena_intermunicipal.xlsx")[0]
    assert valores(a)["taxa_coop"] == 24000.00 and a["linhas"][0]["numero_conta"] == "1-1"


def test_grupo_obrigatorio_quando_nome_nao_diz(client):
    r = client.post("/quinzena/processar", files=[("arquivos", ("relatorio.xlsx", (FIX / "quinzena_interbairros.xlsx").read_bytes()))],
                    data=DADOS).json()["arquivos"][0]
    # o nome do arquivo não diz, mas o evento '257 - REMUNERAÇÃO INTERBAIRROS' diz
    assert r["grupo"] == "Interbairros"
