import io

from openpyxl import Workbook

from app import orcamento


def _planilha():
    wb = Workbook(); ws = wb.active
    ws.append(["Relatório Orçado x Realizado"])
    ws.append(["Código", "Evento", "Orçado (R$)", "Realizado (R$)", "Diferença (R$)", "%", "Crédito (R$)"])
    ws.append([None, "(Sem item)", 0, 0, 0, None, 100.5])
    ws.append(["001", "001 - ASSESSORIA", 1000, 1200, -200, 120, 0])
    ws.append(["002", "002 - CONTADORA", 500, 0, 500, 0, 0])
    ws.append(["070", "070 - SALÁRIOS", 800, 600, 200, 75, 0])
    ws.append([500, "500 - SALÁRIOS A PAGAR", 0, 300, -300, None, 10])
    ws.append(["Totais", "Totais", 2300, 2100, 200, 91.3, 110.5])
    b = io.BytesIO(); wb.save(b)
    return b.getvalue()


def test_le_eventos_e_totais():
    r = orcamento.ler(_planilha())
    assert r["titulo"] == "Relatório Orçado x Realizado"
    ev = {e["codigo"]: e for e in r["eventos"]}
    assert list(ev) == ["001", "002", "070", "500"]
    assert ev["001"]["nome"] == "ASSESSORIA" and ev["001"]["situacao"] == "estourou" and ev["001"]["pct"] == 120
    assert ev["002"]["situacao"] == "nao_usado"
    assert ev["070"]["situacao"] == "dentro" and ev["070"]["grupo"] == "Pessoal"
    assert ev["500"]["situacao"] == "sem_orcamento" and ev["500"]["pct"] is None and ev["500"]["grupo"] == "Contas a pagar"
    t = r["totais"]
    assert t["orcado"] == 2300 and t["realizado"] == 2100 and t["diferenca"] == 200
    assert t["credito"] == 110.5 and t["credito_sem_item"] == 100.5


def test_sem_cabecalho():
    wb = Workbook(); wb.active.append(["qualquer", "coisa"])
    b = io.BytesIO(); wb.save(b)
    try:
        orcamento.ler(b.getvalue())
        assert False
    except ValueError as e:
        assert "Orçado" in str(e)
