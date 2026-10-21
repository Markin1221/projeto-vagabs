import json
from quinzena.regras import Regra, carregar_regras, casar_regra, salvar_regra


def test_arquivo_vazio_retorna_lista_vazia(tmp_path):
    p = tmp_path / "r.json"; p.write_text("")
    assert carregar_regras(str(p)) == []
    assert carregar_regras(str(tmp_path / "nao_existe.json")) == []


def test_kw_duplicada_mantem_primeira(tmp_path):
    p = tmp_path / "r.json"
    p.write_text(json.dumps([
        {"kw": "ABC", "centro": "A", "item": "1", "forma": "", "titulo": "T1"},
        {"kw": "abc", "centro": "B", "item": "2", "forma": "", "titulo": "T2"}]))
    rs = carregar_regras(str(p))
    assert len(rs) == 1 and rs[0].centro == "A"


def test_casar_ignora_caixa():
    rs = [Regra("WURTH BR", "C", "520", "Boleto", "T")]
    assert casar_regra(rs, "pgto wurth br ltda") is rs[0]
    assert casar_regra(rs, "outro") is None


def test_salvar_regra_nao_duplica(tmp_path):
    p = tmp_path / "r.json"; p.write_text("[]")
    r = Regra("XPTO", "C", "520", "", "T")
    salvar_regra(str(p), r); salvar_regra(str(p), r)
    assert len(json.loads(p.read_text(encoding="utf-8"))) == 1
