"""Relatório do Tapa Buraco em Excel, para mandar adiante: uma aba "Resumo geral" com o período inteiro, uma aba por
mês enviado e uma aba com a época boa de referência. Visual sóbrio (cores do VAGABS), Arial, pronto para imprimir.
Somas, diferenças e variações são fórmulas; os valores de entrada vêm do que foi salvo no sistema."""
import io
from datetime import datetime

from openpyxl import Workbook
from pathlib import Path

from openpyxl.chart import BarChart, Reference
from openpyxl.drawing.image import Image
from openpyxl.drawing.spreadsheet_drawing import AnchorMarker, OneCellAnchor
from openpyxl.drawing.xdr import XDRPositiveSize2D
from openpyxl.utils.units import pixels_to_EMU
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

from . import raiox as rx

MESES_LONGOS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"]
MARCA, MARCA_SUAVE, TINTA, CINZA, LINHA, ZEBRA = "0D5C4F", "DCEFE9", "1F2A33", "6F8092", "D3DBE3", "F4F7F6"
SEV = {"alta": ("Alta", "FBE6E4", "B3261E"), "media": ("Média", "FBF0D6", "85500A"), "info": ("Info", "DFF1E8", "14724A")}
BRL = 'R$ #,##0.00;[Red]-R$ #,##0.00;"–"'
PCT = '+0%;[Red]-0%;"–"'
# despesas: gastar mais que a média é ruim (vermelho), gastar menos é bom (verde)
BRL_DESP = '[Red]+R$ #,##0.00;[Color10]-R$ #,##0.00;"–"'
PCT_DESP = '[Red]+0%;[Color10]-0%;"–"'
F = "Arial"
LOGOS = Path(__file__).parent / "assets"  # logo_coopernorte.png (esquerda) e logo_sinpetracope.png (direita)
ALT_LOGOS = {"logo_coopernorte.png": 76, "logo_sinpetracope.png": 42}  # altura de cada logo em pixels (equilibra o peso visual)
fino = Side(style="thin", color=LINHA)


def _nome_mes(mid: str) -> str:
    a, m = mid.split("-")
    return f"{MESES_LONGOS[int(m) - 1]} {a}"


def _aba(mid: str) -> str:
    a, m = mid.split("-")
    return f"{MESES_LONGOS[int(m) - 1][:3]} {a}"


class Folha:
    """Ajuda a escrever uma aba de cima para baixo nas colunas B..ultima."""

    def __init__(self, ws, larguras):
        self.ws, self.lin = ws, 2
        ws.sheet_view.showGridLines = False
        ws.column_dimensions["A"].width = 2.5
        for i, w in enumerate(larguras):
            ws.column_dimensions[get_column_letter(i + 2)].width = w
        self.ult = len(larguras) + 1
        ws.page_setup.orientation = "landscape"
        ws.page_setup.fitToWidth, ws.page_setup.fitToHeight = 1, 0
        ws.sheet_properties.pageSetUpPr.fitToPage = True
        ws.print_options.horizontalCentered = True
        ws.page_margins.left = ws.page_margins.right = 0.4

    def c(self, lin, col, valor=None, *, negrito=False, tam=10, cor=TINTA, fundo=None, fmt=None, al="left", quebra=False, italico=False):
        cel = self.ws.cell(lin, col, valor)
        cel.font = Font(name=F, size=tam, bold=negrito, color=cor, italic=italico)
        if fundo:
            cel.fill = PatternFill("solid", fgColor=fundo)
        if fmt:
            cel.number_format = fmt
        cel.alignment = Alignment(horizontal=al, vertical="center", wrap_text=quebra)
        return cel

    def _logo(self, arquivo, x_px, y_px=6):
        """Coloca a logo na linha 2, a x_px pixels da borda esquerda da coluna A."""
        if not (LOGOS / arquivo).is_file():
            return
        img = Image(str(LOGOS / arquivo))
        alt = ALT_LOGOS[arquivo]
        w = round(img.width * alt / img.height)
        img.width, img.height = w, alt
        col, resto, acum = 0, x_px, 0
        while True:  # acha a coluna onde o x cai, para a âncora não depender da largura total
            larg = round((self.ws.column_dimensions[get_column_letter(col + 1)].width or 8.43) * 7 + 5)
            if resto < larg:
                break
            resto -= larg; col += 1
        img.anchor = OneCellAnchor(_from=AnchorMarker(col=col, colOff=pixels_to_EMU(resto), row=1, rowOff=pixels_to_EMU(y_px)),
                                   ext=XDRPositiveSize2D(pixels_to_EMU(w), pixels_to_EMU(alt)))
        self.ws.add_image(img)
        return w

    def faixa(self, titulo, subtitulo):
        """Linha 2: logos (Coopernorte à esquerda, Sinpetracope à direita). Linhas 3-4: faixa verde com título."""
        ws = self.ws
        ws.row_dimensions[2].height = max(ALT_LOGOS.values()) * 0.75 + 9  # pontos
        larg = lambda c: round((ws.column_dimensions[get_column_letter(c)].width or 8.43) * 7 + 5)  # noqa: E731
        x_ini = larg(1)
        x_fim = sum(larg(c) for c in range(1, self.ult + 1))
        self._logo("logo_coopernorte.png", x_ini)
        if (LOGOS / "logo_sinpetracope.png").is_file():
            w = Image(str(LOGOS / "logo_sinpetracope.png"))
            alt = ALT_LOGOS["logo_sinpetracope.png"]
            self._logo("logo_sinpetracope.png", x_fim - round(w.width * alt / w.height), 6 + (max(ALT_LOGOS.values()) - alt) // 2)
        for col in range(2, self.ult + 1):
            ws.cell(3, col).fill = PatternFill("solid", fgColor=MARCA)
            ws.cell(4, col).fill = PatternFill("solid", fgColor=MARCA)
        self.c(3, 2, titulo, negrito=True, tam=18, cor="FFFFFF", fundo=MARCA)
        self.c(4, 2, subtitulo, tam=10, cor="D8EEE7", fundo=MARCA)
        ws.row_dimensions[3].height, ws.row_dimensions[4].height = 30, 20
        self.lin = 6

    def secao(self, titulo, nota=None):
        self.lin += 1
        self.c(self.lin, 2, titulo, negrito=True, tam=12, cor=MARCA)
        for col in range(2, self.ult + 1):
            self.ws.cell(self.lin, col).border = Border(bottom=Side(style="medium", color=MARCA))
        self.ws.row_dimensions[self.lin].height = 20
        self.lin += 1
        if nota:
            self.c(self.lin, 2, nota, tam=9, cor=CINZA, italico=True)
            self.lin += 1

    def cartoes(self, itens):
        """Até 4 números de destaque lado a lado. itens: (rótulo, valor, nota)."""
        n = len(itens)
        larg = (self.ult - 1) // n
        for i, (rot, val, nota) in enumerate(itens):
            c0, c1 = 2 + i * larg, 2 + i * larg + larg - 1
            for r, (v, kw) in enumerate([(rot.upper(), dict(tam=8, cor=CINZA, negrito=True)),
                                         (val, dict(tam=16, negrito=True, cor="B3261E" if isinstance(val, (int, float)) and val < 0 else TINTA, fmt=BRL)),
                                         (nota, dict(tam=8, cor=CINZA, quebra=True))]):
                lin = self.lin + r
                self.ws.merge_cells(start_row=lin, start_column=c0, end_row=lin, end_column=c1)
                self.c(lin, c0, v, fundo=ZEBRA, **kw)
                for col in range(c0, c1 + 1):
                    cel = self.ws.cell(lin, col)
                    cel.fill = PatternFill("solid", fgColor=ZEBRA)
                    cel.border = Border(left=fino if col == c0 else None, right=fino if col == c1 else None,
                                        top=Side(style="thick", color="B3261E" if isinstance(val, (int, float)) and val < 0 else MARCA) if r == 0 else None,
                                        bottom=fino if r == 2 else None)
        self.ws.row_dimensions[self.lin + 1].height = 26
        self.ws.row_dimensions[self.lin + 2].height = 24
        self.lin += 4

    def tabela(self, cab, linhas, fmts, total=None, larg_texto=None):
        """cab: títulos; linhas: listas de valores (str com '=' vira fórmula, {l} = nº da linha);
        fmts: formato por coluna; total: lista ('Total' | 'soma' | None | fórmula com {i}..{f}). Devolve (linha_ini, linha_fim)."""
        ws, l0 = self.ws, self.lin
        for j, h in enumerate(cab):
            cel = self.c(l0, 2 + j, h, negrito=True, tam=9, cor="FFFFFF", fundo=MARCA, al="right" if fmts[j] else "left", quebra=True)
            cel.border = Border(bottom=fino)
        ws.row_dimensions[l0].height = 28
        ini = l0 + 1
        for i, ln in enumerate(linhas):
            r = ini + i
            for j, v in enumerate(ln):
                if isinstance(v, str) and v.startswith("="):
                    v = v.format(l=r)
                cel = self.c(r, 2 + j, v, tam=9.5, fmt=fmts[j], al="right" if fmts[j] else "left",
                             fundo=ZEBRA if i % 2 else None, quebra=bool(larg_texto and j in larg_texto))
                cel.border = Border(bottom=fino)
        fim = ini + len(linhas) - 1
        self.lin = fim + 1
        if total and linhas:
            for j, t in enumerate(total):
                if t is None:
                    v = None
                elif t == "soma":
                    col = get_column_letter(2 + j)
                    v = f"=SUM({col}{ini}:{col}{fim})"
                elif isinstance(t, str) and t.startswith("="):
                    v = t.format(i=ini, f=fim, l=self.lin)
                else:
                    v = t
                cel = self.c(self.lin, 2 + j, v, negrito=True, tam=9.5, fmt=fmts[j], al="right" if fmts[j] else "left", fundo=MARCA_SUAVE)
                cel.border = Border(top=Side(style="medium", color=MARCA))
            self.lin += 1
        if not linhas:
            self.c(self.lin, 2, "Nada a mostrar.", tam=9, cor=CINZA, italico=True)
            self.lin += 1
        self.lin += 1
        return ini, fim

    def alertas(self, flags, vazio="Nenhum alerta."):
        if not flags:
            self.c(self.lin, 2, vazio, tam=9, cor=CINZA, italico=True)
            self.lin += 2
            return
        ws = self.ws
        for f in flags:
            nome, fundo, cor = SEV.get(f.get("sev"), SEV["info"])
            r = self.lin
            self.c(r, 2, nome.upper(), negrito=True, tam=8, cor=cor, fundo=fundo, al="center")
            ws.merge_cells(start_row=r, start_column=3, end_row=r, end_column=self.ult)
            self.c(r, 3, f["t"], negrito=True, tam=10)
            ws.merge_cells(start_row=r + 1, start_column=3, end_row=r + 1, end_column=self.ult)
            self.c(r + 1, 3, f["p"], tam=9, cor="415366", quebra=True)
            larg_total = sum(ws.column_dimensions[get_column_letter(c)].width or 10 for c in range(3, self.ult + 1))
            ws.row_dimensions[r + 1].height = max(15, 13 * (len(f["p"]) // max(30, int(larg_total * 1.1)) + 1))
            for col in range(2, self.ult + 1):
                ws.cell(r + 1, col).border = Border(bottom=fino)
            ws.cell(r, 2).border = Border(left=Side(style="thick", color=cor))
            ws.cell(r + 1, 2).border = Border(left=Side(style="thick", color=cor), bottom=fino)
            self.lin += 2
        self.lin += 1

    def texto(self, texto, vazio):
        ws, r = self.ws, self.lin
        ws.merge_cells(start_row=r, start_column=2, end_row=r, end_column=self.ult)
        cel = self.c(r, 2, texto or vazio, tam=10 if texto else 9, cor=TINTA if texto else CINZA, italico=not texto, quebra=True)
        cel.alignment = Alignment(wrap_text=True, vertical="top")
        larg_total = sum(ws.column_dimensions[get_column_letter(c)].width or 10 for c in range(2, self.ult + 1))
        linhas = sum(max(1, len(p) // max(40, int(larg_total * 1.15)) + 1) for p in (texto or vazio).split("\n"))
        ws.row_dimensions[r].height = min(409, 14 * linhas + 6)
        self.lin += 2


def _cats(h):
    return h.get("cats") or {}


# ------------------------------------------------------------------ abas
def _resumo(wb, hist, c, gerado):
    novos = [h for h in hist if h.get("formato") == "novo"]
    ws = wb.active
    ws.title = "Resumo geral"
    fo = Folha(ws, [17, 11, 15, 15, 15, 15, 15, 15, 9, 9])
    fo.faixa("Projeto Tapa Buraco · Relatório do caixa",
             f"Coopernorte · Período {c.get('periodo', '—')} · {len(novos)} mês(es) analisado(s) · gerado em {gerado}")
    perda_pass = sum(p["liq"] for p in c.get("passagem", []) if p["situacao"] == "rombo")
    t = c.get("totais") or {}
    fo.cartoes([("Resultado do período", t.get("resultado"), "Sem contar empréstimos"),
                ("Ainda devido para fora", -(c.get("dividaEmAberto") or 0), "Posto, banco e poupança em aberto"),
                ("Perda nas contas de passagem", perda_pass, "Pago a mais e não recuperado"),
                ("Quinzenas não recebidas", -(c.get("perdaEstimada") or 0), f"{len(c.get('faltando', []))} quinzena(s), pela média da época boa")])

    fo.secao("Principais achados do período", "Empréstimos feitos num mês e devolvidos em outro já estão compensados.")
    fo.alertas(c.get("flags", []), "Nenhum achado no período.")

    fo.secao("Mês a mês", "Meses marcados como referência são a época boa (nov/25 a fev/26), antes do rombo.")
    linhas = []
    for h in hist:
        nv = h.get("formato") == "novo"
        al = (h.get("flags") or []) + (h.get("anomalias") or [])
        linhas.append([_nome_mes(h["id"]), "Enviado" if nv else "Referência", h.get("receita"), -(h.get("despesas") or 0) if nv else None,
                       h.get("fixas"), h.get("passagem") if nv else None, "=D{l}-E{l}+G{l}" if nv else None, h.get("financiamento") if nv else None,
                       sum(1 for f in al if f.get("sev") == "alta"), h.get("risco") or 0])
    # colunas: B mês, C tipo, D receita, E despesas totais, F fixas, G passagem, H resultado, I coberto, J alertas, K risco
    ini, fim = fo.tabela(["Mês", "Tipo", "Receita própria", "Despesas totais", "Despesas fixas comparáveis", "Contas de passagem",
                          "Resultado", "Coberto com Posto/banco", "Alertas altos", "Risco (0-100)"], linhas,
                         [None, None, BRL, BRL, BRL, BRL, BRL, BRL, "0", "0"],
                         total=["Total enviados", None, '=SUMIF(C{i}:C{f},"Enviado",D{i}:D{f})', '=SUMIF(C{i}:C{f},"Enviado",E{i}:E{f})',
                                '=SUMIF(C{i}:C{f},"Enviado",F{i}:F{f})', '=SUMIF(C{i}:C{f},"Enviado",G{i}:G{f})',
                                '=SUMIF(C{i}:C{f},"Enviado",H{i}:H{f})', '=SUMIF(C{i}:C{f},"Enviado",I{i}:I{f})', "soma", None])
    fo.c(fo.lin - 1, 2, "Resultado = receita − despesas totais + saldo das contas de passagem. Despesas em valor positivo.", tam=8, cor=CINZA, italico=True)
    fo.lin += 1
    if hist:
        ch = BarChart()
        ch.type, ch.grouping, ch.style = "col", "clustered", 10
        ch.title, ch.y_axis.title = "Receita própria × despesas fixas comparáveis", "R$"
        ch.y_axis.numFmt = 'R$ #,##0'
        ch.y_axis.majorGridlines = None
        ch.add_data(Reference(ws, min_col=4, min_row=ini - 1, max_row=fim), titles_from_data=True)
        ch.add_data(Reference(ws, min_col=6, min_row=ini - 1, max_row=fim), titles_from_data=True)
        ch.set_categories(Reference(ws, min_col=2, min_row=ini, max_row=fim))
        ch.series[0].graphicalProperties.solidFill = MARCA
        ch.series[1].graphicalProperties.solidFill = "C9A227"
        ch.height, ch.width = 7.5, 24
        ch.legend.position = "b"
        ws.add_chart(ch, f"B{fo.lin}")
        fo.lin += 16

    if c.get("contas"):
        fo.secao("Empréstimos e devoluções (Posto, banco, poupança)",
                 "Positivo: entrou mais do que voltou (a cooperativa deve). Negativo: saiu mais do que voltou (devem à cooperativa).")
        meses = c["meses"]
        cab = ["Origem"] + [f"Movimento {m}" for m in meses] + ["Entrou no período", "Saiu no período", "Em aberto"]
        lin = []
        for g in c["contas"]:
            mov = [m["in"] + m["out"] for m in g["meses"]]
            n = len(meses)
            ent, sai = get_column_letter(3 + n), get_column_letter(4 + n)
            lin.append([g["g"]] + mov + [g["entrou"], g["saiu"], f"={ent}{{l}}+{sai}{{l}}"])
        fo.tabela(cab, lin, [None] + [BRL] * (len(cab) - 1))

    pas = [p for p in c.get("passagem", []) if p["situacao"] != "ok"]
    if pas:
        fo.secao("Contas de passagem que ficaram negativas", "Dinheiro que entra só para ser repassado. 'Compensou' = foi só atraso; 'Perda' = não voltou no período.")
        fo.tabela(["Conta", "Recebeu", "Pagou", "Diferença no período", "Situação"],
                  [[p["n"], p["in"], -p["out"], "=C{l}-D{l}", "Perda no período" if p["situacao"] == "rombo" else "Compensou entre meses"] for p in pas],
                  [None, BRL, BRL, BRL, None], total=["Total", "soma", "soma", "soma", None])
    if c.get("faltando") or c.get("atrasadas"):
        fo.secao("Quinzenas de taxa")
        fo.tabela(["Linha", "Referência", "Situação", "Pago em", "Valor"],
                  [[f["linha"], f["ref"], "Nunca recebida", None, None] for f in c.get("faltando", [])]
                  + [[f["linha"], f["ref"], f"Paga com {f['atraso']} meses de atraso", f["d"], f["v"]] for f in c.get("atrasadas", [])],
                  [None, None, None, None, BRL])
    fo.secao("Parecer da IA sobre o período")
    fo.texto(c.get("parecer"), "Parecer do período ainda não gerado. Gere no sistema (Análise completa → Gerar parecer) e exporte de novo.")
    ws.freeze_panes = "A6"


def _mes(wb, h, hist):
    ws = wb.create_sheet(_aba(h["id"]))
    fo = Folha(ws, [30, 14, 16, 16, 16, 16, 14, 14])
    outros = [x for x in hist if x["id"] != h["id"]]
    fo.faixa(f"{_nome_mes(h['id'])} · Raio-X do caixa", f"Arquivo: {h.get('arquivo') or '—'} · nota de risco {h.get('risco', 0)}/100")
    fo.cartoes([("Receita própria", h.get("receita"), "Taxa administrativa recebida"),
                ("Despesas da cooperativa", h.get("despesas"), "Folha, aluguel, impostos…"),
                ("Contas de passagem", h.get("passagem"), "Deveria ficar perto de zero"),
                ("Resultado do mês", h.get("resultado"), f"Coberto por fora: {rx.brl(h.get('financiamento'))}")])
    fo.secao("Alertas de regra")
    fo.alertas(h.get("flags") or [])
    fo.secao("Picos fora do padrão (comparado ao histórico)")
    fo.alertas(h.get("anomalias") or [], "Nada fora do padrão em relação ao histórico.")

    fo.secao("Receita da cooperativa por linha")
    media = lambda f: (sum(f(x) for x in outros) / len(outros)) if outros else None  # noqa: E731
    fo.tabela(["Linha", "Este mês", "Média do histórico", "Diferença"],
              [[l, (h.get("receitaLinhas") or {}).get(l, 0), media(lambda x, l=l: (x.get("receitaLinhas") or {}).get(l, 0)), "=C{l}-D{l}"] for l in rx.LINHAS],
              [None, BRL, BRL, BRL], total=["Total", "soma", "soma", "soma"])
    if h.get("receitaDet"):
        fo.tabela(["Taxa recebida (data · linha)", "Referência", "Atraso (meses)", "Valor"],
                  [[f"{r['d']} · {r['linha']}", r["ref"], r.get("lag"), r["v"]] for r in h["receitaDet"]], [None, None, "0", BRL], larg_texto={0})

    fo.secao("Despesas fixas × média do histórico")
    lin = []
    for cat in rx.CATS:
        v, m = _cats(h).get(cat, 0), media(lambda x, cat=cat: _cats(x).get(cat, 0))
        if v or m:
            lin.append([cat, v, m, "=C{l}-D{l}", "=IF(D{l}=0,0,(C{l}-D{l})/D{l})"])
    fo.tabela(["Categoria", "Este mês", "Média do histórico", "Diferença", "Variação"], lin, [None, BRL, BRL, BRL_DESP, PCT_DESP],
              total=["Total", "soma", "soma", "soma", "=IF(D{l}=0,0,(C{l}-D{l})/D{l})"])

    if h.get("pass"):
        fo.secao("Contas de passagem: recebeu × pagou", "Negativo = a cooperativa pagou com dinheiro próprio.")
        fo.tabela(["Conta", "Recebeu", "Pagou", "Diferença"], [[p["n"], p["in"], -p["out"], "=C{l}-D{l}"] for p in h["pass"]],
                  [None, BRL, BRL, BRL], total=["Total", "soma", "soma", "soma"])
    if h.get("finG"):
        fo.secao("Movimento com Posto, banco e poupança")
        fo.tabela(["Origem", "Entrou", "Saiu", "Saldo do mês", "Transferências"],
                  [[g["g"], g["in"], -g["out"], "=C{l}-D{l}", g.get("n")] for g in h["finG"]], [None, BRL, BRL, BRL, "0"],
                  total=["Total", "soma", "soma", "soma", "soma"])
    lanc = h.get("lanc") or {}
    blocos = [("Pagamentos com valor fora do comum para o próprio item", h.get("atip") or [], True),
              ("Possíveis duplicados", lanc.get("dup") or [], False), ("Saídas com descrição sensível", lanc.get("sus") or [], False),
              ("Saídas sem item de despesa", lanc.get("sem") or [], False), ("15 maiores despesas da cooperativa", lanc.get("big") or [], False),
              ("Linhas onde o saldo da planilha não fecha", lanc.get("saldo") or [], False)]
    for titulo, lista, tip in blocos:
        if not lista:
            continue
        fo.secao(f"{titulo} ({len(lista)})")
        cab = ["Título / descrição", "Data", "Item de despesa", "Valor", "Linha na planilha"] + (["Valor típico do item"] if tip else [])
        fo.tabela(cab, [[f"{r['tit']} — {r['desc']}", r["d"], r["item"], r["v"], r["i"]] + ([-r["tipico"]] if tip else []) for r in lista],
                  [None, None, None, BRL, "0"] + ([BRL] if tip else []), larg_texto={0, 2})
    fo.secao("Parecer da IA do mês")
    fo.texto(h.get("parecer"), "Parecer deste mês ainda não gerado no sistema.")
    ws.freeze_panes = "A6"


def _referencia(wb, base):
    ws = wb.create_sheet("Época boa (ref.)")
    fo = Folha(ws, [32] + [15] * len(base) + [15])
    fo.faixa("Época boa · referência", "Meses antes do rombo usados como base de comparação (planilhas antigas)")
    fo.secao("Receita e despesas fixas por mês")
    cab = ["Item"] + [_nome_mes(h["id"]) for h in base] + ["Média"]
    ult = get_column_letter(2 + len(base))
    media = f"=AVERAGE(C{{l}}:{ult}{{l}})"
    lin = [["Receita própria (taxas)"] + [h.get("receita") for h in base] + [media]]
    for l in rx.LINHAS:
        lin.append([f"  Taxa {l}"] + [(h.get("receitaLinhas") or {}).get(l, 0) for h in base] + [media])
    for cat in rx.CATS:
        if any(_cats(h).get(cat) for h in base):
            lin.append([cat] + [_cats(h).get(cat, 0) for h in base] + [media])
    fo.tabela(cab, lin, [None] + [BRL] * (len(base) + 1))


def gerar_xlsx(historico: list[dict], completa: dict) -> bytes:
    hist = sorted(historico, key=lambda h: h["id"])
    wb = Workbook()
    gerado = datetime.now().strftime("%d/%m/%Y %H:%M")
    _resumo(wb, hist, completa, gerado)
    for h in hist:
        if h.get("formato") == "novo":
            _mes(wb, h, hist)
    base = [h for h in hist if h.get("formato") == "antigo"]
    if base:
        _referencia(wb, base)
    wb.properties.title, wb.properties.creator = "Projeto Tapa Buraco · Relatório do caixa", "VAGABS"
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()
