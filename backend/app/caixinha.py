"""Caixinha: planilha de um ou mais meses do caixa pequeno (Data | Saldo | Crédito | Débito | Descrição) -> CSV de lançamentos.

A classificação fica aqui no código (REGRAS): a primeira regra cujas palavras aparecem na descrição decide título,
centro de custo e item. Título repetido ganha sufixo " 01", " 02"... porque o sistema não aceita título igual."""
import csv
import io
import re
import unicodedata
from datetime import date, datetime

from openpyxl import load_workbook

from .folha import COLUNAS, codigo_item

CONTA = "46604-2"
DESCRICAO = OBS = "Caixinha"
STATUS = "PAGO"


def norm(s) -> str:
    s = unicodedata.normalize("NFKD", str(s or "")).encode("ascii", "ignore").decode().lower()
    return re.sub(r"\s+", " ", s).strip()


# (padrão regex na descrição normalizada, título, centro, item, tipo). Ordem importa: a primeira que casar vence.
REGRAS = [
    (r"cheque descontado", None, None, None, None),  # linha de controle: fica fora
    (r"(venda|vendid).*oleo|oleo.*(queimado|vendido)", "Venda de óleo queimado", "ADM04", 534, "CREDITO"),
    # bomba de combustível (antes da regra do "Bomba", que é o apelido do mecânico Almir)
    (r"(manutencao|mun\.?|bico|afericao|servicos?).*bomba|bomba (e|d)", "Manutenção da bomba de combustível", "ADM03", 6, None),
    (r"passage.*(bomba|almir)|(bomba|almir).*passage", "Passagens ao prestador de serviço Almir - mecânico", "ADM04", 52, None),
    (r"bomba|bobma|almir", "Pgto. ao prestador de serviço Almir - mecânico", "ADM04", 52, None),
    (r"passage.*everaldo|uber.*everaldo|everaldo.*passage", "Passagens ao prestador de serviço Everaldo - aux. adm", "ADM01", 52, None),
    (r"everaldo", "Pgto. ao prestador de serviço Everaldo - aux. adm", "ADM01", 52, None),
    (r"cristina|\bcris\b", "Pgto. à prestadora de serviço Maria Cristina - aux. adm", "ADM01", 52, None),
    (r"mecanico", "Pgto. ao prestador de serviço Almir - mecânico", "ADM04", 52, None),
    (r"horas extras(?!.*posto)", "Horas extras", "ADM01", 82, None),
    (r"folguis|plantao|diaria|atestado|horas extras.*posto", "Folguista no posto", "ADM03", 28, None),
    (r"almoc", "Almoços dos func. da oficina", "ADM01", 53, None),
    (r"adaime|aluguel", "Aluguel de equipamentos para reformas", "ADM06", 37, None),
    (r"extintor", "Recarga de extintor", "ADM01", 39, None),
    (r"recarga|credito.*(celular|gabriel|leo)|^credito", "Recarga do celular do socorrista", "ADM01", 51, None),
    (r"detergente|sabao|sanbao|lava louca|agua sanitaria|papel toalha|vassoura|limpeza|limpador|pulverizador|cola rato",
     "Material de higiene e limpeza", "ADM01", 11, None),
    (r"agua|botij", "Águas minerais", "ADM01", 14, None),
    (r"\bgas\b", "Gás de cozinha", "ADM01", 14, None),
    (r"jovem|daniel|^passagens$", "Passagens do jovem aprendiz Daniel", "ADM01", 500, None),
    (r"salario|slario|recisao|ferias|quinz", "Pgto. de salário", "ADM01", 500, None),
    (r"abastec|gasolina", "Abastecimento carros e motos", "ADM01", 20, None),
    (r"strada|moto|pneu|sapata", "Manutenção carros e motos", "ADM01", 17, None),
    (r"placa de (combustivel|abastecimento)", "Conserto da placa de abastecimento do posto", "ADM01", 6, None),
    (r"lava jato|compressor|correi|correa|macaco|girafa|motor (de )?partida|maquina|cavalete|mangueira",
     "Conserto de equipamentos", "ADM04", 6, None),
    (r"chaleira|resma|lapis|copias$|^copias|xero", "Material de escritório e cozinha", "ADM01", 10, None),
    (r"chave", "Cópias de chaves", "ADM01", 37, None),
    (r"broca|parafuso|peca|oringue|conec", "Peças para o almoxarifado", "ADM05", 584, None),
    (r"cafeteira|carregador|ferrolho|fechad|extencao|extensao|teclado|pilha|celular|soprador", "Utensílios e equipamentos",
     "ADM01", 7, None),
    (r"pedreiro|metralha|eletric|portao|macenaria|marcenaria|instalacao|intalacao|torneira|reforma",
     "Manutenção do prédio", "ADM06", 9, None),
    (r"farda|bota|capacete|cordo", "Fardamento dos funcionários", "ADM01", 41, None),
    (r"acucar|cafe|mercado|atacarejo|armazem|comercio|bolo|refrigerante", "Feira", "ADM01", 13, None),
    (r"passage|uber", "Passagens de funcionários", "ADM01", 51, None),
]
_REGRAS = [(re.compile(p), t, c, i, tp) for p, t, c, i, tp in REGRAS]


def classificar(desc: str, salvas=()):
    """-> (titulo, centro, item, tipo|None, reconhecido). titulo None com reconhecido=True = linha descartada.
    `salvas` (RegraCaixinha da tela) valem antes das REGRAS fixas; a palavra-chave mais longa vence."""
    d = norm(desc)
    for r in sorted(salvas, key=lambda r: -len(r.kw)):
        if norm(r.kw) and norm(r.kw) in d:
            return r.titulo, r.centro, r.item, r.tipo, True
    for rx, titulo, centro, item, tipo in _REGRAS:
        if rx.search(d):
            return titulo, centro, item, tipo, True
    return None, None, None, None, False


def _num(v):
    if isinstance(v, (int, float)) and not isinstance(v, bool):
        return float(v)
    return None


FIM_VAZIAS = 20  # linhas vazias seguidas que encerram o mês (a linha de total também encerra)
MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"]


def _data(v):
    return v.date() if isinstance(v, datetime) else v if isinstance(v, date) else None


def ler_blocos(conteudo: bytes) -> list[dict]:
    """Acha cada mês pelo cabeçalho 'Data' (colunas Data, Saldo, Crédito, Débito, Descrição; os meses ficam lado a
    lado) e devolve, da esquerda para a direita: {numero, cheque, inicio, fim, rotulo, nome, linhas}."""
    ws = load_workbook(io.BytesIO(conteudo), data_only=True).active
    cabs = sorted({(c.column, c.row) for row in ws.iter_rows(max_row=30) for c in row
                   if isinstance(c.value, str) and norm(c.value) == "data"
                   and norm(ws.cell(c.row, c.column + 4).value).startswith("descri")})
    if not cabs:
        raise ValueError("Não achei o cabeçalho 'Data | Saldo | Crédito | Débito | Descrição'.")
    blocos = []
    for n, (c0, r0) in enumerate(cabs, start=1):
        linhas, vazias = [], 0
        for r in range(r0 + 1, ws.max_row + 1):
            # o fim do mês é um trecho de linhas vazias (o total vem depois dele). Não dá para usar a coluna de
            # saldo: em planilha copiada só com valores ela vem vazia.
            cred, deb = _num(ws.cell(r, c0 + 2).value), _num(ws.cell(r, c0 + 3).value)
            if not (cred or deb or str(ws.cell(r, c0 + 4).value or "").strip()):
                vazias += 1
                if vazias >= FIM_VAZIAS:
                    break
                continue
            vazias = 0
            if not (cred or deb):
                continue
            # linha de total (sem descrição, valor = soma do que veio antes): acabou o mês
            if not str(ws.cell(r, c0 + 4).value or "").strip() and linhas:
                soma_d = sum(l["valor"] for l in linhas if l["tipo"] == "DEBITO")
                if deb and abs(deb - soma_d) < 0.01:
                    break
            linhas.append({"linha": r, "data": _data(ws.cell(r, c0).value),
                           "descricao": str(ws.cell(r, c0 + 4).value or "").strip(),
                           "tipo": "CREDITO" if cred and not deb else "DEBITO", "valor": round(cred or deb, 2)})
        if not linhas:
            continue
        # número do cheque: logo acima do cabeçalho, na coluna da Data (ex.: 'Cheque' / 859962)
        cheque = None
        for k in range(1, min(6, r0)):
            v = ws.cell(r0 - k, c0).value
            if isinstance(v, (int, float)) and not isinstance(v, bool) and v > 1000:
                cheque = int(v)
                break
        datas = sorted(l["data"] for l in linhas if l["data"])
        ini, fim = (datas[0], datas[-1]) if datas else (None, None)
        partes = [f"Caixinha {len(blocos) + 1}"] + ([f"cheque {cheque}"] if cheque else []) + \
                 ([f"{MESES[fim.month - 1]}/{fim.year}"] if fim else ["sem datas"])
        nome = f"caixinha_{len(blocos) + 1:02d}" + (f"_cheque-{cheque}" if cheque else "") + (f"_{fim:%m-%Y}" if fim else "")
        blocos.append({"numero": len(blocos) + 1, "cheque": cheque, "inicio": ini, "fim": fim,
                       "rotulo": " · ".join(partes), "nome": nome + ".csv", "linhas": linhas})
    return blocos


def montar(linhas: list[dict], data_padrao: date, usar_data_da_linha: bool = False, salvas=()) -> list[dict]:
    """Linhas não reconhecidas voltam com revisar=True e sem códigos: a tela pede a classificação manual."""
    saida, vistos = [], {}
    for l in linhas:
        titulo, centro, item, tipo, ok = classificar(l["descricao"], salvas)
        if ok and titulo is None:
            continue
        if not ok:
            dt = l["data"] if usar_data_da_linha and l["data"] else data_padrao
            saida.append({"titulo": None, "tipo_lancamento": l["tipo"], "codigo_centro_de_custo": None,
                          "codigo_item_despesa": None, "valor": l["valor"], "data_inicial": dt,
                          "origem": l["descricao"], "linha": l["linha"], "revisar": True})
            continue
        n = vistos.get(titulo, 0)
        vistos[titulo] = n + 1
        dt = (l["data"] if usar_data_da_linha and l["data"] else data_padrao)
        saida.append({
            "titulo": titulo if n == 0 else f"{titulo} {n:02d}", "descricao": DESCRICAO,
            "tipo_lancamento": tipo or l["tipo"], "codigo_centro_de_custo": centro, "numero_conta": CONTA,
            "codigo_item_despesa": codigo_item(item), "codigo_fonte_recurso": None, "id_forma_pagamento": None,
            "num_parcelas": None, "data_inicial": dt, "dias_intervalo": None, "valor": l["valor"], "observacoes": OBS,
            "id_lancamento_grupo": None, "status_pagamento": STATUS, "data_liquidacao": dt, "banco_liquidacao": CONTA,
            # extras para a tela (não vão para o CSV)
            "origem": l["descricao"], "linha": l["linha"], "revisar": not ok})
    return saida


def pendentes(linhas: list[dict]) -> list[str]:
    """Descrições (sem repetir) que nenhuma regra reconheceu."""
    return list(dict.fromkeys(l["origem"] for l in linhas if l["revisar"]))


def modelo_xlsx(linhas_mes: int = 50) -> bytes:
    """Planilha em branco no formato que o sistema lê: cheque, saldo inicial e as colunas
    Data | Saldo | Crédito | Débito | Descrição, com o saldo e os totais já em fórmula."""
    from openpyxl import Workbook
    from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
    from openpyxl.worksheet.datavalidation import DataValidation
    wb = Workbook()
    ws = wb.active
    ws.title = "Caixinha"
    verde, cinza = PatternFill("solid", fgColor="0D5C4F"), PatternFill("solid", fgColor="F1F4F7")
    fina = Side(style="thin", color="D3DBE3")
    borda = Border(left=fina, right=fina, top=fina, bottom=fina)
    moeda, b = '#,##0.00;[Red]-#,##0.00', Font(bold=True)
    for col, larg in zip("ABCDEF", (2, 13, 14, 13, 13, 46)):
        ws.column_dimensions[col].width = larg
    ini, fim = 9, 9 + linhas_mes - 1  # linhas de lançamento
    ws["B2"] = "Caixinha"; ws["B2"].font = Font(bold=True, size=14, color="0D5C4F")
    ws["B3"] = "Cheque"; ws["B3"].font = b
    ws["B4"].number_format = "0"; ws["B4"].fill = cinza; ws["B4"].border = borda
    ws["D4"] = "Total débitos"; ws["F4"] = f"=SUM(E{ini}:E{fim})"
    ws["D5"] = "Total créditos"; ws["F5"] = f"=SUM(D{ini}:D{fim})"
    ws["D6"] = "Saldo atual"; ws["F6"] = f"=C{fim}"
    for c in ("D4", "D5", "D6"):
        ws[c].font = b
    for c in ("F4", "F5", "F6"):
        ws[c].number_format = moeda; ws[c].alignment = Alignment(horizontal="left")
    ws["C7"] = "Saldo inicial ↓"; ws["C7"].font = Font(italic=True, color="6F8092")
    for col, txt in zip("BCDEF", ("Data", 0, "Crédito", "Débito", "Descrição")):
        cel = ws[f"{col}8"]
        cel.value = txt; cel.border = borda
        cel.font = Font(bold=True, color="FFFFFF") if col != "C" else b
        cel.fill = verde if col != "C" else cinza
    ws["C8"].number_format = moeda
    for r in range(ini, fim + 1):
        ws[f"C{r}"] = f"=C{r - 1}+N(D{r})-N(E{r})"
        for col in "BCDEF":
            ws[f"{col}{r}"].border = borda
        ws[f"B{r}"].number_format = "DD/MM/YYYY"
        for col in "CDE":
            ws[f"{col}{r}"].number_format = moeda
        ws[f"C{r}"].font = Font(color="6F8092")
    dv = DataValidation(type="decimal", operator="greaterThanOrEqual", formula1="0", allow_blank=True,
                        error="Digite só o valor (número positivo).", errorTitle="Valor inválido")
    ws.add_data_validation(dv); dv.add(f"D{ini}:E{fim}")
    ws[f"E{fim + 1}"] = f"=SUM(E{ini}:E{fim})"; ws[f"E{fim + 1}"].font = b; ws[f"E{fim + 1}"].number_format = moeda
    ws[f"F{fim + 1}"].value = None
    ws[f"B{fim + 3}"] = ("Como preencher: número do cheque em B4, saldo inicial em C8 e uma linha por gasto (Data, Crédito "
                         "OU Débito, Descrição). Para vários meses, copie as colunas B:F para a direita, deixando uma "
                         "coluna vazia entre os meses.")
    ws[f"B{fim + 3}"].font = Font(italic=True, color="6F8092")
    ws.freeze_panes = "B9"
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def para_csv(linhas: list[dict]) -> str:
    def fmt(v):
        if v is None:
            return ""
        if isinstance(v, date):
            return v.strftime("%d/%m/%Y")
        if isinstance(v, float):
            return f"{v:.2f}".replace(".", ",")
        return v
    buf = io.StringIO()
    w = csv.writer(buf, delimiter=";", lineterminator="\r\n")
    w.writerow(COLUNAS)
    for l in linhas:
        w.writerow([fmt(l[c]) for c in COLUNAS])
    return buf.getvalue()
