import pandas as pd
from quinzena.classificador import classificar_linha, classificar
from quinzena.padroes import aprender_favorecidos, aprender_padroes
from quinzena.regras import Regra

CFG = {"limiar_valor_alto": 5000, "palavras_transporte": [r"\bTRANS(P|PORTES?)?\b", "VIACAO|VIAÇÃO"]}
TED = "TED TRANSF.ELETR.DISPONIV - 403 0001 053259114000117 CLETO CORREIA"
R522 = "522 - REPASSE AO PERMISSIONÁRIO"


def _cl(mk, row, regras=(), hist=None):
    df = mk([row])
    hist = hist if hist is not None else mk([])
    return classificar_linha(df.iloc[0], list(regras), aprender_padroes(hist), aprender_favorecidos(hist), CFG)


def test_regra_explicita_vence(mk):
    s = _cl(mk, dict(titulo="PGTO", descricao="WURTH BR", item="999 - SOL"),
            [Regra("WURTH", "CTPAS", "520 - FORN", "Boleto", "T")])
    assert (s.item, s.origem_regra, s.manual) == ("520 - FORN", "regra", False)


def test_item_do_sol_e_respeitado(mk):
    s = _cl(mk, dict(titulo="PGTO", descricao="algo", centro="ADM01", item="048 - TAXA"))
    assert (s.item, s.centro, s.origem_regra) == ("048 - TAXA", "ADM01", "sol")


def _hist(mk):
    return mk([dict(descricao=TED, item="580 - EMPRESTIMO", valor=-201.94),
               dict(descricao=TED, item=R522, valor=-9771.67)])


def test_favorecido_conhecido_valor_baixo_580_alto_522(mk):
    h = _hist(mk)
    assert _cl(mk, dict(descricao=TED, valor=-240), hist=h).item == "580 - EMPRESTIMO"
    assert _cl(mk, dict(descricao=TED, valor=-12000), hist=h).item == R522


def test_favorecido_valor_na_faixa_ambigua_vai_para_manual(mk):
    s = _cl(mk, dict(descricao=TED, valor=-2000), hist=_hist(mk))
    assert s.manual and s.item is None


def test_hamilton_jose_trans_alto_vira_522(mk):
    d = "TED TRANSF.ELETR.DISPONIV - 341 0773 012345678000199 HAMILTON JOSE TRANS"
    s = _cl(mk, dict(descricao=d, valor=-8000))
    assert (s.item, s.origem_regra, s.manual) == (R522, "heuristica", False)
    assert _cl(mk, dict(descricao=d, valor=-300)).manual


def test_transferencia_na_descricao_nao_conta_como_transporte(mk):
    s = _cl(mk, dict(descricao="TRANSFERÊNCIA ENVIADA - 15/04 15:01 GIUSEPPE BRUNO NETO", valor=-9000))
    assert s.manual


def test_credito_coopernorte_nao_vira_repasse(mk):
    s = _cl(mk, dict(tipo="Credito", titulo="TED ENTRE BANCOS", valor=70000,
                     descricao="PIX - RECEBIDO - 02/04 14:47 07539233000106 COOPERNORTE"))
    assert s.manual and s.item != R522


def test_credito_nome_transporte_nunca_heuristica(mk):
    s = _cl(mk, dict(tipo="Credito", valor=90000, descricao="PIX - RECEBIDO - 02/04 14:47 11111111111 X TRANSPORTES"))
    assert s.manual


def test_valor_nan_vai_para_manual(mk):
    assert _cl(mk, dict(descricao=TED, valor=float("nan"), item="520 - X")).manual
    assert _cl(mk, dict(valor=0, item="520 - X")).manual


def test_padrao_historico_aplicado(mk):
    h = mk([dict(titulo=f"TARIFA BANCARIA {n}", centro="ADM01", item="048 - TAXA") for n in (1, 2, 3)])
    s = _cl(mk, dict(titulo="TARIFA BANCARIA 99", valor=-5), hist=h)
    assert (s.item, s.origem_regra) == ("048 - TAXA", "historico")


def test_desconhecido_vai_para_manual(mk):
    s = _cl(mk, dict(titulo="ALGO NOVO", descricao="???"))
    assert s.manual and s.origem_regra == "manual"


def test_transferencia_entre_contas_sugere_521_manual(mk):
    s = _cl(mk, dict(origem="Transferência", valor=50000, tipo="Credito"))
    assert s.manual and s.item.startswith("521")


def test_classificar_adiciona_colunas(mk):
    df = mk([dict(titulo="A", item="520 - X", centro="C"), dict(titulo="B")])
    out = classificar(df, [], {}, {}, CFG)
    assert list(out.manual) == [False, True] and "sug_item" in out.columns
