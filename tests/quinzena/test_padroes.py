from quinzena.padroes import normalizar_titulo, aprender_padroes, extrair_favorecido, aprender_favorecidos

C, I = "CTPAS - CONTAS DE PASSAGENS", "520 - FORNECEDORES A PAGAR DDA"


def test_normaliza_digitos():
    assert normalizar_titulo("NFe - 123 Parcela 1/4") == normalizar_titulo("NFe - 9 Parcela 2/2")


def test_padrao_consistente_aprendido(mk):
    df = mk([dict(titulo=f"NFe - {n} Parcela 1/2", centro=C, item=I) for n in (11, 22, 33, 44)])
    p = aprender_padroes(df)
    assert p[normalizar_titulo("NFe - 1 Parcela 1/2")][1] == I


def test_padrao_ambiguo_nao_aprendido(mk):
    rows = [dict(titulo="X 1", centro=C, item=I)] * 2 + [dict(titulo="X 2", centro=C, item="580 - Y")] * 2
    assert aprender_padroes(mk(rows)) == {}


def test_poucas_amostras_nao_aprendido(mk):
    assert aprender_padroes(mk([dict(titulo="Z 1", centro=C, item=I)] * 2)) == {}


def test_extrair_favorecido_ted_com_cnpj():
    assert extrair_favorecido("TED TRANSF.ELETR.DISPONIV - 403 0001 053259114000117 CLETO CORREIA") == \
        ("053259114000117", "CLETO CORREIA")


def test_extrair_favorecido_sem_documento():
    assert extrair_favorecido("TRANSFERÊNCIA ENVIADA - 15/04 15:01 GIUSEPPE BRUNO NETO") == \
        (None, "GIUSEPPE BRUNO NETO")
    assert extrair_favorecido("PIX - ENVIADO - 20/04 13:57 CEF MATRIZ") == (None, "CEF MATRIZ")
    assert extrair_favorecido(None) == (None, None)


def test_aprender_favorecidos_guarda_valor_e_item(mk):
    d = "TED TRANSF.ELETR.DISPONIV - 403 0001 053259114000117 CLETO CORREIA"
    df = mk([dict(descricao=d, item="580 - E", valor=-201.94), dict(descricao=d, item="522 - R", valor=-9771.67),
             dict(descricao=d, item=None, valor=-5)])
    f = aprender_favorecidos(df)
    assert sorted(f["053259114000117"]) == [(201.94, "580 - E"), (9771.67, "522 - R")]
