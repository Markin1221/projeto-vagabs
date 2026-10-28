from pathlib import Path

from app import guias

FIX = Path(__file__).parent / "fixtures"
FOLHAS = ["folha_administrativo_08.pdf", "folha_coleta_08.pdf", "folha_oficina_08.pdf", "folha_posto_08.pdf",
          "folha_socios_08.pdf"]


def test_le_a_guia_do_fgts():
    g = guias.ler_guia((FIX / "guia_fgts_07-2026.pdf").read_bytes())
    assert g["tipo"] == "fgts" and g["competencia"] == "07/2026"
    assert g["valores"] == {"fgts": 8181.74, "consignado": 5308.96, "total": 13490.70}


def test_folha_nao_e_guia():
    assert guias.ler_guia((FIX / "folha_coleta_08.pdf").read_bytes()) is None


def test_lote_soma_as_folhas_e_compara_com_a_guia(client):
    files = [("arquivos", (n, (FIX / n).read_bytes(), "application/pdf")) for n in FOLHAS + ["guia_fgts_07-2026.pdf"]]
    r = client.post("/folha/lote/processar", files=files).json()
    assert [a["tipo"] for a in r["arquivos"]] == ["folha"] * 5 + ["guia"]
    (g,) = r["guias"]
    fgts, consig = g["conferencias"]
    # agosto: 1.468,71 + 218,13 + 5.810,85 + 779,70 + 0 = 8.277,39 (a guia é de julho: 8.181,74)
    assert fgts["folhas"] == 8277.39 and fgts["guia"] == 8181.74 and fgts["diferenca"] == 95.65 and not fgts["ok"]
    assert consig["folhas"] == 5914.35 and len(fgts["composicao"]) == 5
    assert "07/2026" in g["aviso"] and "08/2026" in g["aviso"]


def test_zip_ignora_a_guia(client):
    files = [("arquivos", (n, (FIX / n).read_bytes(), "application/pdf")) for n in ["folha_coleta_08.pdf", "guia_fgts_07-2026.pdf"]]
    import io, zipfile
    z = zipfile.ZipFile(io.BytesIO(client.post("/folha/lote/csv", files=files).content))
    assert z.namelist() == ["lancamentos_Coleta_08-2026.csv"]
