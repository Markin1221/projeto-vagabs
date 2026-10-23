"""Compara o extrato do banco com a planilha do DDATA Sol e aponta o que falta lançar (porte do script antigo)."""
import io
import re
from collections import defaultdict

import pandas as pd

COLS_EXTRATO = ["Data", "Tipo", "Valor", "Histórico", "Documento", "Detalhe", "_chave"]


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
    df = pd.read_excel(io.BytesIO(conteudo), header=None)
    for i in range(min(15, len(df))):
        valores = [str(v).strip() for v in df.iloc[i].values]
        if "Historico" in valores and "Valor R$" in valores:
            return _layout_colunas(df, i, valores)
    return _layout_antigo(df)


def _layout_colunas(df, linha_cab, cab):
    c_data, c_hist, c_deb = cab.index("Data"), cab.index("Historico"), cab.index("Valor R$")
    c_cred = c_deb + 1  # a coluna seguinte (sem título) tem os créditos
    c_doc = cab.index("Numero Documento") if "Numero Documento" in cab else None
    c_det = next((i for i, v in enumerate(cab) if v.startswith("Detalhamento")), None)
    dados = []
    for i in range(linha_cab + 1, len(df)):
        linha = df.iloc[i]
        data = pd.to_datetime(linha[c_data], dayfirst=True, errors="coerce")
        historico = str(linha[c_hist]).strip()
        if pd.isna(data) or "SALDO" in historico.upper().replace(" ", ""):
            continue
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


def ler_ddata(conteudo: bytes):
    bruto = pd.read_excel(io.BytesIO(conteudo), header=None)
    linha_cab = next((i for i in range(min(15, len(bruto)))
                      if {"Data", "Valor"} <= {str(v).strip() for v in bruto.iloc[i].values}), None)
    if linha_cab is None:
        return None
    df = pd.read_excel(io.BytesIO(conteudo), header=linha_cab)
    df = df[df["Data"].notna() & df["Valor"].notna()].copy()
    df["Data"] = pd.to_datetime(df["Data"], dayfirst=True, errors="coerce")
    df = df[df["Data"].notna()]
    df["Data"] = df["Data"].dt.strftime("%d/%m/%Y")
    df["Valor"] = df["Valor"].astype(float).round(2)
    return df


def comparar(extrato, ddata, ignorar_rende=True, ignorar_creditos=False, ignorar_datas=False) -> dict:
    """Cada lançamento do extrato 'consome' um do DDATA (mesma data e valor). O que sobra no extrato está faltando;
    desses, os que têm o valor no DDATA em outra data vão para `outra_data`. O que sobra no DDATA vai para `so_ddata`."""
    if ignorar_rende:
        extrato = extrato[~extrato["Histórico"].str.contains("Rende", case=False, na=False)]
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
            candidatos = por_valor.get(round(extrato.at[pos, "_chave"], 2))
            if candidatos:
                melhor = min(candidatos, key=lambda p: abs((ddata.at[p, "_dt"] - extrato.at[pos, "_dt"]).days))
                candidatos.remove(melhor)
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
    return {"n_extrato": len(extrato), "n_ddata": len(ddata),
            "faltando": extrato.loc[faltando_real].drop(columns=["_chave", "_dt"]),
            "outra_data": pd.DataFrame(outra_data), "so_ddata": pd.DataFrame(sobras)}


def para_xlsx(r: dict) -> bytes:
    buf = io.BytesIO()
    with pd.ExcelWriter(buf) as w:
        r["faltando"].to_excel(w, sheet_name="Faltando no DDATA", index=False)
        if not r["outra_data"].empty:
            r["outra_data"].to_excel(w, sheet_name="Valor existe em outra data", index=False)
        if not r["so_ddata"].empty:
            r["so_ddata"].to_excel(w, sheet_name="So no DDATA", index=False)
    return buf.getvalue()
