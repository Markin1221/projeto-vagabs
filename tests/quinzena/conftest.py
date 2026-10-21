import sys, os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))
import pandas as pd
import pytest
from quinzena.extrato import COLS


@pytest.fixture
def mk():
    def _mk(rows):
        base = dict(data="01/04/2026", banco="Matriz", origem="Lançamento", tipo="Debito",
                    titulo=None, descricao=None, centro=None, item=None, fonte=None,
                    valor=-100.0, saldo=None, obs=None)
        out = []
        for i, r in enumerate(rows):
            d = {**base, **r}
            d["linha_origem"] = i + 3
            out.append(d)
        return pd.DataFrame(out, columns=COLS + ["linha_origem"])
    return _mk
