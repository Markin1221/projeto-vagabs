"""Compara o extrato do banco com a planilha do DDATA Sol e aponta o que falta lançar (porte do script antigo)."""
import io
import re
from collections import defaultdict

import pandas as pd

JANELA_DIAS = 15  # "valor em outra data" só vale se a diferença for de até 15 dias
COLS_EXTRATO = ["Data", "Tipo", "Valor", "Histórico", "Documento", "Detalhe", "_chave"]


def _bruto(conteudo: bytes) -> pd.DataFrame:
    """Lê só a primeira aba (a conferência tem centenas de abas por dia; carregar todas deixava tudo lento)."""
    import openpyxl
    try:
        wb = openpyxl.load_workbook(io.BytesIO(conteudo), read_only=True, data_only=True)
        ws = wb.worksheets[0]
        ws.reset_dimensions()  # alguns bancos gravam a dimensão errada
        linhas = [list(r) for r in ws.iter_rows(values_only=True)]
        wb.close()
        largura = max((len(r) for r in linhas), default=0)
        return pd.DataFrame([r + [None] * (largura - len(r)) for r in linhas])
    except Exception:
        return pd.read_excel(io.BytesIO(conteudo), header=None)


def _numero(v):
    """'1.015.951,19' -> 1015951.19 ; 1429.42 -> 1429.42 ; vazio -> None"""
    if pd.isna(v) or str(v).strip() == "":
        return None
    if isinstance(v, str):
        return round(float(v.replace(".", "").replace(",", ".")), 2)
    return round(float(v), 2)


def ler_extrato(conteudo: bytes) -> pd.DataFrame:
    """Dois layouts: (B) novo, 1 linha por lançamento com 'Data / Historico / Valor R$'; (A) antigo, 2 linhas por
    lançamento (a segunda traz o detalhe)."""
    df = _bruto(conteudo)
    for i in range(min(15, len(df))):
        valores = [str(v).strip() for v in df.iloc[i].values]
        if "Historico" in valores and "Valor R$" in valores:
            return _layout_colunas(df, i, valores)
    return _layout_antigo(df)


def _layout_colunas(df, linha_cab, cab):
    c_data, c_hist, c_deb = cab.index("Data"), cab.index("Historico"), cab.index("Valor R$")
    c_cred = c_deb + 1  # a coluna seguinte (sem título) tem os créditos
    c_inf = c_cred if c_cred < len(cab) and cab[c_cred] in ("Inf.", "Inf", "D/C", "C/D") else None  # layout com C/D
    c_doc = cab.index("Numero Documento") if "Numero Documento" in cab else None
    c_det = next((i for i, v in enumerate(cab) if v.startswith("Detalhamento")), None)
    dados = []
    for i in range(linha_cab + 1, len(df)):
        linha = df.iloc[i]
        data = pd.to_datetime(linha[c_data], dayfirst=True, errors="coerce")
        historico = str(linha[c_hist]).strip()
        if pd.isna(data) or "SALDO" in historico.upper().replace(" ", ""):
            continue
        if c_inf is not None:  # um só valor + letra C/D
            v, cd = _numero(linha[c_deb]), str(linha[c_inf]).strip().upper()
            deb, cred = (v, None) if cd == "D" else (None, v) if cd == "C" else (None, None)
        else:
            deb, cred = _numero(linha[c_deb]), _numero(linha[c_cred])
        if deb is None and cred is None:  # ex.: BB Rende Fácil (sem valor na linha)
            continue
        valor = deb if deb is not None else cred
        doc = ""
        if c_doc is not None and not pd.isna(linha[c_doc]):
            try:
                doc = str(int(float(linha[c_doc])))
            except ValueError:
                doc = str(linha[c_doc])
        detalhe = "" if c_det is None or pd.isna(linha[c_det]) else str(linha[c_det]).strip()
        dados.append({"Data": data.strftime("%d/%m/%Y"), "Tipo": "Débito" if deb is not None else "Crédito",
                      "Valor": valor, "Histórico": historico, "Documento": doc, "Detalhe": detalhe,
                      "_chave": -valor if deb is not None else valor})
    return pd.DataFrame(dados, columns=COLS_EXTRATO)


def _layout_antigo(df):
    """linha 1 = data, histórico, documento, valor, C/D; linha 2 = detalhe"""
    dados = []
    for i in range(len(df)):
        linha = df.iloc[i]
        data, cd = linha[0], str(linha[4]).strip().upper()
        if pd.isna(data) or cd not in ("C", "D"):
            continue
        bruto = str(linha[1])
        m = re.match(r"\s*\d+\s+\d+\s+\d+\s+(.*)", bruto)  # tira "0697  99015  470 " do começo
        historico = m.group(1).strip() if m else bruto.strip()
        if "SALDO" in historico.upper().replace(" ", ""):
            continue
        detalhe = ""
        if i + 1 < len(df) and pd.isna(df.iloc[i + 1][0]):
            detalhe = str(df.iloc[i + 1][1]).strip()
            detalhe = "" if detalhe == "nan" else detalhe
        doc = linha[2]
        try:
            doc = str(int(float(doc)))
        except (ValueError, TypeError):
            doc = "" if pd.isna(doc) else str(doc)
        valor = round(float(linha[3]), 2)
        dados.append({"Data": pd.to_datetime(data, dayfirst=True).strftime("%d/%m/%Y"),
                      "Tipo": "Débito" if cd == "D" else "Crédito", "Valor": valor, "Histórico": historico,
                      "Documento": doc, "Detalhe": detalhe, "_chave": -valor if cd == "D" else valor})
    return pd.DataFrame(dados, columns=COLS_EXTRATO)


def _ler_conferencia(bruto):
    """Planilha de conferência (primeira aba): cabeçalho com 'Situação'; cada pagamento = data, descrição, valor, situação,
    sequencial. Tudo é pagamento (débito)."""
    if not any("Situação" in {str(v).strip() for v in bruto.iloc[i].values} for i in range(min(10, len(bruto)))):
        return None
    dados = []
    for _, linha in bruto.iterrows():
        v = list(linha.values)
        pos = next((i for i, x in enumerate(v) if isinstance(x, (pd.Timestamp, __import__("datetime").datetime))), None)
        if pos is None or pos + 2 >= len(v):
            continue
        valor = _numero(v[pos + 2]) if not pd.isna(v[pos + 2]) else None
        if valor is None:
            continue
        sit = next((str(x).strip() for x in v[pos + 3:] if isinstance(x, str)), "")
        seq = next((str(int(x)) for x in v[pos + 3:] if isinstance(x, (int, float)) and not pd.isna(x) and float(x).is_integer() and x > 1000), "")
        dados.append({"Data": pd.Timestamp(v[pos]).strftime("%d/%m/%Y"), "Valor": -abs(valor),
                      "Título": seq, "Descrição": f"{str(v[pos + 1]).strip()} ({sit})" if sit else str(v[pos + 1]).strip()})
    return pd.DataFrame(dados, columns=["Data", "Valor", "Título", "Descrição"])


def _num_ok(x):
    return isinstance(x, (int, float)) and not isinstance(x, bool) and not pd.isna(x)


def _ler_dias(wb, datas):
    """Conferência com uma aba por dia ('26.11.26'): bloco do Banco do Brasil = coluna B crédito, C débito, E justificativa.
    Só lê as abas dos dias do extrato. A linha de total (= soma das outras de débito) é descartada."""
    dados = []
    for nome in wb.sheetnames:
        m = re.fullmatch(r"\s*(\d\d)\.(\d\d)\.(\d\d)\s*", nome)
        if not m:
            continue
        dia = f"{m[1]}/{m[2]}/20{m[3]}"
        if datas and dia not in datas:
            continue
        ws = wb[nome]
        ws.reset_dimensions()
        linhas = []
        for r in ws.iter_rows(min_row=4, max_col=5, values_only=True):
            r = list(r) + [None] * (5 - len(r))
            desc = "" if r[4] is None else str(r[4]).strip()
            if _num_ok(r[1]) and r[1]:
                linhas.append([round(float(r[1]), 2), desc])
            if _num_ok(r[2]) and r[2]:
                linhas.append([-round(float(r[2]), 2), desc])
        debitos = [l for l in linhas if l[0] < 0]
        if len(debitos) > 1:
            soma = round(sum(l[0] for l in debitos), 2)
            total = next((l for l in debitos if abs(soma - 2 * l[0]) < 0.015), None)  # l = soma dos outros
            if total is not None:
                linhas.remove(total)
        for valor, desc in linhas:
            dados.append({"Data": dia, "Valor": valor, "Título": nome.strip(), "Descrição": desc or "(sem justificativa)"})
    return pd.DataFrame(dados, columns=["Data", "Valor", "Título", "Descrição"])


def ler_ddata(conteudo: bytes, datas=None):
    import openpyxl
    try:
        wb = openpyxl.load_workbook(io.BytesIO(conteudo), read_only=True, data_only=True)
        if sum(bool(re.fullmatch(r"\s*\d\d\.\d\d\.\d\d\s*", n)) for n in wb.sheetnames) >= 2:
            try:
                return _ler_dias(wb, set(datas) if datas else None)
            finally:
                wb.close()
        wb.close()
    except Exception:
        pass
    bruto = _bruto(conteudo)
    conf = _ler_conferencia(bruto)
    if conf is not None:
        return conf
    linha_cab = next((i for i in range(min(15, len(bruto)))
                      if {"Data", "Valor"} <= {str(v).strip() for v in bruto.iloc[i].values}), None)
    if linha_cab is None:
        return None
    df = bruto.iloc[linha_cab + 1:].copy()
    df.columns = [str(v).strip() for v in bruto.iloc[linha_cab].values]
    df = df[df["Data"].notna() & df["Valor"].notna()].copy()
    df["Data"] = pd.to_datetime(df["Data"], dayfirst=True, errors="coerce")
    df = df[df["Data"].notna()]
    df["Data"] = df["Data"].dt.strftime("%d/%m/%Y")
    df["Valor"] = df["Valor"].astype(float).round(2)
    return df


def _subconjunto(valores, alvo, limite=200000):
    """Índices de `valores` (centavos) que somam `alvo`, ou None."""
    idx = sorted(range(len(valores)), key=lambda i: -valores[i])
    resto = [0] * (len(idx) + 1)
    for k in range(len(idx) - 1, -1, -1):
        resto[k] = resto[k + 1] + valores[idx[k]]
    passos = [0]

    def dfs(k, falta, esc):
        passos[0] += 1
        if falta == 0:
            return esc
        if k == len(idx) or passos[0] > limite or resto[k] < falta:
            return None
        v = valores[idx[k]]
        if v <= falta:
            r = dfs(k + 1, falta - v, esc + [idx[k]])
            if r is not None:
                return r
        return dfs(k + 1, falta, esc)
    return dfs(0, alvo, [])


def _agrupar(faltando, sobras):
    """Uma linha da planilha pode ser a soma de vários lançamentos do banco (ex.: 'dda' = todos os boletos do dia)."""
    usados, agrupados, restam = set(), [], []
    for so in sorted(sobras, key=lambda x: -abs(x["Valor"])):
        tipo = "Débito" if so["Valor"] < 0 else "Crédito"
        cand = [i for i in faltando.index if i not in usados and faltando.at[i, "Data"] == so["Data"] and faltando.at[i, "Tipo"] == tipo]
        if "dda" in str(so["Descrição"]).lower():
            cand = [i for i in cand if "boleto" in str(faltando.at[i, "Histórico"]).lower()]
        vals = [int(round(faltando.at[i, "Valor"] * 100)) for i in cand]
        achou = _subconjunto(vals, int(round(abs(so["Valor"]) * 100))) if 2 <= len(cand) <= 80 else None
        if achou and len(achou) >= 2:
            sel = [cand[k] for k in achou]
            usados.update(sel)
            agrupados.append({**so, "Lançamentos no banco": len(sel),
                              "Detalhe": "; ".join(str(faltando.at[i, "Detalhe"]) for i in sel)})
        else:
            restam.append(so)
    return faltando.drop(index=list(usados)), restam, agrupados


def comparar(extrato, ddata, ignorar_rende=True, ignorar_creditos=False, ignorar_datas=False) -> dict:
    """Cada lançamento do extrato 'consome' um do DDATA (mesma data e valor). O que sobra no extrato está faltando;
    desses, os que têm o valor no DDATA em outra data vão para `outra_data`. O que sobra no DDATA vai para `so_ddata`."""
    if ignorar_rende:
        extrato = extrato[~extrato["Histórico"].str.contains("Rende|RF Simples|Invest", case=False, na=False)]
    if (ddata["Valor"] <= 0).all():  # conferência da equipe só traz pagamentos: créditos do banco não entram
        ignorar_creditos = True
    if ignorar_creditos:
        extrato, ddata = extrato[extrato["Tipo"] == "Débito"], ddata[ddata["Valor"] < 0]
    extrato, ddata = extrato.reset_index(drop=True), ddata.reset_index(drop=True)
    extrato["_dt"] = pd.to_datetime(extrato["Data"], format="%d/%m/%Y")
    ddata["_dt"] = pd.to_datetime(ddata["Data"], format="%d/%m/%Y")
    chave = (lambda d, v: v) if ignorar_datas else (lambda d, v: (d, v))

    pool = defaultdict(list)
    for pos in range(len(ddata)):
        pool[chave(ddata.at[pos, "Data"], ddata.at[pos, "Valor"])].append(pos)
    faltando_pos = []
    for pos in range(len(extrato)):
        k = chave(extrato.at[pos, "Data"], round(extrato.at[pos, "_chave"], 2))
        if pool[k]:
            pool[k].pop(0)
        else:
            faltando_pos.append(pos)
    restantes = sorted(p for lista in pool.values() for p in lista)

    faltando_real, outra_data, consumidos = [], [], set()
    if ignorar_datas:
        faltando_real = faltando_pos
    else:
        por_valor = defaultdict(list)
        for p in restantes:
            por_valor[round(ddata.at[p, "Valor"], 2)].append(p)
        for pos in faltando_pos:
            candidatos = [p for p in por_valor.get(round(extrato.at[pos, "_chave"], 2), [])
                          if abs((ddata.at[p, "_dt"] - extrato.at[pos, "_dt"]).days) <= JANELA_DIAS]  # só datas próximas
            if candidatos:
                melhor = min(candidatos, key=lambda p: abs((ddata.at[p, "_dt"] - extrato.at[pos, "_dt"]).days))
                por_valor[round(extrato.at[pos, "_chave"], 2)].remove(melhor)
                consumidos.add(melhor)
                linha = extrato.loc[pos].drop(["_chave", "_dt"]).to_dict()
                linha["Data no DDATA"] = ddata.at[melhor, "Data"]
                linha["Título no DDATA"] = ddata.at[melhor, "Título"] if "Título" in ddata.columns else ""
                linha["Descrição no DDATA"] = ddata.at[melhor, "Descrição"] if "Descrição" in ddata.columns else ""
                linha["Diferença (dias)"] = int((ddata.at[melhor, "_dt"] - extrato.at[pos, "_dt"]).days)
                outra_data.append(linha)
            else:
                faltando_real.append(pos)
    sobras = [{"Data": ddata.at[p, "Data"], "Valor": ddata.at[p, "Valor"],
               "Título": ddata.at[p, "Título"] if "Título" in ddata.columns else "",
               "Descrição": ddata.at[p, "Descrição"] if "Descrição" in ddata.columns else ""}
              for p in restantes if p not in consumidos]
    faltando_df, sobras, agrupados = _agrupar(extrato.loc[faltando_real].drop(columns=["_chave", "_dt"]), sobras)
    return {"n_extrato": len(extrato), "n_ddata": len(ddata), "faltando": faltando_df,
            "outra_data": pd.DataFrame(outra_data), "so_ddata": pd.DataFrame(sobras),
            "agrupados": pd.DataFrame(agrupados)}


def para_xlsx(r: dict) -> bytes:
    buf = io.BytesIO()
    with pd.ExcelWriter(buf) as w:
        r["faltando"].to_excel(w, sheet_name="Faltando no DDATA", index=False)
        if not r["outra_data"].empty:
            r["outra_data"].to_excel(w, sheet_name="Valor existe em outra data", index=False)
        if not r["agrupados"].empty:
            r["agrupados"].to_excel(w, sheet_name="Soma de varios lancamentos", index=False)
        if not r["so_ddata"].empty:
            r["so_ddata"].to_excel(w, sheet_name="So no DDATA", index=False)
    return buf.getvalue()
