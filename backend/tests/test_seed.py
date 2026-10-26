from sqlalchemy import func, select

from app.models import CentroCusto, Evento, ItemDespesa
from app.seed.carregar import carregar


def _ev(db, nome):
    return db.scalar(select(Evento).where(Evento.nome_pdf == nome))


def test_seed_conta_tudo(db):
    novos = carregar(db)
    assert novos == {"centros_custo": 9, "itens_despesa": 98, "eventos": 91, "regras": 52}
    assert db.scalar(select(func.count()).select_from(Evento).where(Evento.gera_lancamento, Evento.grupo == "folha")) == 49


def test_seed_e_idempotente(db):
    carregar(db)
    assert carregar(db) == {"centros_custo": 0, "itens_despesa": 0, "eventos": 0, "regras": 0}


def test_seed_nao_sobrescreve_edicao_do_usuario(db):
    carregar(db)
    e = _ev(db, "Salário Base")
    e.descricao = "Salário Base (editado)"
    db.commit()
    carregar(db)
    assert _ev(db, "Salário Base").descricao == "Salário Base (editado)"


def test_centros_de_custo_base(db):
    carregar(db)
    centros = {c.codigo: c for c in db.scalars(select(CentroCusto))}
    assert centros["ADM04"].nome == "Oficina" and centros["ADM04"].tipo == "departamento"
    assert centros["CTPAS"].tipo == "passagem"


def test_item_despesa_base(db):
    carregar(db)
    assert db.scalar(select(ItemDespesa).where(ItemDespesa.codigo == 70)).nome == "Salários"
    assert db.scalar(select(ItemDespesa).where(ItemDespesa.codigo == 501)).grupo == "passagem"


def test_salario_base_usa_centro_do_departamento(db):
    carregar(db)
    e = _ev(db, "Salário Base")
    assert (e.codigo_pdf, e.tipo_lancamento, e.item_despesa.codigo) == ("001", "DEBITO", 70)
    assert e.centro_custo_fixo is None  # centro vem do departamento escolhido no upload


def test_salario_familia_e_inss_tem_centro_fixo(db):
    carregar(db)
    assert _ev(db, "Salário Família").centro_custo_fixo.codigo == "CTPAS"
    inss = _ev(db, "INSS Folha")
    assert (inss.centro_custo_fixo.codigo, inss.tipo_lancamento, inss.item_despesa.codigo) == ("CTPAS", "CREDITO", 501)


def test_eventos_conhecidos_que_nao_geram_lancamento(db):
    carregar(db)
    for nome in ("Adiantamento Salarial", "Adiantamento", "Estorno de Provisão (Crédito Trabalhador)",
                 "Provisão (Crédito Trabalhador)"):
        assert _ev(db, nome).gera_lancamento is False


def test_eventos_calculados(db):
    carregar(db)
    calc = {e.descricao: e.calculo for e in db.scalars(select(Evento).where(Evento.secao == "calculado"))}
    assert calc["PIS Folha - Oficina"] == "{PIS Folha}"
    assert calc["Desconto Empréstimo Crédito Trabalhador"].startswith("{Empréstimo (Crédito Trabalhador)|Total}")
    assert all(e.nome_pdf is None for e in db.scalars(select(Evento).where(Evento.secao == "calculado")))


def test_ordem_segue_o_csv(db):
    carregar(db)
    primeiros = [e.nome_pdf for e in db.scalars(select(Evento).where(Evento.grupo == "folha").order_by(Evento.ordem).limit(3))]
    assert primeiros == ["Salário Base", "Saldo de Salário", "Férias"]


def test_seed_corrige_nome_de_centro_ja_existente(db):
    carregar(db)
    c = db.scalar(select(CentroCusto).where(CentroCusto.codigo == "ADM02"))
    c.nome = "Posto"; db.commit()           # banco antigo, com o nome errado
    carregar(db)
    assert db.scalar(select(CentroCusto).where(CentroCusto.codigo == "ADM02")).nome == "Coleta"
