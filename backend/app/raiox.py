"""Raio-X do caixa: lê o extrato mensal do DDATA Sol (formato novo), aplica as regras de auditoria e compara o mês
com o histórico salvo para achar picos fora do padrão. Funções puras: o router cuida do banco e da senha."""
import io
import math
import re
import unicodedata
from datetime import date, datetime

import openpyxl

LINHAS = ["Interbairros", "Tiúma/Ponte (intermunicipal)", "Alimentadoras"]
MESES = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"]
# categorias de despesa fixa comparáveis com a época boa (nov/25 a fev/26); regex sobre o item normalizado
CATS = {
    "Salários": r"^SALARIOS", "Honorários diretoria": r"HONON?ARIOS", "INSS": r"^INSS$", "INSS parcelado": r"INSS PARCELADO",
    "FGTS": r"^FGTS", "Horas extras": r"HORAS EXTRAS", "Aluguel granja": r"ALUGUEL GRANJA", "Aluguel sede": r"ALUGUEL DE SEDE",
    "Centro de controle (CCO)": r"CENTRO DE CONTROLE", "Sistema de gestão": r"SISTEMA DE GEST", "Validadores": r"VALIDADORES",
    "Transporte diesel": r"TRANSPORTE DO DIESEL", "Almoxarifado (estoque matriz)": r"ESTOQUE ALMOXARIFADO", "Cesta básica": r"CESTA",
    "Jurídico": r"ASSESSORA JURIDICA", "Energia": r"ENERGIA", "Abastecimento carros/motos": r"ABASTECIMENTO CARROS",
    "Combustível presidente": r"COMBUSTIVEL PRESIDENTE", "Treinamentos": r"TREINAMENTO", "Outras despesas": r"^OUTRAS DESPESAS",
}
PASS_CODES = {"520", "522", "524", "527", "528", "529", "531", "532", "533", "536", "537", "580", "581"}
PESO = {"alta": 12, "media": 4, "info": 1}


def norm(s) -> str:
    s = unicodedata.normalize("NFD", str(s if s is not None else ""))
    s = "".join(c for c in s if unicodedata.category(c) != "Mn").upper()
    return re.sub(r"\s+", " ", re.sub(r"^\s*\d{3}\s*-\s*", "", s)).strip()


def codigo(s) -> str:
    m = re.match(r"^\s*(\d{3})\s*-", str(s or ""))
    return m.group(1) if m else ""


def vazio(s) -> bool:
    return s is None or str(s) == "None" or re.fullmatch(r"[—\-\s]*", str(s)) is not None


def brl(v) -> str:
    if v is None:
        return "—"
    t = f"{abs(v):,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    return ("−" if v < 0 else "") + "R$ " + t


def _data(v):
    if isinstance(v, datetime):
        return v.date()
    if isinstance(v, date):
        return v
    m = re.search(r"(\d{1,2})/(\d{1,2})/(\d{4})", str(v or ""))
    return date(int(m[3]), int(m[2]), int(m[1])) if m else None


def _br(d: date) -> str:
    return d.strftime("%d/%m/%Y")


def _cut(s, n=110) -> str:
    s = str(s or "")
    return s[:n] + "…" if len(s) > n else s


# ---------------------------------------------------------------- leitura
def ler_planilha(conteudo: bytes) -> list[dict]:
    """Primeira aba do .xlsx; acha a linha de cabeçalho com Data e Valor e lê as colunas pelo nome."""
    wb = openpyxl.load_workbook(io.BytesIO(conteudo), data_only=True, read_only=True)
    linhas = list(wb.worksheets[0].iter_rows(values_only=True))
    cab, col = None, {}
    for i, r in enumerate(linhas[:30]):
        nomes = [norm(x) for x in r]
        if "DATA" in nomes and "VALOR" in nomes:
            cab = i
            for j, n in enumerate(nomes):
                if n and n not in col:
                    col[n] = j
            break
    if cab is None:
        raise ValueError('Não achei a linha de cabeçalho com "Data" e "Valor". Confira se a planilha está no formato novo do DDATA.')
    g = lambda r, n: r[col[n]] if n in col and col[n] < len(r) else None  # noqa: E731
    out = []
    for i in range(cab + 1, len(linhas)):
        r = linhas[i]
        v, d = g(r, "VALOR"), _data(g(r, "DATA"))
        if not isinstance(v, (int, float)) or isinstance(v, bool) or d is None:
            continue
        s = g(r, "SALDO")
        out.append({"i": i + 1, "d": d, "tit": str(g(r, "TITULO") or ""), "desc": str(g(r, "DESCRICAO") or ""),
                    "cc": str(g(r, "CENTRO DE CUSTO") or ""), "item": str(g(r, "ITEM DE DESPESA") or ""), "v": float(v),
                    "s": float(s) if isinstance(s, (int, float)) and not isinstance(s, bool) else None})
    if not out:
        raise ValueError("Nenhum lançamento encontrado na planilha.")
    return out


def _L(r):
    return {"i": r["i"], "d": _br(r["d"]), "tit": _cut(r["tit"]), "desc": _cut(r["desc"]), "item": _cut(r["item"], 70), "v": round(r["v"], 2)}


# ---------------------------------------------------------------- regras
def analisar(R: list[dict], arquivo: str = "") -> tuple[dict, list[dict]]:
    """Devolve (documento do mês, lançamentos de despesa própria). O documento é o que vai para o banco."""
    flags = []

    def F(chave, sev, t, p):
        flags.append({"key": chave, "sev": sev, "t": t, "p": p})

    cont = {}
    for r in R:
        cont[(r["d"].year, r["d"].month)] = cont.get((r["d"].year, r["d"].month), 0) + 1
    ano, mes = max(cont, key=cont.get)
    mid, rotulo = f"{ano}-{mes:02d}", f"{MESES[mes - 1].lower()}/{str(ano)[2:]}"
    for r in R:
        r["n"], r["c"], r["txt"] = norm(r["item"]), codigo(r["item"]), norm(r["tit"] + " " + r["desc"])
        r["fin"] = bool(re.search(r"POSTO|CONTA GARANTIDA|POUPANCA|APLICACAO|RESGATE|RENDIMENTO", r["txt"])) and (
            vazio(r["item"]) or r["c"] == "521" or bool(re.search(r"TED ENTRE BANCOS|TRANSFERENCIAS ENTRE", r["n"])))

    # receita própria = taxa administrativa (centro ADM10)
    rec = []
    for r in R:
        if not re.match(r"ADM10", r["cc"], re.I) or r["v"] <= 0:
            continue
        alvo = r["n"] + " " + r["txt"]
        linha = LINHAS[1] if re.search(r"INTERMUNICIPAL|TIUMA", alvo) else LINHAS[0] if "INTERBAIRRO" in r["txt"] \
            else LINHAS[2] if "ALIMENTADOR" in r["txt"] else "Outra"
        ref, lag = "—", None
        m = re.search(r"(1|2)\s*[ºª°O]?\.?\s*(?:QUINZ\.?\s*)?(?:DE\s+)?(JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)", r["txt"])
        if m:
            ref, lag = f"{m[1]}ª quinz. {m[2].lower()}", (mes - 1 - MESES.index(m[2])) % 12
        rec.append({"d": _br(r["d"]), "linha": linha, "ref": ref, "lag": lag, "v": round(r["v"], 2)})
    receita = sum(x["v"] for x in rec)
    receita_linhas = {l: round(sum(x["v"] for x in rec if x["linha"] == l), 2) for l in LINHAS}
    for l in LINHAS:
        n = sum(1 for x in rec if x["linha"] == l)
        if n < 2:
            F("falta-quinzena:" + l, "alta", f"Faltou {2 - n} quinzena(s) de {l}",
              f"Entraram {n} de 2 taxas esperadas no mês. Verificar se o repasse está atrasado ou se deixou de ser cobrado.")
    for x in rec:
        if x["lag"] is not None and x["lag"] >= 2:
            F("atraso", "media", f"Taxa recebida com {x['lag']} meses de atraso",
              f"{x['linha']} ref. {x['ref']} só entrou em {x['d']}. Atraso obriga a cooperativa a pagar contas antes de receber.")

    # contas de passagem: item que recebe e paga no mês (ou código de passagem)
    itens = {}
    for r in R:
        if r["fin"] or re.match(r"ADM10", r["cc"], re.I):
            continue
        k = "(SEM ITEM)" if vazio(r["item"]) else r["n"]
        it = itens.setdefault(k, {"n": k, "c": "", "in": 0.0, "out": 0.0, "cr": False})
        it["c"] = r["c"] or it["c"]
        if r["v"] > 0:
            it["in"] += r["v"]; it["cr"] = True
        else:
            it["out"] += r["v"]
    em_passagem = [it for it in itens.values() if it["cr"] or it["c"] in PASS_CODES]
    pass_set = {it["n"] for it in em_passagem}
    passagem_l = sorted(({"n": "Outras entradas/saídas sem item" if it["n"] == "(SEM ITEM)" else it["n"],
                          "in": round(it["in"], 2), "out": round(it["out"], 2), "liq": round(it["in"] + it["out"], 2)}
                         for it in em_passagem), key=lambda p: p["liq"])
    passagem = sum(p["liq"] for p in passagem_l)
    for p in passagem_l:
        if p["liq"] < -20000 and p["in"] > 0:
            F("passagem:" + p["n"], "alta", f'Pagou mais do que recebeu em "{p["n"]}"',
              f"Entrou {brl(p['in'])} e saiu {brl(-p['out'])}: diferença de {brl(p['liq'])} bancada pela cooperativa.")

    own = [r for r in R if r["v"] < 0 and not r["fin"] and ("(SEM ITEM)" if vazio(r["item"]) else r["n"]) not in pass_set]
    despesas = sum(r["v"] for r in own)
    cats = {nm: round(-sum(r["v"] for r in own if re.search(rx, r["n"])), 2) for nm, rx in CATS.items()}
    item_stats = {}
    for r in own:
        x = math.log10(abs(r["v"]) + 1)
        s = item_stats.setdefault(r["n"] or "(SEM ITEM)", {"n": 0, "s": 0.0, "q": 0.0})
        s["n"] += 1; s["s"] += x; s["q"] += x * x

    # dinheiro de fora: Posto, conta garantida, poupança
    fin = [r for r in R if r["fin"]]

    def grupo(r):
        t = r["txt"]
        return "Conta garantida (crédito do banco)" if "GARANTIDA" in t else "Conta do Posto" if "POSTO" in t \
            else "Poupança" if "POUPANCA" in t else "Aplicação/rendimento"
    fg = {}
    for r in fin:
        o = fg.setdefault(grupo(r), {"g": grupo(r), "in": 0.0, "out": 0.0, "n": 0})
        o["n"] += 1
        o["in" if r["v"] > 0 else "out"] += r["v"]
    G = fg.get("Conta garantida (crédito do banco)")
    if G and G["in"] > 0:
        F("conta-garantida", "alta", "Usou o cheque especial da empresa (conta garantida)",
          f"Entrou {brl(G['in'])} de crédito bancário. Cobre o buraco mas gera juros.")
    P = fg.get("Conta do Posto")
    if P:
        F("posto", "alta" if P["in"] + P["out"] < 0 else "media", "Dinheiro indo e voltando entre Matriz e Posto",
          f"{P['n']} transferências: Posto mandou {brl(P['in'])}, Matriz mandou {brl(-P['out'])} "
          f"(saldo {brl(P['in'] + P['out'])}). Pedir o extrato da conta do Posto.")
    for g in (r for r in fin if "GARANTIDA" in r["txt"] and r["v"] > 0):
        mesmo = [r for r in fin if "POSTO" in r["txt"] and r["v"] < 0 and abs((r["d"] - g["d"]).days) <= 1]
        if mesmo:
            F("garantida-posto", "alta", "Pegou crédito no banco e mandou para o Posto quase ao mesmo tempo",
              f"{_br(g['d'])}: entrou {brl(g['v'])} da conta garantida e saiu {brl(-sum(r['v'] for r in mesmo))} para o Posto.")

    # duplicados
    vistos, parc = {}, {}
    for r in R:
        if abs(r["v"]) >= 100:
            vistos.setdefault((r["d"], r["v"], norm(r["tit"]), norm(r["desc"])), []).append(r)
        if r["v"] < 0 and re.search(r"PARCELA\s*\d+\s*/\s*\d+", norm(r["tit"])):
            parc.setdefault((norm(r["tit"]), r["v"]), []).append(r)
    grupos_dup = [a for a in vistos.values() if len(a) > 1] + [a for a in parc.values() if len(a) > 1]
    dup = list({id(r): r for a in grupos_dup for r in a}.values())
    dup.sort(key=lambda r: r["i"])
    if dup:
        val = sum(r["v"] for a in grupos_dup for r in a[1:])
        F("duplicados", "media", f"{len(dup)} lançamentos possivelmente duplicados",
          f"Mesmo valor, data e descrição, ou a mesma parcela de nota paga duas vezes. Valor em dúvida: {brl(val)}.")
    sem = [r for r in R if r["v"] < 0 and not r["fin"] and vazio(r["item"])]
    if sem:
        F("sem-item", "media", f"{len(sem)} saídas sem item de despesa",
          f"Somam {brl(sum(r['v'] for r in sem))}. Saída sem classificação não aparece em nenhum relatório.")
    sus = [r for r in R if r["v"] < 0 and not r["fin"]
           and re.search(r"POR FORA|DESPESA NEUTRA|EM NOME DE TERCEIROS|CHEQUE PAGO|ADIANTAMENTO", r["txt"] + " " + r["n"])]
    if sus:
        F("sensivel", "media", f"{len(sus)} saídas com descrição sensível",
          f'"Por fora", "despesa neutra", cheque, pagamento em nome de terceiros: {brl(sum(r["v"] for r in sus))}. Pedir comprovante de cada um.')
    ruins, minimo = [], None
    for a, b in zip(R, R[1:]):
        if a["s"] is not None and b["s"] is not None and abs(a["s"] + b["v"] - b["s"]) > 0.05:
            ruins.append(b)
        if b["s"] is not None and (minimo is None or b["s"] < minimo["v"]):
            minimo = {"v": round(b["s"], 2), "d": _br(b["d"])}
    if ruins:
        F("saldo-nao-fecha", "media", f"{len(ruins)} linhas onde o saldo não fecha",
          "Saldo da linha diferente de saldo anterior + valor. Pode ser fórmula quebrada ou lançamento editado à mão.")
    if minimo and minimo["v"] < -50000:
        F("saldo-negativo", "info", "Saldo ficou muito negativo durante o mês",
          f"Mínimo de {brl(minimo['v'])} em {minimo['d']}. Indica pagamentos feitos antes da entrada do dinheiro.")

    doc = {
        "id": mid, "rotulo": rotulo, "formato": "novo", "arquivo": arquivo, "enviadoEm": datetime.now().isoformat(timespec="seconds"),
        "receita": round(receita, 2), "receitaLinhas": receita_linhas, "receitaDet": rec, "despesas": round(despesas, 2),
        "fixas": round(sum(cats.values()), 2), "cats": cats, "passagem": round(passagem, 2), "pass": passagem_l,
        "resultado": round(receita + despesas + passagem, 2), "financiamento": round(sum(r["v"] for r in fin), 2),
        "finG": [{**o, "in": round(o["in"], 2), "out": round(o["out"], 2)} for o in fg.values()],
        "flags": flags, "itemStats": item_stats, "saldoMin": minimo,
        "finLanc": [{**_L(r), "g": grupo(r)} for r in fin][:200],
        "lanc": {"dup": [_L(r) for r in dup[:60]], "sus": [_L(r) for r in sus[:60]], "sem": [_L(r) for r in sem[:60]],
                 "big": [_L(r) for r in sorted(own, key=lambda r: r["v"])[:15]], "saldo": [_L(r) for r in ruins[:60]]},
    }
    return doc, own


# ---------------------------------------------------------------- modelo de picos
def _stat(a):
    n = len(a)
    if not n:
        return None
    m = sum(a) / n
    sd = math.sqrt(sum((x - m) ** 2 for x in a) / max(1, n - 1))
    return n, m, sd


def detectar(doc: dict, own: list[dict], historico: list[dict]) -> dict:
    """Compara o mês com os outros meses salvos: picos por categoria, queda de receita e pagamentos atípicos
    para o próprio item (z-score do log do valor, com as estatísticas acumuladas de todos os meses)."""
    H = [h for h in historico if h.get("id") != doc["id"]]
    out = []

    def A(chave, sev, t, p):
        out.append({"key": chave, "sev": sev, "t": t, "p": p})

    for c in CATS:
        st = _stat([(h.get("cats") or {}).get(c, 0) or 0 for h in H])
        v = doc["cats"].get(c, 0)
        if not st or st[0] < 3:
            continue
        n, m, sd = st
        z = (v - m) / max(sd, m * 0.10, 500)
        if z > 2 and v - m > 3000:
            A("pico:" + c, "alta" if z > 3.5 else "media", f"Pico em {c}",
              f"{brl(v)} no mês contra média histórica de {brl(m)} ({n} meses). Está {z:.1f} desvios acima do normal.")
    st = _stat([h.get("receita") or 0 for h in H])
    if st and st[0] >= 3:
        n, m, sd = st
        z = (doc["receita"] - m) / max(sd, m * 0.03)
        if z < -2:
            A("queda-receita", "alta" if z < -4 else "media", "Receita própria abaixo do histórico",
              f"{brl(doc['receita'])} contra média de {brl(m)}. {abs(z):.1f} desvios abaixo do normal.")
    for l in LINHAS:
        st = _stat([(h.get("receitaLinhas") or {}).get(l, 0) or 0 for h in H])
        v = doc["receitaLinhas"].get(l, 0)
        if st and st[0] >= 3 and v < st[1] * 0.8:
            A("queda-linha:" + l, "media", f"Taxa de {l} caiu", f"{brl(v)} contra média de {brl(st[1])}.")
    st = _stat([h.get("fixas") or 0 for h in H])
    if st and st[0] >= 3 and doc["fixas"] > st[1] + 2 * max(st[2], st[1] * 0.05):
        A("pico:fixas", "media", "Despesas fixas acima do histórico", f"{brl(doc['fixas'])} contra média de {brl(st[1])}.")

    pool = {}
    for h in H + [doc]:
        for i, s in (h.get("itemStats") or {}).items():
            p = pool.setdefault(i, {"n": 0, "s": 0.0, "q": 0.0})
            p["n"] += s["n"]; p["s"] += s["s"]; p["q"] += s["q"]
    atip = []
    for r in own:
        p = pool.get(r["n"] or "(SEM ITEM)")
        if not p or p["n"] < 6 or abs(r["v"]) < 1000:
            continue
        x = math.log10(abs(r["v"]) + 1)
        n, s, q = p["n"] - 1, p["s"] - x, p["q"] - x * x  # deixa o próprio lançamento de fora
        m = s / n
        sd = math.sqrt(max(0.0, q / n - m * m))
        z = (x - m) / max(sd, 0.15)
        if z > 2.5:
            atip.append({**_L(r), "z": round(z, 1), "tipico": round(10 ** m)})
    atip.sort(key=lambda a: -a["z"])
    if atip:
        a = atip[0]
        A("atipicos", "media", f"{len(atip)} pagamentos com valor fora do comum para o próprio item",
          f"Valores muito acima do que esse item costuma ter. O maior: {a['tit']} ({brl(a['v'])}, típico ~{brl(-a['tipico'])}).")
    return {"anomalias": out, "atip": atip[:40]}


def risco(doc: dict) -> int:
    return min(100, sum(PESO.get(f["sev"], 0) for f in (doc.get("flags") or []) + (doc.get("anomalias") or [])))


def processar(conteudo: bytes, arquivo: str, historico: list[dict]) -> dict:
    doc, own = analisar(ler_planilha(conteudo), arquivo)
    doc.update(detectar(doc, own, historico))
    doc["risco"] = risco(doc)
    return doc


def prompt_parecer(doc: dict, historico: list[dict]) -> str:
    import json
    H = [{"mes": h["rotulo"], "base": h.get("formato") == "antigo", "receita": round(h.get("receita") or 0),
          "fixas": round(h.get("fixas") or 0), "resultado": None if h.get("resultado") is None else round(h["resultado"]),
          "cats": h.get("cats")} for h in historico if h["id"] != doc["id"]]
    ctx = {"mes": doc["rotulo"], "receita": doc["receita"], "receitaLinhas": doc["receitaLinhas"], "fixas": doc["fixas"],
           "despesasTotais": doc.get("despesas"), "passagem": doc.get("passagem"), "resultado": doc.get("resultado"),
           "coberturaExterna": doc.get("financiamento"), "finG": doc.get("finG"), "contasPassagem": doc.get("pass"),
           "categorias": doc["cats"], "alertas": doc.get("flags"), "picos": doc.get("anomalias"),
           "atipicos": (doc.get("atip") or [])[:10], "duplicados": ((doc.get("lanc") or {}).get("dup") or [])[:10],
           "sensiveis": ((doc.get("lanc") or {}).get("sus") or [])[:10], "historico": H}
    return ("Você é auditor financeiro de uma cooperativa de transporte (Coopernorte, Recife). A cooperativa recebe repasses das "
            "linhas Interbairros, Tiúma/Ponte (intermunicipal) e Alimentadoras, fica com uma taxa administrativa (receita própria) e "
            "repassa o resto a permissionários e fornecedores (contas de passagem). Entre nov/25 e fev/26 o caixa estava saudável; "
            "hoje há um rombo.\n\nEscreva um parecer em português do Brasil, texto simples sem markdown (sem #, sem **), com estas "
            "partes, cada uma com título em MAIÚSCULAS numa linha própria:\nRESUMO (3 frases: tamanho do buraco do mês e a causa "
            "principal)\nO QUE PIOROU EM RELAÇÃO À ÉPOCA BOA (itens com números)\nSINAIS DE ALERTA (o que pode indicar erro, desvio "
            "ou má gestão, sem acusar ninguém; diga o que é fato e o que é suspeita)\nO QUE CONFERIR PRIMEIRO (lista numerada, "
            "máximo 6, com documentos a pedir)\nUse R$ com valores arredondados. Seja direto e não invente dados que não estão "
            "abaixo.\n\nDADOS DO MÊS E HISTÓRICO (JSON):\n" + json.dumps(ctx, ensure_ascii=False, default=str))


# ---------------------------------------------------------------- análise do período inteiro
def _abs_mes(mid: str) -> int:
    a, m = mid.split("-")
    return int(a) * 12 + int(m) - 1


def _rot(n: int) -> str:
    return f"{MESES[n % 12].lower()}/{str(n // 12)[2:]}"


def analise_completa(historico: list[dict]) -> dict:
    """Junta todos os meses enviados (formato novo). O que é empréstimo num mês e devolução no outro se compensa aqui:
    saldo acumulado com Posto/banco/poupança, contas de passagem somadas no período e quinzenas de taxa que nunca chegaram."""
    meses = sorted((h for h in historico if h.get("formato") == "novo"), key=lambda h: h["id"])
    base = [h for h in historico if h.get("formato") == "antigo"]
    if not meses:
        return {"meses": [], "flags": [], "vazio": True}
    flags = []

    def F(chave, sev, t, p):
        flags.append({"key": chave, "sev": sev, "t": t, "p": p})

    soma = lambda c: round(sum(h.get(c) or 0 for h in meses), 2)  # noqa: E731
    tot = {c: soma(c) for c in ("receita", "despesas", "fixas", "passagem", "resultado", "financiamento")}

    # 1) dinheiro de fora mês a mês, com saldo acumulado (empréstimo num mês, devolução no outro)
    grupos = sorted({g["g"] for h in meses for g in h.get("finG") or []})
    contas = []
    for g in grupos:
        acum, linhas = 0.0, []
        for h in meses:
            o = next((x for x in h.get("finG") or [] if x["g"] == g), {"in": 0, "out": 0})
            acum += o["in"] + o["out"]
            linhas.append({"mes": h["rotulo"], "in": round(o["in"], 2), "out": round(o["out"], 2), "acum": round(acum, 2)})
        contas.append({"g": g, "meses": linhas, "aberto": round(acum, 2),
                       "entrou": round(sum(x["in"] for x in linhas), 2), "saiu": round(sum(x["out"] for x in linhas), 2)})
    for c in contas:
        if "garantida" in c["g"].lower() and c["aberto"] > 1000:
            F("completa:garantida", "alta", "Crédito do banco ainda não devolvido",
              f"No período entraram {brl(c['entrou'])} da conta garantida e voltaram {brl(-c['saiu'])}. Em aberto: {brl(c['aberto'])}, gerando juros.")
        elif "posto" in c["g"].lower() and abs(c["aberto"]) > 1000:
            quem = "a Matriz deve ao Posto" if c["aberto"] > 0 else "o Posto deve à Matriz"
            F("completa:posto", "alta", "Empréstimos entre Matriz e Posto não fecham no período",
              f"Somando todos os meses, Posto mandou {brl(c['entrou'])} e Matriz mandou {brl(-c['saiu'])}: {quem} {brl(abs(c['aberto']))}. "
              "Conferir no extrato do Posto se esse dinheiro voltou.")

    # 2) contas de passagem somadas no período
    itens = {}
    for h in meses:
        for p in h.get("pass") or []:
            it = itens.setdefault(p["n"], {"n": p["n"], "in": 0.0, "out": 0.0, "porMes": {}})
            it["in"] += p["in"]; it["out"] += p["out"]; it["porMes"][h["rotulo"]] = round(p["liq"], 2)
    passagem = []
    for it in itens.values():
        liq = it["in"] + it["out"]
        pior = min(it["porMes"].values()) if it["porMes"] else 0
        situ = "rombo" if liq < -20000 else "compensou" if pior < -20000 else "ok"
        passagem.append({"n": it["n"], "in": round(it["in"], 2), "out": round(it["out"], 2), "liq": round(liq, 2), "porMes": it["porMes"], "situacao": situ})
    passagem.sort(key=lambda p: p["liq"])
    for p in passagem:
        if p["situacao"] == "rombo" and p["in"] > 0:
            F("completa:passagem:" + p["n"], "alta", f'"{p["n"]}" fica negativo mesmo somando todos os meses',
              f"No período entrou {brl(p['in'])} e saiu {brl(-p['out'])}: {brl(p['liq'])} pagos com dinheiro da cooperativa e não recuperados.")
    compensou = [p for p in passagem if p["situacao"] == "compensou"]
    if compensou:
        F("completa:compensou", "info", f"{len(compensou)} conta(s) de passagem negativas num mês e compensadas depois",
          "Diferença de época (pagou antes, recebeu depois), não perda: " + ", ".join(p["n"] for p in compensou[:5]) + ".")

    # 3) quinzenas de taxa por mês de referência (recebidas em qualquer mês)
    recebidas = {}
    for h in meses:
        pago = _abs_mes(h["id"])
        for r in h.get("receitaDet") or []:
            if r.get("lag") is None or r["linha"] not in LINHAS:
                continue
            q = r["ref"].split("ª")[0]
            chave = (r["linha"], pago - r["lag"], q)
            recebidas.setdefault(chave, []).append({"pagoEm": h["rotulo"], "d": r["d"], "v": r["v"], "atraso": r["lag"]})
    ini, fim = _abs_mes(meses[0]["id"]), _abs_mes(meses[-1]["id"])
    faltando = []
    for l in LINHAS:
        for m in range(ini - 2, fim + 1):
            for q in ("1", "2"):
                # mês em que essa quinzena costuma ser paga: Interbairros/Tiúma pagam a 1ª no próprio mês e a 2ª no seguinte;
                # Alimentadoras pagam as duas no mês seguinte. Só cobra se esse mês está entre os enviados.
                prazo = m + (1 if l == LINHAS[2] or q == "2" else 0)
                if ini <= prazo <= fim and (l, m, q) not in recebidas:
                    faltando.append({"linha": l, "ref": f"{q}ª quinz. {_rot(m)}"})
    media_q = {}
    for l in LINHAS:
        vals = [(h.get("receitaLinhas") or {}).get(l, 0) / 2 for h in base] or [0]
        media_q[l] = sum(vals) / len(vals)
    perda = sum(media_q.get(f["linha"], 0) for f in faltando)
    if faltando:
        F("completa:quinzenas", "alta", f"{len(faltando)} quinzena(s) de taxa nunca recebidas no período",
          "Mesmo olhando os meses seguintes, não entraram: " + ", ".join(f"{f['linha']} {f['ref']}" for f in faltando[:8])
          + f". Pela média da época boa, isso vale cerca de {brl(perda)} de receita.")
    atrasadas = [{"linha": k[0], "ref": f"{k[2]}ª quinz. {_rot(k[1])}", **v[0]} for k, v in recebidas.items() if v[0]["atraso"] >= 2]

    # 4) resultado real do período (sem contar empréstimos) e o que ainda é devido para fora
    divida = round(sum(c["aberto"] for c in contas if c["aberto"] > 0 and "rendimento" not in c["g"].lower()), 2)
    rec_base = sum(h.get("receita") or 0 for h in base) / len(base) if base else None
    F("completa:resultado", "alta" if tot["resultado"] < 0 else "info", "Resultado do período sem contar empréstimos",
      f"{len(meses)} mês(es): receita {brl(tot['receita'])}, despesas {brl(tot['despesas'])}, passagem {brl(tot['passagem'])} = "
      f"{brl(tot['resultado'])}. Dinheiro de fora usado no período: {brl(tot['financiamento'])}.")
    if rec_base:
        dif = tot["receita"] - rec_base * len(meses)
        if dif < -10000:
            F("completa:receita", "alta", "Receita do período abaixo da época boa",
              f"Esperado pela média de nov/25 a fev/26: {brl(rec_base * len(meses))}. Recebido: {brl(tot['receita'])} ({brl(dif)}).")
    ordem = {"alta": 0, "media": 1, "info": 2}
    flags.sort(key=lambda f: ordem[f["sev"]])
    lanc_fin = [{**x, "mes": h["rotulo"]} for h in meses for x in h.get("finLanc") or []]
    return {"meses": [h["rotulo"] for h in meses], "periodo": f"{meses[0]['rotulo']} a {meses[-1]['rotulo']}", "totais": tot,
            "dividaEmAberto": divida, "contas": contas, "passagem": passagem, "faltando": faltando, "perdaEstimada": round(perda, 2),
            "atrasadas": atrasadas, "flags": flags, "finLanc": lanc_fin, "semDetalheFin": [h["rotulo"] for h in meses if "finLanc" not in h],
            "receitaBaseMes": rec_base}


def prompt_completa(c: dict, historico: list[dict]) -> str:
    import json
    base = [{"mes": h["rotulo"], "receita": round(h.get("receita") or 0), "fixas": round(h.get("fixas") or 0)}
            for h in historico if h.get("formato") == "antigo"]
    meses = [{"mes": h["rotulo"], "receita": round(h.get("receita") or 0), "despesas": round(h.get("despesas") or 0),
              "passagem": round(h.get("passagem") or 0), "resultado": round(h.get("resultado") or 0),
              "financiamento": round(h.get("financiamento") or 0), "alertas": [f["t"] for f in h.get("flags") or []],
              "picos": [f["t"] for f in h.get("anomalias") or []]} for h in historico if h.get("formato") == "novo"]
    ctx = {k: c.get(k) for k in ("periodo", "totais", "dividaEmAberto", "contas", "faltando", "perdaEstimada", "atrasadas", "flags")}
    ctx["passagem"] = [p for p in c.get("passagem", []) if p["situacao"] != "ok"]
    ctx["meses"], ctx["epocaBoa"] = meses, base
    return ("Você é auditor financeiro de uma cooperativa de transporte (Coopernorte, Recife). A cooperativa recebe repasses das linhas "
            "Interbairros, Tiúma/Ponte (intermunicipal) e Alimentadoras, fica com uma taxa administrativa e repassa o resto a "
            "permissionários e fornecedores (contas de passagem). Entre nov/25 e fev/26 o caixa estava saudável; hoje há um rombo. "
            "Esta é a análise do PERÍODO INTEIRO: empréstimos feitos num mês e devolvidos em outro já estão compensados nos saldos "
            "acumulados, e contas de passagem que só atrasaram estão marcadas como 'compensou'.\n\n"
            "Escreva um parecer em português do Brasil, texto simples sem markdown (sem #, sem **), com estas partes, cada uma com título "
            "em MAIÚSCULAS numa linha própria:\nTAMANHO REAL DO ROMBO (quanto é perda de verdade e quanto é só diferença de época)\n"
            "DE ONDE VEM (causas em ordem de peso, com números)\nDÍVIDAS EM ABERTO (Posto, banco, poupança)\nSINAIS DE ALERTA (fato x "
            "suspeita, sem acusar ninguém)\nPLANO PARA TAPAR O BURACO (lista numerada, máximo 7, com o que conferir e o que mudar)\n"
            "Use R$ com valores arredondados e não invente dados.\n\nDADOS (JSON):\n" + json.dumps(ctx, ensure_ascii=False, default=str))
