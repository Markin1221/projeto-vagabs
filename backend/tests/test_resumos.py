import io
import zipfile
import pytest
from openpyxl import Workbook, load_workbook

from app import config, resumos as rs



def _bruto() -> bytes:
    """Relatório bruto de mentira, no mesmo layout do que o sistema exporta (nenhuma planilha fica no repositório)."""
    wb = Workbook()
    ws = wb.active
    ws.append(["Relatorio geral 06-10-2026 11-17"])
    ws.append(["Cap", "ID grupo lançamento", "Titulo", "Descrição", "Observação", "Data de Pagamento", "Tipo de Recorrência",
               "Tipo", "Valor Crédito", "Valor Débito", "Nº Parcelas"])
    ws.append(["0116", 1, "NFe - 1 Parcela 3/3", "Pagamento", "-", "01/11/2026", "RECORRENTE_POR_PERIODO", "DEBITO", "R$ 0,00", "R$ 109,00", 1])
    ws.append(["0116", 2, "TAXA ADMINISTRATIVA", "QUINZENAL", "-", "05/11/2026", "RECORRENTE_POR_PERIODO", "DEBITO", "R$ 0,00", "R$ 1.132,11", 24])
    ws.append(["0116", 3, "Devolução", "Devolução #1", "-", "05/11/2026", "RECORRENTE_POR_PERIODO", "DEBITO", "R$ 0,00", "R$ -109,00", 1])
    ws.append(["0116", 4, "CRÉDITO PUBLICIDADE", "CREDITO", "-", "20/11/2026", "RECORRENTE_POR_PERIODO", "CREDITO", "R$ 255,88", "R$ 0,00", 12])
    ws.append(["Total Crédito:", "Total Crédito:", "R$\xa0255,88", "", "Total Débito:", "", "", "", "Saldo:", "-R$\xa0876,23", ""])
    b = io.BytesIO()
    wb.save(b)
    return b.getvalue()

WHATS = """Encaminhada
Permissionário
12:58
Encaminhada
Janeiro a março 3.050,00
12:58
Abril 2025 a março 2026 3.350,00 12:58
Abril 2026 a julho 2026 3.850,00
Agosto e setembro 2026 4.084,00
"""


@pytest.fixture()
def rx(client, monkeypatch):
    monkeypatch.setattr(config, "RAIOX_SENHA", "secreta123")
    return {"X-Raiox-Token": client.post("/raiox/login", json={"senha": "secreta123"}).json()["token"]}


def test_valor_br():
    assert rs.valor_br("R$ 1.132,11") == 1132.11
    assert rs.valor_br("R$ 0,00") == 0 and rs.valor_br(None) == 0 and rs.valor_br("3350") == 3350
    assert rs.valor_br("3.350") == 3350 and rs.valor_br(12.5) == 12.5


def test_le_relatorio_bruto():
    r = rs.ler_relatorio(_bruto(), "novembro.xlsx")
    assert r["id"] == "2026-11" and len(r["linhas"]) == 4
    assert all(isinstance(l["debito"], float) for l in r["linhas"])
    assert (r["credito"], r["debito"]) == (255.88, 1132.11)


def test_texto_do_whatsapp():
    f = rs.ler_texto(WHATS)["faixas"]["permissionario"]
    assert [(x["de"], x["ate"], x["valor"]) for x in f] == [
        ("2025-01", "2025-03", 3050.0), ("2025-04", "2026-03", 3350.0), ("2026-04", "2026-07", 3850.0),
        ("2026-08", "2026-08", 4084.0), ("2026-09", "2026-09", 4084.0)]
    assert rs.custo_do_mes(f, "2025-11") == 3350 and rs.custo_do_mes(f, "2026-10") is None


def test_formatos_de_linha():
    t = rs.ler_texto("3350,00 - 01/25\n02/2025 3.400\na partir de outubro 2026 4.100,00", "motoristas")["faixas"]
    assert t["motorista1"] == t["motorista2"]
    assert [(x["de"], x["ate"], x["valor"]) for x in t["motorista1"]] == [
        ("2025-01", "2025-01", 3350.0), ("2025-02", "2025-02", 3400.0), ("2026-10", None, 4100.0)]
    assert rs.ler_texto("Motorista 1\nnov/25 3.514,73")["faixas"]["motorista1"][0]["de"] == "2025-11"
    assert rs.ler_texto("dezembro 2025 a fevereiro 3.000")["faixas"] == {"motorista1": [], "motorista2": [], "permissionario": []}


def test_planilha_de_custos():
    wb = Workbook()
    ws = wb.active
    ws.append(["Permissionário", "Motorista 1"])
    ws.append(["3350,00 - 01/25", "3514,73 - 01/25"])
    ws.append(["3350,00 - 02/25", "3514,73 - 02/25"])
    b = io.BytesIO(); wb.save(b)
    f = rs.ler_planilha_custos(b.getvalue())["faixas"]
    assert [x["de"] for x in f["permissionario"]] == ["2025-01", "2025-02"] and f["motorista1"][1]["valor"] == 3514.73
    assert f["motorista2"] == []


def test_api_fluxo_completo(client, rx):
    assert client.get("/resumos/custos").status_code == 403
    lido = client.post("/resumos/custos/texto", json={"texto": WHATS}, headers=rx).json()
    custos = {"permissionario": lido["faixas"]["permissionario"] + [{"de": "2026-10", "ate": None, "valor": 4100}],
              "motorista1": [{"de": "2025-01", "ate": None, "valor": 3514.73}], "motorista2": [{"de": "2025-01", "ate": None, "valor": 3514.73}],
              "motoristasIguais": False}
    assert client.put("/resumos/custos", json=custos, headers=rx).status_code == 200
    arqs = [("arquivos", ("novembro.xlsx", _bruto()))]
    p = client.post("/resumos/previa", files=arqs, headers=rx).json()
    m = p["meses"][0]
    assert m["permissionario"] == 4100 and m["motorista1"] == 3514.73 and not m["avisos"]
    assert m["saldo"] == round(m["credito"] - m["debito"] - 4100 - 2 * 3514.73, 2)
    r = client.post("/resumos/gerar", files=arqs * 2, headers=rx)
    z = zipfile.ZipFile(io.BytesIO(r.content))
    assert sorted(z.namelist()) == ["novembro_26.xlsx", "novembro_26_2.xlsx", "resumo_nov26.xlsx"]
    ws = load_workbook(io.BytesIO(z.read("novembro_26.xlsx"))).active
    assert [c.value for c in ws[2]] == ["Cap", "Titulo", "Descrição", "Data de Pagamento", "Valor Crédito", "Valor Débito"]
    assert isinstance(ws["F3"].value, (int, float)) and ws["F3"].number_format != "General"


def test_gerar_pdf(client, rx):
    arqs = [("arquivos", ("novembro.xlsx", _bruto()))]
    z = zipfile.ZipFile(io.BytesIO(client.post("/resumos/gerar", files=arqs, data={"formato": "ambos"}, headers=rx).content))
    assert sorted(z.namelist()) == ["novembro_26.pdf", "novembro_26.xlsx", "resumo_nov26.pdf", "resumo_nov26.xlsx"]
    assert z.read("novembro_26.pdf")[:4] == b"%PDF"
    assert client.post("/resumos/gerar", files=arqs, data={"formato": "doc"}, headers=rx).status_code == 422


def test_um_valor_para_os_dois_motoristas(client, rx):
    custos = {"motorista1": [{"de": "2025-01", "ate": None, "valor": 3514.73}], "motorista2": [], "permissionario": [], "motoristasIguais": True}
    assert client.put("/resumos/custos", json=custos, headers=rx).json()["motoristasIguais"] is True
    arqs = [("arquivos", ("novembro.xlsx", _bruto()))]
    m = client.post("/resumos/previa", files=arqs, headers=rx).json()["meses"][0]
    assert m["motorista1"] == m["motorista2"] == 3514.73
    client.put("/resumos/custos", json={**custos, "motoristasIguais": False}, headers=rx)
    assert client.post("/resumos/previa", files=arqs, headers=rx).json()["meses"][0]["motorista2"] is None
