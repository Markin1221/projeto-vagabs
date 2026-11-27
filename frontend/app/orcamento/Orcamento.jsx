"use client";
// Visualização do Relatório Orçado x Realizado: resumo, destaques, sete gráficos e a tabela completa.
// A planilha é lida no backend (/orcamento/ler); tudo daqui para frente (filtros, gráficos, CSV) roda no navegador.
// Os gráficos são SVG/HTML feitos à mão (sem biblioteca). Cores em orcamento.css: Orçado = azul, Realizado = laranja;
// situação (estourou, sem orçamento, dentro, não usado) sempre com ícone + nome, nunca só a cor.
import { useEffect, useMemo, useRef, useState } from "react";
import Dica from "../ui/Dica";
import Soltar from "../ui/Soltar";
import { Alerta, Ok, Fechar, Baixar, Lupa, Olho } from "../ui/Icones";
import { API, autFetch, fmt, mensagemDeErro } from "../lib";
import "./orcamento.css";

const Menos = () => <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden><circle cx="8" cy="8" r="5.5" /><path d="M5.5 8h5" /></svg>;
const Seta = () => <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M8 13V3M4 7l4-4 4 4" /></svg>;

const SIT = {
  estourou: { nome: "Estourou", cls: "est", Icone: Seta, desc: "gastou mais que o orçado" },
  sem_orcamento: { nome: "Sem orçamento", cls: "sem", Icone: Alerta, desc: "gastou sem ter orçado" },
  dentro: { nome: "Dentro", cls: "den", Icone: Ok, desc: "gastou até o orçado" },
  nao_usado: { nome: "Não usado", cls: "nao", Icone: Menos, desc: "orçado e nada gasto" },
  zerado: { nome: "Zerado", cls: "nao", Icone: Menos, desc: "sem valores" },
};
const ORDEM_SIT = ["estourou", "sem_orcamento", "dentro", "nao_usado"];
const GRAFICOS = [
  ["comparar", "Orçado × Realizado"], ["execucao", "Execução %"], ["diferenca", "Economia × Estouro"],
  ["mapa", "Para onde foi o dinheiro"], ["dispersao", "Dispersão"], ["grupos", "Por grupo"], ["abc", "Curva ABC"],
];

const SIGLAS = new Set(["TI", "INSS", "FGTS", "IPVA", "PIS", "PIX", "TED", "IOF", "DDA", "CIM", "OCB", "ANTP", "S10", "CCO", "IGGOR", "ADELTEC", "COMPESA", "FENATRACOOP", "FENATRAL", "NETWAY", "STETHOS", "13°"]);
const MIUDAS = new Set(["de", "da", "do", "das", "dos", "e", "a", "o", "em", "no", "na", "por", "sobre", "s/"]);
// "MANUTENÇÃO CARROS E MOTOS" → "Manutenção carros e motos" (siglas ficam em maiúsculas)
function bonito(s) {
  return (s || "").split(/(\s+|[()/,+-])/).map((p, i) => {
    const limpo = p.replace(/[^\p{L}\d°]/gu, "");
    if (!limpo) return p;
    if (SIGLAS.has(limpo.toUpperCase())) return p.toUpperCase();
    const min = p.toLowerCase();
    return i === 0 ? min.charAt(0).toUpperCase() + min.slice(1) : MIUDAS.has(min) ? min : min;
  }).join("").replace(/^./, (c) => c.toUpperCase());
}
const rotulo = (e) => `${e.codigo} · ${bonito(e.nome)}`;
const curto = (v) => {
  const a = Math.abs(v), s = v < 0 ? "−" : "";
  if (a >= 1e6) return `${s}${(a / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
  if (a >= 1e3) return `${s}${(a / 1e3).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`;
  return `${s}${a.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;
};
const pct = (v) => (v == null ? "—" : `${v.toLocaleString("pt-BR", { maximumFractionDigits: v >= 1000 ? 0 : 1 })}%`);
const soma = (l, k) => l.reduce((t, e) => t + (e[k] || 0), 0);

function useLargura(inicial = 800) {
  const ref = useRef(null);
  const [w, setW] = useState(inicial);
  useEffect(() => {
    if (!ref.current) return;
    setW(ref.current.clientWidth);
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

function Situacao({ s, curta }) {
  const S = SIT[s] || SIT.zerado;
  return <span className={"orc-sit " + S.cls} title={S.desc}><S.Icone />{!curta && S.nome}</span>;
}

function TipEvento({ e, total }) {
  return (
    <>
      <b>{rotulo(e)}</b>
      <dl>
        <dt><i className="orc-pt orcado" />Orçado</dt><dd className="num">R$ {fmt(e.orcado)}</dd>
        <dt><i className="orc-pt real" />Realizado</dt><dd className="num">R$ {fmt(e.realizado)}</dd>
        <dt>Diferença</dt><dd className="num">R$ {fmt(e.diferenca)}</dd>
        <dt>Execução</dt><dd className="num">{pct(e.pct)}</dd>
        {total > 0 && <><dt>Do realizado total</dt><dd className="num">{pct((e.realizado / total) * 100)}</dd></>}
      </dl>
      <Situacao s={e.situacao} />
    </>
  );
}

// ---------- Resumo ----------
function Kpis({ l, credito }) {
  const orc = soma(l, "orcado"), rea = soma(l, "realizado"), dif = orc - rea, ex = orc ? (rea / orc) * 100 : null;
  return (
    <div className="orc-kpis">
      <div><span>Orçado</span><b className="num">R$ {fmt(orc)}</b><small>{l.filter((e) => e.orcado > 0).length} eventos com orçamento</small></div>
      <div><span>Realizado</span><b className="num">R$ {fmt(rea)}</b><small>{l.filter((e) => e.realizado > 0).length} eventos com gasto</small></div>
      <div className={dif < 0 ? "ruim" : "ok"}><span>{dif < 0 ? "Estourou no total" : "Sobrou no total"}</span>
        <b className="num">{dif < 0 ? <Seta /> : <Ok />}R$ {fmt(Math.abs(dif))}</b><small>orçado − realizado</small></div>
      <div className={ex > 100 ? "ruim" : "ok"}><span>Execução</span><b className="num">{pct(ex)}</b>
        <small>{ex > 100 ? `gastou ${(ex / 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}× o orçado` : "do orçamento usado"}</small></div>
      <div><span>Crédito</span><b className="num">R$ {fmt(credito)}</b><small>entradas no período</small></div>
    </div>
  );
}

function Medidor({ l }) {
  const orc = soma(l, "orcado"), rea = soma(l, "realizado"), max = Math.max(orc, rea) || 1;
  return (
    <div className="orc-medidor" aria-label="Orçado e realizado no total">
      {[["Orçado", orc, "orcado"], ["Realizado", rea, "real"]].map(([n, v, c]) => (
        <div key={n} className="orc-med-linha"><span>{n}</span>
          <div className="orc-trilho"><div className={"orc-barra " + c} style={{ width: `${(v / max) * 100}%` }} />
            {c === "real" && rea > orc && orc > 0 && <i className="orc-marco" style={{ left: `${(orc / max) * 100}%` }} title="Onde termina o orçado" />}</div>
          <b className="num">{curto(v)}</b></div>))}
    </div>
  );
}

function Composicao({ l, medida, tip }) {
  const val = (e) => (medida === "qtd" ? 1 : medida === "orcado" ? e.orcado : e.realizado);
  const partes = ORDEM_SIT.map((s) => ({ s, v: l.filter((e) => e.situacao === s).reduce((t, e) => t + val(e), 0), n: l.filter((e) => e.situacao === s).length }));
  const tot = partes.reduce((t, p) => t + p.v, 0) || 1;
  const mostra = (p) => medida === "qtd" ? `${p.n} evento(s)` : `R$ ${fmt(p.v)}`;
  return (
    <div className="orc-comp">
      <div className="orc-comp-barra">
        {partes.filter((p) => p.v > 0).map((p) => (
          <div key={p.s} className={"seg " + SIT[p.s].cls} style={{ width: `${(p.v / tot) * 100}%` }}
            onMouseMove={(ev) => tip.mostrar(ev, <><b>{SIT[p.s].nome}</b><p>{mostra(p)} · {pct((p.v / tot) * 100)}</p><p className="mudo">{SIT[p.s].desc}</p></>)} onMouseLeave={tip.esconder} />))}
      </div>
      <ul className="orc-legenda">
        {partes.map((p) => <li key={p.s}><Situacao s={p.s} /><span className="num">{mostra(p)}</span><small className="num">{pct((p.v / tot) * 100)}</small></li>)}
      </ul>
    </div>
  );
}

function Destaques({ l, abrir }) {
  const total = soma(l, "realizado");
  const cartoes = [
    ["Maiores estouros", "d-est", l.filter((e) => e.situacao === "estourou").sort((a, b) => a.diferenca - b.diferenca), (e) => `+R$ ${curto(-e.diferenca)} · ${pct(e.pct)}`],
    ["Gasto sem orçamento", "d-sem", l.filter((e) => e.situacao === "sem_orcamento").sort((a, b) => b.realizado - a.realizado), (e) => `R$ ${curto(e.realizado)}`],
    ["Maiores economias", "d-den", l.filter((e) => e.diferenca > 0).sort((a, b) => b.diferenca - a.diferenca), (e) => `−R$ ${curto(e.diferenca)} · ${pct(e.pct)}`],
    ["Onde mais se gastou", "", [...l].sort((a, b) => b.realizado - a.realizado).filter((e) => e.realizado > 0), (e) => `R$ ${curto(e.realizado)} · ${pct(total ? (e.realizado / total) * 100 : 0)}`],
  ];
  return (
    <div className="orc-destaques">
      {cartoes.map(([tit, cls, lista, txt]) => (
        <section key={tit} className={"orc-dest " + cls}>
          <h3>{tit}<small>{lista.length}</small></h3>
          {lista.length === 0 ? <p className="mudo">Nenhum.</p> : (
            <ol>{lista.slice(0, 5).map((e) => (
              <li key={e.codigo}><button type="button" onClick={() => abrir(e)} title="Ver detalhes"><span>{rotulo(e)}</span><b className="num">{txt(e)}</b></button></li>))}</ol>)}
        </section>))}
    </div>
  );
}

// ---------- Gráficos ----------
function Linhas({ children, max }) {
  return <div className="orc-linhas" style={{ maxHeight: max }}>{children}</div>;
}

function GComparar({ l, tip, abrir, total }) {
  const [ordem, setOrdem] = useState("realizado");
  const [qtd, setQtd] = useState(20);
  const ord = {
    realizado: (a, b) => b.realizado - a.realizado, orcado: (a, b) => b.orcado - a.orcado,
    estouro: (a, b) => a.diferenca - b.diferenca, codigo: (a, b) => a.codigo.localeCompare(b.codigo, "pt-BR", { numeric: true }),
  }[ordem];
  const lista = l.filter((e) => e.orcado || e.realizado).sort(ord).slice(0, qtd || undefined);
  const max = Math.max(1, ...lista.map((e) => Math.max(e.orcado, e.realizado)));
  return (
    <>
      <div className="orc-ctrl">
        <ul className="orc-leg-serie"><li><i className="orc-pt orcado" />Orçado</li><li><i className="orc-pt real" />Realizado</li></ul>
        <span style={{ flex: 1 }} />
        <label>Ordenar <select value={ordem} onChange={(e) => setOrdem(e.target.value)}>
          <option value="realizado">Maior realizado</option><option value="orcado">Maior orçado</option><option value="estouro">Maior estouro</option><option value="codigo">Código</option></select></label>
        <label>Mostrar <select value={qtd} onChange={(e) => setQtd(Number(e.target.value))}>
          <option value={10}>10</option><option value={20}>20</option><option value={40}>40</option><option value={0}>Todos</option></select></label>
      </div>
      <Linhas max={qtd ? undefined : 640}>
        {lista.map((e) => (
          <button type="button" key={e.codigo} className="orc-linha dupla" onClick={() => abrir(e)}
            onMouseMove={(ev) => tip.mostrar(ev, <TipEvento e={e} total={total} />)} onMouseLeave={tip.esconder}>
            <span className="orc-nome" title={rotulo(e)}>{rotulo(e)}</span>
            <span className="orc-barras">
              <span className="orc-barra orcado" style={{ width: `${(e.orcado / max) * 100}%` }} />
              <span className="orc-barra real" style={{ width: `${(e.realizado / max) * 100}%` }} />
            </span>
            <span className="orc-vals num"><span>{curto(e.orcado)}</span><span>{curto(e.realizado)}</span></span>
          </button>))}
      </Linhas>
    </>
  );
}

function GExecucao({ l, tip, abrir, total }) {
  const TETO = 200;
  const lista = l.filter((e) => e.orcado > 0).sort((a, b) => b.pct - a.pct);
  return (
    <>
      <div className="orc-ctrl"><p className="mudo">Quanto de cada orçamento foi usado. A linha marca 100%; a barra para em {TETO}% e o número mostra o valor real. Eventos sem orçamento ficam de fora.</p></div>
      <div className="orc-escala-exec" aria-hidden><span style={{ left: 0 }}>0%</span><span style={{ left: "50%" }}>100%</span><span style={{ left: "100%" }}>{TETO}%+</span></div>
      <Linhas>
        {lista.map((e) => (
          <button type="button" key={e.codigo} className="orc-linha" onClick={() => abrir(e)}
            onMouseMove={(ev) => tip.mostrar(ev, <TipEvento e={e} total={total} />)} onMouseLeave={tip.esconder}>
            <span className="orc-nome" title={rotulo(e)}>{rotulo(e)}</span>
            <span className="orc-trilho exec">
              <span className={"orc-barra " + SIT[e.situacao].cls} style={{ width: `${(Math.min(e.pct, TETO) / TETO) * 100}%` }} />
              {e.pct > TETO && <span className="orc-corte" aria-hidden>⋯</span>}
              <i className="orc-cem" />
            </span>
            <span className="orc-vals num um"><Situacao s={e.situacao} curta />{pct(e.pct)}</span>
          </button>))}
      </Linhas>
    </>
  );
}

function GDiferenca({ l, tip, abrir, total }) {
  const lista = l.filter((e) => Math.abs(e.diferenca) >= 0.01).sort((a, b) => a.diferenca - b.diferenca);
  const max = Math.max(1, ...lista.map((e) => Math.abs(e.diferenca)));
  const est = -soma(lista.filter((e) => e.diferenca < 0), "diferenca"), eco = soma(lista.filter((e) => e.diferenca > 0), "diferenca");
  return (
    <>
      <div className="orc-ctrl orc-dif-cab">
        <span className="orc-sit est"><Seta />Estouro · R$ {fmt(est)}</span>
        <span style={{ flex: 1 }} />
        <span className="orc-sit den"><Ok />Economia · R$ {fmt(eco)}</span>
      </div>
      <Linhas>
        {lista.map((e) => {
          const w = (Math.abs(e.diferenca) / max) * 50;
          return (
            <button type="button" key={e.codigo} className="orc-linha" onClick={() => abrir(e)}
              onMouseMove={(ev) => tip.mostrar(ev, <TipEvento e={e} total={total} />)} onMouseLeave={tip.esconder}>
              <span className="orc-nome" title={rotulo(e)}>{rotulo(e)}</span>
              <span className="orc-trilho div">
                <i className="orc-zero" />
                <span className={"orc-barra " + (e.diferenca < 0 ? "est esq" : "den dir")} style={e.diferenca < 0 ? { right: "50%", width: `${w}%` } : { left: "50%", width: `${w}%` }} />
              </span>
              <span className={"orc-vals num um " + (e.diferenca < 0 ? "t-ruim" : "t-ok")}>{e.diferenca < 0 ? "+" : "−"}{curto(Math.abs(e.diferenca))}</span>
            </button>);
        })}
      </Linhas>
    </>
  );
}

// Treemap "squarified": retângulos com área proporcional ao realizado, o mais quadrados possível.
function squarify(itens, x, y, w, h) {
  const tot = itens.reduce((t, i) => t + i.v, 0);
  if (!tot) return [];
  let resto = itens.map((i) => ({ ...i, a: (i.v * w * h) / tot }));
  const out = [];
  const pior = (row, lado) => { const s = row.reduce((t, n) => t + n.a, 0); const mx = Math.max(...row.map((n) => n.a)); const mn = Math.min(...row.map((n) => n.a)); return Math.max((lado * lado * mx) / (s * s), (s * s) / (lado * lado * mn)); };
  while (resto.length) {
    const lado = Math.min(w, h);
    let row = [resto[0]], i = 1;
    while (i < resto.length && pior([...row, resto[i]], lado) <= pior(row, lado)) { row.push(resto[i]); i++; }
    resto = resto.slice(i);
    const s = row.reduce((t, n) => t + n.a, 0);
    if (w >= h) { const cw = s / h; let cy = y; row.forEach((n) => { const nh = n.a / cw; out.push({ ...n, x, y: cy, w: cw, h: nh }); cy += nh; }); x += cw; w -= cw; }
    else { const rh = s / w; let cx = x; row.forEach((n) => { const nw = n.a / rh; out.push({ ...n, x: cx, y, w: nw, h: rh }); cx += nw; }); y += rh; h -= rh; }
  }
  return out;
}

function GMapa({ l, tip, abrir, total }) {
  const [ref, W] = useLargura();
  const [medida, setMedida] = useState("realizado");
  const H = Math.max(360, Math.min(560, W * 0.55));
  const itens = l.filter((e) => e[medida] > 0).sort((a, b) => b[medida] - a[medida]).map((e) => ({ e, v: e[medida] }));
  const caixas = squarify(itens, 0, 0, W, H);
  const tot = soma(itens, "v");
  return (
    <>
      <div className="orc-ctrl">
        <p className="mudo">Cada retângulo é um evento; o tamanho é o valor. A cor mostra a situação.</p>
        <span style={{ flex: 1 }} />
        <div className="orc-seg" role="radiogroup" aria-label="Tamanho pelo">
          {[["realizado", "Realizado"], ["orcado", "Orçado"]].map(([v, n]) => <button key={v} type="button" role="radio" aria-checked={medida === v} className={medida === v ? "ativo" : ""} onClick={() => setMedida(v)}>{n}</button>)}
        </div>
      </div>
      <div ref={ref} className="orc-mapa" style={{ height: H }}>
        {caixas.map(({ e, v, x, y, w, h }) => (
          <button type="button" key={e.codigo} className={"orc-caixa " + SIT[e.situacao].cls} style={{ left: x, top: y, width: w, height: h }}
            onClick={() => abrir(e)} onMouseMove={(ev) => tip.mostrar(ev, <TipEvento e={e} total={total} />)} onMouseLeave={tip.esconder}>
            {w > 70 && h > 34 && <><b>{bonito(e.nome)}</b><span className="num">R$ {curto(v)} · {pct((v / tot) * 100)}</span></>}
          </button>))}
      </div>
      <ul className="orc-legenda linha">{ORDEM_SIT.map((s) => <li key={s}><i className={"orc-quad " + SIT[s].cls} /><Situacao s={s} /></li>)}</ul>
    </>
  );
}

function GDispersao({ l, tip, abrir, total }) {
  const [ref, W] = useLargura();
  const H = 420, M = { e: 64, d: 18, t: 14, b: 44 };
  const pts = l.filter((e) => e.orcado || e.realizado);
  const max = Math.max(10, ...pts.map((e) => Math.max(e.orcado, e.realizado)));
  const lmax = Math.log10(max + 1) * 1.04;
  const px = (v) => M.e + (Math.log10(v + 1) / lmax) * (W - M.e - M.d);
  const py = (v) => H - M.b - (Math.log10(v + 1) / lmax) * (H - M.t - M.b);
  const marcas = [0, 100, 1000, 10000, 100000, 1000000, 10000000].filter((t) => Math.log10(t + 1) <= lmax);
  const [sobre, setSobre] = useState(null);
  return (
    <>
      <div className="orc-ctrl"><p className="mudo">Cada ponto é um evento. Acima da diagonal gastou mais que o orçado; abaixo, menos. Os pontos colados no eixo da esquerda não tinham orçamento. Escala logarítmica, para caber do pequeno ao grande.</p></div>
      <div ref={ref} className="orc-svg">
        <svg width={W} height={H} role="img" aria-label="Dispersão orçado por realizado">
          {marcas.map((t) => <g key={t} className="orc-grade">
            <line x1={M.e} x2={W - M.d} y1={py(t)} y2={py(t)} /><text x={M.e - 8} y={py(t) + 4} textAnchor="end">{curto(t)}</text>
            <line x1={px(t)} x2={px(t)} y1={M.t} y2={H - M.b} /><text x={px(t)} y={H - M.b + 18} textAnchor="middle">{curto(t)}</text></g>)}
          <line className="orc-diag" x1={px(0)} y1={py(0)} x2={px(max * 1.05)} y2={py(max * 1.05)} />
          <text className="orc-diag-txt" x={px(max * 0.6)} y={py(max * 0.6) - 8} textAnchor="end">realizado = orçado</text>
          <text className="orc-eixo" x={(W + M.e) / 2} y={H - 6} textAnchor="middle">Orçado (R$)</text>
          <text className="orc-eixo" transform={`translate(14 ${(H - M.b) / 2}) rotate(-90)`} textAnchor="middle">Realizado (R$)</text>
          {pts.map((e) => (
            <circle key={e.codigo} cx={px(e.orcado)} cy={py(e.realizado)} r={sobre === e.codigo ? 8 : 6} className={"orc-ponto " + SIT[e.situacao].cls}
              onMouseMove={(ev) => { setSobre(e.codigo); tip.mostrar(ev, <TipEvento e={e} total={total} />); }} onMouseLeave={() => { setSobre(null); tip.esconder(); }}
              onClick={() => abrir(e)} />))}
        </svg>
      </div>
      <ul className="orc-legenda linha">{ORDEM_SIT.map((s) => <li key={s}><i className={"orc-quad redondo " + SIT[s].cls} /><Situacao s={s} /></li>)}</ul>
    </>
  );
}

function GGrupos({ l, tip }) {
  const nomes = [...new Set(l.map((e) => e.grupo))];
  const grupos = nomes.map((g) => { const ev = l.filter((e) => e.grupo === g); return { g, ev, orc: soma(ev, "orcado"), rea: soma(ev, "realizado") }; })
    .sort((a, b) => b.rea - a.rea);
  const max = Math.max(1, ...grupos.map((g) => Math.max(g.orc, g.rea)));
  return (
    <>
      <div className="orc-ctrl"><p className="mudo">Grupos pela faixa do código: 001–069 despesas gerais, 070–099 pessoal, 500+ contas a pagar.</p>
        <span style={{ flex: 1 }} /><ul className="orc-leg-serie"><li><i className="orc-pt orcado" />Orçado</li><li><i className="orc-pt real" />Realizado</li></ul></div>
      <div className="orc-grupos">
        {grupos.map((g) => (
          <section key={g.g} className="orc-grupo">
            <h3>{g.g}<small>{g.ev.length} eventos</small></h3>
            <div className="orc-grupo-num">
              <div><span>Orçado</span><b className="num">R$ {fmt(g.orc)}</b></div>
              <div><span>Realizado</span><b className="num">R$ {fmt(g.rea)}</b></div>
              <div className={g.rea > g.orc ? "t-ruim" : "t-ok"}><span>Execução</span><b className="num">{g.orc ? pct((g.rea / g.orc) * 100) : "sem orçamento"}</b></div>
            </div>
            <div className="orc-medidor">
              {[["Orçado", g.orc, "orcado"], ["Realizado", g.rea, "real"]].map(([n, v, c]) => (
                <div key={n} className="orc-med-linha"><span>{n}</span><div className="orc-trilho"><div className={"orc-barra " + c} style={{ width: `${(v / max) * 100}%` }} /></div><b className="num">{curto(v)}</b></div>))}
            </div>
            <p className="orc-sub">Situação dos eventos</p>
            <Composicao l={g.ev} medida="qtd" tip={tip} />
          </section>))}
      </div>
    </>
  );
}

function GAbc({ l, tip, abrir }) {
  const [ref, W] = useLargura();
  const H = 320, M = { e: 48, d: 16, t: 14, b: 34 };
  const lista = l.filter((e) => e.realizado > 0).sort((a, b) => b.realizado - a.realizado);
  const tot = soma(lista, "realizado") || 1;
  let ac = 0;
  const pts = lista.map((e, i) => { const antes = ac; ac += e.realizado; const p = (ac / tot) * 100; return { e, i, p, cl: (antes / tot) * 100 < 80 ? "A" : (antes / tot) * 100 < 95 ? "B" : "C" }; });
  const n = pts.length || 1;
  const px = (i) => M.e + ((i + 1) / n) * (W - M.e - M.d);
  const py = (p) => H - M.b - (p / 100) * (H - M.t - M.b);
  const caminho = pts.map((p, i) => `${i ? "L" : "M"}${px(p.i)},${py(p.p)}`).join(" ");
  const area = pts.length ? `M${px(-1)},${py(0)} ${pts.map((p) => `L${px(p.i)},${py(p.p)}`).join(" ")} L${px(n - 1)},${py(0)} Z` : "";
  const [sobre, setSobre] = useState(null);
  const classes = ["A", "B", "C"].map((c) => { const ev = pts.filter((p) => p.cl === c); return { c, n: ev.length, v: ev.reduce((t, p) => t + p.e.realizado, 0), ev }; });
  const mover = (ev) => {
    const r = ev.currentTarget.getBoundingClientRect();
    const i = Math.max(0, Math.min(n - 1, Math.round(((ev.clientX - r.left - M.e) / (W - M.e - M.d)) * n - 1)));
    const p = pts[i]; if (!p) return;
    setSobre(i);
    tip.mostrar(ev, <><b>{i + 1}º · {rotulo(p.e)}</b><p className="num">R$ {fmt(p.e.realizado)} · {pct((p.e.realizado / tot) * 100)}</p><p>Acumulado: <b className="num">{pct(p.p)}</b> · classe {p.cl}</p></>);
  };
  return (
    <>
      <div className="orc-ctrl"><p className="mudo">Eventos do maior para o menor gasto e quanto do total eles somam. Classe A: os poucos que fazem 80% do gasto; B: até 95%; C: o resto.</p></div>
      <div ref={ref} className="orc-svg">
        <svg width={W} height={H} role="img" aria-label="Curva ABC do realizado" onMouseMove={mover} onMouseLeave={() => { setSobre(null); tip.esconder(); }}
          onClick={() => sobre != null && abrir(pts[sobre].e)}>
          {[0, 25, 50, 75, 100].map((t) => <g key={t} className="orc-grade"><line x1={M.e} x2={W - M.d} y1={py(t)} y2={py(t)} /><text x={M.e - 8} y={py(t) + 4} textAnchor="end">{t}%</text></g>)}
          {[80, 95].map((t) => <g key={t} className="orc-ref"><line x1={M.e} x2={W - M.d} y1={py(t)} y2={py(t)} /><text x={W - M.d} y={py(t) - 6} textAnchor="end">{t}%</text></g>)}
          <path d={area} className="orc-area" />
          <path d={caminho} className="orc-curva" />
          {sobre != null && pts[sobre] && <><line className="orc-mira" x1={px(sobre)} x2={px(sobre)} y1={M.t} y2={H - M.b} /><circle className="orc-ponto-curva" cx={px(sobre)} cy={py(pts[sobre].p)} r={5} /></>}
          <text className="orc-eixo" x={(W + M.e) / 2} y={H - 6} textAnchor="middle">Eventos, do maior gasto para o menor ({pts.length})</text>
        </svg>
      </div>
      <div className="orc-abc">
        {classes.map((c) => (
          <section key={c.c}><h3><span className={"orc-classe c" + c.c}>{c.c}</span>{c.n} evento(s)<small className="num">R$ {fmt(c.v)} · {pct((c.v / tot) * 100)}</small></h3>
            {c.c === "A" && <ol>{c.ev.map((p) => <li key={p.e.codigo}><button type="button" onClick={() => abrir(p.e)}>{rotulo(p.e)}<b className="num">{pct((p.e.realizado / tot) * 100)}</b></button></li>)}</ol>}
          </section>))}
      </div>
    </>
  );
}

// ---------- Tabela ----------
const COLS = [
  ["codigo", "Código"], ["nome", "Evento"], ["grupo", "Grupo"], ["orcado", "Orçado", 1], ["realizado", "Realizado", 1],
  ["diferenca", "Diferença", 1], ["pct", "Execução", 1], ["credito", "Crédito", 1], ["situacao", "Situação"],
];
function Tabela({ l, abrir }) {
  const [ord, setOrd] = useState(["codigo", 1]);
  const [k, dir] = ord;
  const lista = [...l].sort((a, b) => {
    const x = a[k] ?? -Infinity, y = b[k] ?? -Infinity;
    if (k === "situacao") return (ORDEM_SIT.indexOf(x) - ORDEM_SIT.indexOf(y)) * dir;
    return (typeof x === "number" ? x - y : String(x).localeCompare(String(y), "pt-BR", { numeric: true })) * dir;
  });
  const clica = (c, num) => setOrd(k === c ? [c, -dir] : [c, num ? -1 : 1]);
  const orc = soma(l, "orcado"), rea = soma(l, "realizado");
  return (
    <div className="tabela-rolo alto"><table className="tabela orc-tabela">
      <thead><tr>{COLS.map(([c, n, num]) => (
        <th key={c} className={num ? "d" : ""} aria-sort={k === c ? (dir > 0 ? "ascending" : "descending") : undefined}>
          <button type="button" className="orc-th" onClick={() => clica(c, num)}>{n}{k === c && <span aria-hidden>{dir > 0 ? " ▲" : " ▼"}</span>}</button></th>))}</tr></thead>
      <tbody>{lista.map((e) => (
        <tr key={e.codigo} onClick={() => abrir(e)} className="orc-tr">
          <td className="num">{e.codigo}</td><td>{bonito(e.nome)}</td><td className="mudo">{e.grupo}</td>
          <td className="d num">{fmt(e.orcado)}</td><td className="d num">{fmt(e.realizado)}</td>
          <td className={"d num " + (e.diferenca < 0 ? "t-ruim" : e.diferenca > 0 ? "t-ok" : "")}>{fmt(e.diferenca)}</td>
          <td className="d"><span className="orc-mini"><span className={"orc-mini-barra " + SIT[e.situacao].cls} style={{ width: `${Math.min(e.pct ?? 0, 100)}%` }} /></span><span className="num">{pct(e.pct)}</span></td>
          <td className="d num mudo">{e.credito ? fmt(e.credito) : "—"}</td><td><Situacao s={e.situacao} /></td>
        </tr>))}</tbody>
      <tfoot><tr><td /><td><b>Totais ({l.length})</b></td><td /><td className="d num"><b>{fmt(orc)}</b></td><td className="d num"><b>{fmt(rea)}</b></td>
        <td className={"d num " + (orc - rea < 0 ? "t-ruim" : "t-ok")}><b>{fmt(orc - rea)}</b></td><td className="d num"><b>{pct(orc ? (rea / orc) * 100 : null)}</b></td>
        <td className="d num"><b>{fmt(soma(l, "credito"))}</b></td><td /></tr></tfoot>
    </table></div>
  );
}

function baixarCsv(l, nome) {
  const n = (v) => (v == null ? "" : String(v.toFixed(2)).replace(".", ","));
  const linhas = [["Código", "Evento", "Grupo", "Orçado", "Realizado", "Diferença", "Execução %", "Crédito", "Situação"].join(";"),
    ...l.map((e) => [e.codigo, `"${e.nome.replace(/"/g, '""')}"`, e.grupo, n(e.orcado), n(e.realizado), n(e.diferenca), n(e.pct), n(e.credito), SIT[e.situacao].nome].join(";"))];
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["﻿" + linhas.join("\r\n")], { type: "text/csv;charset=utf-8" }));
  a.download = nome; a.click();
}

// ---------- Detalhe de um evento ----------
function Detalhe({ e, l, aoFechar, aoEsconder }) {
  useEffect(() => { const esc = (ev) => ev.key === "Escape" && aoFechar(); document.addEventListener("keydown", esc); return () => document.removeEventListener("keydown", esc); }, [aoFechar]);
  const rea = soma(l, "realizado"), orc = soma(l, "orcado");
  const pos = [...l].sort((a, b) => b.realizado - a.realizado).findIndex((x) => x.codigo === e.codigo) + 1;
  const max = Math.max(e.orcado, e.realizado) || 1;
  return (
    <div className="orc-fundo" onClick={aoFechar}>
      <aside className="orc-gaveta" role="dialog" aria-modal="true" aria-label={rotulo(e)} onClick={(ev) => ev.stopPropagation()}>
        <div className="orc-gaveta-cab"><div><small className="num">{e.codigo} · {e.grupo}</small><h2>{bonito(e.nome)}</h2></div>
          <button type="button" className="icone" onClick={aoFechar} aria-label="Fechar"><Fechar /></button></div>
        <Situacao s={e.situacao} /><span className="mudo" style={{ marginLeft: 8 }}>{SIT[e.situacao].desc}</span>
        <div className="orc-medidor" style={{ marginTop: 18 }}>
          {[["Orçado", e.orcado, "orcado"], ["Realizado", e.realizado, "real"]].map(([n, v, c]) => (
            <div key={n} className="orc-med-linha"><span>{n}</span><div className="orc-trilho"><div className={"orc-barra " + c} style={{ width: `${(v / max) * 100}%` }} /></div><b className="num">{curto(v)}</b></div>))}
        </div>
        <dl className="orc-ficha">
          <dt>Orçado</dt><dd className="num">R$ {fmt(e.orcado)}</dd>
          <dt>Realizado</dt><dd className="num">R$ {fmt(e.realizado)}</dd>
          <dt>{e.diferenca < 0 ? "Passou do orçado" : "Sobrou"}</dt><dd className={"num " + (e.diferenca < 0 ? "t-ruim" : "t-ok")}>R$ {fmt(Math.abs(e.diferenca))}</dd>
          <dt>Execução</dt><dd className="num">{pct(e.pct)}</dd>
          <dt>Crédito</dt><dd className="num">R$ {fmt(e.credito)}</dd>
          <dt>Do realizado total</dt><dd className="num">{pct(rea ? (e.realizado / rea) * 100 : 0)}</dd>
          <dt>Do orçado total</dt><dd className="num">{pct(orc ? (e.orcado / orc) * 100 : 0)}</dd>
          <dt>Posição no gasto</dt><dd className="num">{e.realizado > 0 ? `${pos}º de ${l.filter((x) => x.realizado > 0).length}` : "—"}</dd>
        </dl>
        <button type="button" className="btn" onClick={() => aoEsconder(e)} title="Tira este evento dos gráficos, dos totais e da tabela (dá para voltar)"><Olho />Esconder dos gráficos</button>
      </aside>
    </div>
  );
}

// ---------- Tela ----------
export default function Orcamento() {
  const [arquivo, setArquivo] = useState(null);
  const [res, setRes] = useState(null);
  const [erro, setErro] = useState("");
  const [lendo, setLendo] = useState(false);
  const [busca, setBusca] = useState("");
  const [grupo, setGrupo] = useState("");
  const [sits, setSits] = useState([]);
  const [escondidos, setEscondidos] = useState([]);
  const [grafico, setGrafico] = useState("comparar");
  const [medidaComp, setMedidaComp] = useState("realizado");
  const [aberto, setAberto] = useState(null);
  const [tipEst, setTipEst] = useState(null);
  const tip = useMemo(() => ({ mostrar: (ev, c) => setTipEst({ x: ev.clientX, y: ev.clientY, c }), esconder: () => setTipEst(null) }), []);

  async function ler(f = arquivo) {
    setLendo(true); setErro("");
    try {
      const fd = new FormData(); fd.append("arquivo", f);
      const r = await autFetch(API + "/orcamento/ler", { method: "POST", body: fd });
      const c = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(typeof c.detail === "string" ? c.detail : r.status === 404 ? "O servidor ainda não tem a leitura do orçamento. Atualize o backend e tente de novo." : "Erro ao ler a planilha");
      setRes(c); setEscondidos([]); setSits([]); setGrupo(""); setBusca("");
    } catch (x) { setErro(mensagemDeErro(x)); setRes(null); }
    setLendo(false);
  }

  const todos = res?.eventos || [];
  const grupos = [...new Set(todos.map((e) => e.grupo))];
  const termo = busca.trim().toLowerCase();
  const l = todos.filter((e) => !escondidos.includes(e.codigo) && (!grupo || e.grupo === grupo) && (!sits.length || sits.includes(e.situacao))
    && (!termo || `${e.codigo} ${e.nome}`.toLowerCase().includes(termo)));
  const filtrado = l.length !== todos.length;
  const credito = filtrado ? soma(l, "credito") : res?.totais?.credito || 0;
  const total = soma(l, "realizado");
  const props = { l, tip, abrir: setAberto, total };
  const tipPos = tipEst && { left: Math.min(tipEst.x + 14, (typeof window !== "undefined" ? window.innerWidth : 1200) - 300), top: tipEst.y + 14 };

  return (
    <div className="orc">
      <Dica passos={[
        "Envie o Relatório Orçado x Realizado (.xlsx) tirado do sistema.",
        "Veja o resumo e os destaques: maiores estouros, gastos sem orçamento e economias.",
        "Troque de gráfico nas abas. Passe o mouse para ver os valores; clique num evento para abrir o detalhe.",
        "Filtre por grupo, situação ou nome. Um evento fora da curva atrapalhando a escala? Abra e use “Esconder dos gráficos”.",
        "A tabela no fim tem tudo; clique no título da coluna para ordenar e baixe o CSV do que está filtrado."]} />

      <section className="painel">
        <div className="orc-cab"><div><h2>{res?.titulo || "Orçado × Realizado"}</h2><p className="mudo">{res ? `${arquivo?.name} · ${todos.length} eventos` : "Envie a planilha para ver os gráficos."}</p></div></div>
        {erro && <div className="faixa-erro" role="alert" style={{ marginBottom: 14 }}>{erro}</div>}
        <Soltar rotulo="Escolha o relatório Orçado x Realizado" arquivo={arquivo} aoEscolher={(f) => { setArquivo(f); ler(f); }} />
        {lendo && <p className="mudo" role="status" style={{ marginTop: 10 }}><span className="giro" /> Lendo a planilha…</p>}
      </section>

      {res && <>
        <div className="orc-filtros">
          <label className="orc-busca"><Lupa /><input type="search" placeholder="Buscar evento ou código" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar evento" /></label>
          <select value={grupo} onChange={(e) => setGrupo(e.target.value)} aria-label="Grupo"><option value="">Todos os grupos</option>{grupos.map((g) => <option key={g}>{g}</option>)}</select>
          {ORDEM_SIT.map((s) => { const on = sits.includes(s); const n = todos.filter((e) => e.situacao === s && !escondidos.includes(e.codigo)).length; return (
            <button key={s} type="button" className={"filtro orc-filtro " + SIT[s].cls + (on ? " ativo" : "")} aria-pressed={on} onClick={() => setSits(on ? sits.filter((x) => x !== s) : [...sits, s])}>
              <Situacao s={s} curta />{SIT[s].nome}<b>{n}</b></button>); })}
          {escondidos.map((c) => { const e = todos.find((x) => x.codigo === c); return (
            <span key={c} className="chip orc-escondido" title="Escondido dos gráficos">oculto: {e ? rotulo(e) : c}<button type="button" aria-label={`Mostrar ${c} de novo`} onClick={() => setEscondidos(escondidos.filter((x) => x !== c))}>×</button></span>); })}
          {(filtrado) && <button type="button" className="btn orc-limpar" onClick={() => { setBusca(""); setGrupo(""); setSits([]); setEscondidos([]); }}>Limpar filtros</button>}
          <span className="contagem mudo">{l.length} de {todos.length} eventos</span>
        </div>

        <Kpis l={l} credito={credito} />

        <div className="orc-duas">
          <section className="painel">
            <h2 className="orc-h2">Orçado e realizado no total</h2>
            <Medidor l={l} />
          </section>
          <section className="painel">
            <div className="orc-h2-linha"><h2 className="orc-h2">Situação dos eventos</h2>
              <div className="orc-seg" role="radiogroup" aria-label="Medir pela">
                {[["qtd", "Quantidade"], ["realizado", "Realizado"], ["orcado", "Orçado"]].map(([v, n]) => <button key={v} type="button" role="radio" aria-checked={medidaComp === v} className={medidaComp === v ? "ativo" : ""} onClick={() => setMedidaComp(v)}>{n}</button>)}
              </div></div>
            <Composicao l={l} medida={medidaComp} tip={tip} />
          </section>
        </div>

        <Destaques l={l} abrir={setAberto} />

        <section className="painel">
          <div className="abas orc-abas" role="tablist" aria-label="Gráficos">
            {GRAFICOS.map(([k, n]) => <button key={k} type="button" role="tab" aria-selected={grafico === k} className={grafico === k ? "ativa" : ""} onClick={() => setGrafico(k)}>{n}</button>)}
          </div>
          {l.length === 0 ? <p className="mudo">Nenhum evento com esses filtros.</p> : <div role="tabpanel">
            {grafico === "comparar" && <GComparar {...props} />}
            {grafico === "execucao" && <GExecucao {...props} />}
            {grafico === "diferenca" && <GDiferenca {...props} />}
            {grafico === "mapa" && <GMapa {...props} />}
            {grafico === "dispersao" && <GDispersao {...props} />}
            {grafico === "grupos" && <GGrupos {...props} />}
            {grafico === "abc" && <GAbc {...props} />}
          </div>}
        </section>

        <section className="painel">
          <div className="orc-cab"><div><h2>Todos os eventos</h2><p className="mudo">Clique numa linha para ver o detalhe.</p></div>
            <button type="button" className="btn" onClick={() => baixarCsv(l, "orcado_x_realizado.csv")}><Baixar />Baixar CSV</button></div>
          <Tabela l={l} abrir={setAberto} />
        </section>
      </>}

      {aberto && <Detalhe e={aberto} l={l.includes(aberto) ? l : todos} aoFechar={() => setAberto(null)}
        aoEsconder={(e) => { setEscondidos([...escondidos, e.codigo]); setAberto(null); }} />}
      {tipEst && <div className="orc-tip" style={tipPos} role="tooltip">{tipEst.c}</div>}
    </div>
  );
}
