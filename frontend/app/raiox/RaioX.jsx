"use client";
import { useEffect, useMemo, useState } from "react";
import Dica from "../ui/Dica";
import Soltar from "../ui/Soltar";
import { API, autFetch, fmt } from "../lib";

const CHAVE = "vagabs-raiox";
const lerT = () => { try { return sessionStorage.getItem(CHAVE) || ""; } catch { return ""; } };
const guardarT = (t) => { try { t ? sessionStorage.setItem(CHAVE, t) : sessionStorage.removeItem(CHAVE); } catch {} };
const LINHAS = ["Interbairros", "Tiúma/Ponte (intermunicipal)", "Alimentadoras"];
const SEV = { alta: "Alta", media: "Média", info: "Info" };

const brl = (v) => (v == null ? "—" : (v < 0 ? "−" : "") + "R$ " + fmt(Math.abs(v)));
const mil = (v) => (v == null ? "—" : (v < 0 ? "−" : "") + "R$ " + Math.round(Math.abs(v) / 1000).toLocaleString("pt-BR") + " mil");
const media = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);

async function rxApi(caminho, opcoes = {}) {
  const r = await autFetch(API + "/raiox" + caminho, { ...opcoes, headers: { ...(opcoes.headers || {}), "X-Raiox-Token": lerT() } });
  const c = await r.json().catch(() => ({}));
  if (r.status === 403) { guardarT(""); window.dispatchEvent(new Event("raiox-403")); }
  if (!r.ok) throw new Error(typeof c.detail === "string" ? c.detail : "Erro no servidor");
  return c;
}

function Bloqueio({ aoEntrar }) {
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);
  async function entrar(e) {
    e.preventDefault(); setEnviando(true); setErro("");
    try {
      const r = await autFetch(API + "/raiox/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ senha }) });
      const c = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(r.status === 403 ? "Senha incorreta." : "Não consegui falar com o servidor.");
      guardarT(c.token); aoEntrar();
    } catch (x) { setErro(x.message); }
    setEnviando(false);
  }
  return (
    <section className="painel rx-bloqueio">
      <div className="painel-cab"><h2>Área restrita</h2><p>Esta aba mostra a auditoria do caixa. Digite a senha do Raio-X para continuar.</p></div>
      <form onSubmit={entrar} className="rx-login">
        <label>Senha do Raio-X<input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} autoFocus autoComplete="off" required /></label>
        {erro && <p className="msg ruim" role="alert">{erro}</p>}
        <button type="submit" className="btn primario" disabled={enviando || !senha}>{enviando ? "Entrando…" : "Entrar"}</button>
      </form>
    </section>
  );
}

const Flag = ({ f }) => (
  <div className="rx-flag"><span className={"rx-pill " + f.sev}>{SEV[f.sev]}</span><div><b>{f.t}</b><p>{f.p}</p></div></div>
);
const Kpis = ({ itens }) => (
  <div className="rx-kpis">{itens.map(([l, v, n, cru]) => (
    <div key={l} className="rx-kpi"><span className="rx-kpi-l">{l}</span><span className={"rx-kpi-v num " + (v < 0 ? "neg" : "")}>{cru ?? mil(v)}</span><span className="mudo">{n}</span></div>))}
  </div>
);
function Risco({ v = 0 }) {
  const cor = v >= 60 ? "var(--ruim)" : v >= 25 ? "var(--aviso)" : "var(--ok)";
  return <span className="rx-risco"><span><b style={{ width: v + "%", background: cor }} /></span>{v}</span>;
}
function Lanc({ lista, tipico }) {
  return (
    <div className="tabela-rolo alto"><table className="tabela">
      <thead><tr><th>Linha</th><th>Data</th><th>Título / descrição</th><th>Item</th><th className="d">Valor</th>{tipico && <th className="d">Típico do item</th>}</tr></thead>
      <tbody>{lista.map((r, i) => (
        <tr key={i}><td className="num">{r.i}</td><td>{r.d}</td><td>{r.tit}<small>{r.desc}</small></td><td>{r.item}</td>
          <td className="num rx-neg-cel">{brl(r.v)}</td>{tipico && <td className="num">{brl(-r.tipico)}</td>}</tr>))}</tbody>
    </table></div>
  );
}

function Grafico({ meses, sel }) {
  if (!meses.length) return null;
  const W = Math.max(480, meses.length * 90), Ht = 220, pad = 46;
  const max = Math.max(...meses.map((h) => Math.max(h.receita || 0, h.fixas || 0))) * 1.1 || 1;
  const bw = (W - pad - 10) / meses.length, y = (v) => Ht - 26 - (v / max) * (Ht - 46);
  return (
    <div className="rx-grafico">
      <div className="rx-legenda"><span><i style={{ background: "var(--marca)" }} />Receita própria (taxas)</span><span><i style={{ background: "var(--aviso)" }} />Despesas fixas comparáveis</span></div>
      <svg viewBox={`0 0 ${W} ${Ht}`} role="img" aria-label="Receita e despesas fixas por mês">
        {[0, 1, 2, 3, 4].map((t) => { const v = (max * t) / 4; return (
          <g key={t}><line x1={pad} x2={W - 6} y1={y(v)} y2={y(v)} stroke="var(--linha)" />
            <text x={pad - 6} y={y(v) + 4} textAnchor="end" fontSize="11" fill="var(--tinta-3)">{Math.round(v / 1000)}k</text></g>); })}
        {meses.map((h, i) => { const x = pad + i * bw + bw * 0.15, w = bw * 0.33; return (
          <g key={h.id}>
            <rect x={x} y={y(h.receita || 0)} width={w} height={Ht - 26 - y(h.receita || 0)} fill="var(--marca)" rx="2" />
            <rect x={x + w + 3} y={y(h.fixas || 0)} width={w} height={Ht - 26 - y(h.fixas || 0)} fill="var(--aviso)" rx="2" />
            <text x={pad + i * bw + bw / 2} y={Ht - 8} textAnchor="middle" fontSize="12" fill={h.id === sel ? "var(--tinta)" : "var(--tinta-3)"} fontWeight={h.id === sel ? 600 : 400}>{h.rotulo}</text>
          </g>); })}
      </svg>
    </div>
  );
}

function Mes({ d, hist, previa, aoParecer }) {
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState("");
  const H = hist.filter((h) => h.id !== d.id);
  const novo = d.formato === "novo";
  async function gerar() {
    setGerando(true); setErro("");
    try { await aoParecer(d.id); } catch (x) { setErro(x.message); }
    setGerando(false);
  }
  const l = d.lanc || {};
  const detalhes = [
    ["Movimento com Posto, banco e poupança", (d.finG || []).length > 0 && (
      <div className="tabela-rolo"><table className="tabela"><thead><tr><th>Origem</th><th className="d">Entrou</th><th className="d">Saiu</th><th className="d">Saldo</th></tr></thead>
        <tbody>{d.finG.map((g) => <tr key={g.g}><td>{g.g}</td><td className="num">{brl(g.in)}</td><td className="num">{brl(g.out)}</td><td className="num">{brl(g.in + g.out)}</td></tr>)}</tbody></table></div>)],
    [`Pagamentos atípicos para o item (${(d.atip || []).length})`, (d.atip || []).length > 0 && <Lanc lista={d.atip} tipico />],
    [`Possíveis duplicados (${(l.dup || []).length})`, (l.dup || []).length > 0 && <Lanc lista={l.dup} />],
    [`Saídas com descrição sensível (${(l.sus || []).length})`, (l.sus || []).length > 0 && <Lanc lista={l.sus} />],
    [`Saídas sem item de despesa (${(l.sem || []).length})`, (l.sem || []).length > 0 && <Lanc lista={l.sem} />],
    ["15 maiores despesas da cooperativa", (l.big || []).length > 0 && <Lanc lista={l.big} />],
    [`Linhas onde o saldo não fecha (${(l.saldo || []).length})`, (l.saldo || []).length > 0 && <Lanc lista={l.saldo} />],
  ].filter((x) => x[1]);

  return (
    <section className="painel rx-mes">
      <div className="painel-cab"><h2>Mês: {d.rotulo}{previa && " (prévia, ainda não salvo)"}</h2><p>{d.arquivo}</p></div>
      <Kpis itens={[["Receita própria (taxas)", d.receita, "Taxa administrativa recebida"], ["Despesas fixas comparáveis", d.fixas != null ? -d.fixas : null, "Mesmas categorias da época boa"],
        ["Saldo das contas de passagem", d.passagem, "Deveria ficar perto de zero"], ["Resultado do mês", d.resultado, "Receita + despesas + passagem"],
        ["Coberto com Posto / banco", d.financiamento, "Dinheiro de fora para fechar o mês"]]} />

      {novo && (
        <div className="rx-bloco">
          <div className="rx-cab"><h3>Parecer da IA</h3>
            <button type="button" className="btn" disabled={gerando || previa} onClick={gerar}>{gerando ? "Analisando…" : d.parecer ? "Gerar de novo" : "Gerar parecer"}</button></div>
          {previa && <p className="mudo">Salve o mês no histórico para gerar o parecer.</p>}
          {erro && <div className="faixa-erro" role="alert">{erro}</div>}
          {d.parecer ? <div className="rx-parecer">{d.parecer}</div> : !previa && <p className="mudo">Nenhum parecer gerado para este mês ainda.</p>}
        </div>)}

      <div className="rx-bloco"><h3>Alertas de regra</h3>
        {(d.flags || []).length ? d.flags.map((f, i) => <Flag key={i} f={f} />) : <p className="mudo">{novo ? "Nenhum alerta de regra." : "Mês de referência da época boa. Serve de base para a comparação."}</p>}</div>
      <div className="rx-bloco"><h3>Picos fora do padrão (comparado ao histórico)</h3>
        {(d.anomalias || []).length ? d.anomalias.map((f, i) => <Flag key={i} f={f} />) : <p className="mudo">Nada fora do padrão em relação ao histórico.</p>}</div>

      <div className="duas-colunas rx-duas">
        <div className="rx-bloco"><h3>Receita da cooperativa</h3>
          <div className="tabela-rolo"><table className="tabela"><thead><tr><th>Linha</th><th className="d">Este mês</th><th className="d">Média histórico</th></tr></thead>
            <tbody>{LINHAS.map((ln) => <tr key={ln}><td>{ln}</td><td className="num">{brl(d.receitaLinhas?.[ln] || 0)}</td><td className="num">{brl(media(H.map((h) => h.receitaLinhas?.[ln] || 0)))}</td></tr>)}
              {(d.receitaDet || []).map((r, i) => <tr key={"r" + i} className="zero"><td colSpan={2}>{r.d} · {r.linha} · ref. {r.ref}{r.lag >= 2 && <span className="rx-pill media" style={{ marginLeft: 6 }}>atrasada</span>}</td><td className="num">{brl(r.v)}</td></tr>)}</tbody></table></div></div>
        <div className="rx-bloco"><h3>Despesas fixas × histórico</h3>
          <div className="tabela-rolo"><table className="tabela"><thead><tr><th>Despesa</th><th className="d">Este mês</th><th className="d">Média</th><th className="d">Var.</th></tr></thead>
            <tbody>{Object.keys(d.cats || {}).map((c) => { const v = d.cats[c] || 0, m = media(H.map((h) => h.cats?.[c] || 0)); if (!v && !m) return null; const p = m ? (v - m) / m : 0;
              return <tr key={c}><td>{c}</td><td className="num">{brl(-v)}</td><td className="num">{m != null ? brl(-m) : "—"}</td><td className={"num " + (p > 0.25 ? "rx-neg-cel" : "")}>{m ? (p > 0 ? "+" : "") + Math.round(p * 100) + "%" : "—"}</td></tr>; })}</tbody></table></div></div>
      </div>

      {novo && (
        <div className="rx-bloco"><h3>Contas de passagem: recebeu × pagou</h3><p className="mudo">Dinheiro que entra só para ser repassado. Negativo quer dizer que a cooperativa pagou com dinheiro próprio.</p>
          <div className="tabela-rolo alto"><table className="tabela"><thead><tr><th>Conta</th><th className="d">Recebeu</th><th className="d">Pagou</th><th className="d">Diferença</th></tr></thead>
            <tbody>{(d.pass || []).map((p) => <tr key={p.n}><td>{p.n}</td><td className="num">{brl(p.in)}</td><td className="num">{brl(p.out)}</td><td className={"num " + (p.liq < 0 ? "rx-neg-cel" : "")}>{brl(p.liq)}</td></tr>)}</tbody></table></div></div>)}

      {detalhes.map(([t, c]) => <details key={t} className="rx-det"><summary>{t}</summary>{c}</details>)}
    </section>
  );
}

export default function RaioX() {
  const [liberado, setLiberado] = useState(false);
  const [hist, setHist] = useState([]);
  const [sel, setSel] = useState(null);
  const [arquivo, setArquivo] = useState(null);
  const [previa, setPrevia] = useState(null);
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState("");

  useEffect(() => { setLiberado(!!lerT()); const f = () => setLiberado(false); window.addEventListener("raiox-403", f); return () => window.removeEventListener("raiox-403", f); }, []);
  async function carregar(escolher) {
    try {
      const h = await rxApi("/meses"); setHist(h);
      setSel((s) => escolher || s || (h.filter((m) => m.formato === "novo").at(-1) || h.at(-1))?.id || null);
    } catch (x) { setErro(x.message); }
  }
  useEffect(() => { if (liberado) carregar(); }, [liberado]);

  async function enviar(f) {
    setArquivo(f); setPrevia(null); setErro(""); setOcupado("Analisando…");
    try { const fd = new FormData(); fd.append("arquivo", f); const d = await rxApi("/analisar", { method: "POST", body: fd }); setPrevia(d); setSel(d.id); }
    catch (x) { setErro(x.message); }
    setOcupado("");
  }
  async function salvar() {
    setOcupado("Salvando…"); setErro("");
    try { const fd = new FormData(); fd.append("arquivo", arquivo); const d = await rxApi("/salvar", { method: "POST", body: fd }); setPrevia(null); setArquivo(null); await carregar(d.id); }
    catch (x) { setErro(x.message); }
    setOcupado("");
  }
  async function apagar(id) {
    setErro("");
    try { await rxApi("/meses/" + id, { method: "DELETE" }); setSel(null); await carregar(); } catch (x) { setErro(x.message); }
  }
  async function parecer(id) {
    const r = await rxApi(`/meses/${id}/parecer`, { method: "POST" });
    setHist((h) => h.map((m) => (m.id === id ? { ...m, parecer: r.parecer, parecerEm: r.parecerEm } : m)));
  }
  function sair() { guardarT(""); setLiberado(false); setHist([]); setPrevia(null); }

  const ordenado = useMemo(() => [...hist].sort((a, b) => a.id.localeCompare(b.id)), [hist]);
  const atual = previa && previa.id === sel ? previa : ordenado.find((h) => h.id === sel);
  const grafico = previa ? [...ordenado.filter((h) => h.id !== previa.id), previa].sort((a, b) => a.id.localeCompare(b.id)) : ordenado;
  const novos = ordenado.filter((h) => h.formato === "novo");
  const antigos = ordenado.filter((h) => h.formato === "antigo");
  const garantida = novos.reduce((a, h) => a + ((h.finG || []).find((g) => /garantida/i.test(g.g))?.in || 0), 0);
  const nAlertas = ordenado.reduce((a, h) => a + (h.flags || []).length + (h.anomalias || []).length, 0);
  const recorrentes = useMemo(() => {
    const rc = {};
    ordenado.forEach((h) => [...(h.flags || []), ...(h.anomalias || [])].forEach((f) => { const r = (rc[f.key] ??= { t: f.t, sev: f.sev, meses: [] }); if (!r.meses.includes(h.rotulo)) r.meses.push(h.rotulo); }));
    return Object.values(rc).sort((a, b) => b.meses.length - a.meses.length);
  }, [ordenado]);

  if (!liberado) return <Bloqueio aoEntrar={() => setLiberado(true)} />;
  return (
    <>
      <Dica passos={[
        "Envie o extrato mensal do DDATA Sol (.xlsx, formato com Data, Título, Centro de Custo, Item de Despesa, Valor e Saldo).",
        "Confira a prévia: alertas de regra, picos em relação ao histórico e os lançamentos suspeitos.",
        "Clique em Salvar no histórico. Cada mês salvo entra na comparação dos próximos.",
        "No mês salvo, clique em Gerar parecer para a IA escrever o resumo e o que conferir primeiro."]} />

      <section className="painel">
        <div className="painel-cab rx-cab"><div><h2>Enviar extrato do mês</h2><p>O mês é comparado com a época boa (nov/25 a fev/26) e com todos os meses já salvos.</p></div>
          <button type="button" className="btn leve" onClick={sair}>Bloquear aba</button></div>
        {erro && <div className="faixa-erro" role="alert" style={{ marginBottom: 14 }}>{erro}</div>}
        <Soltar rotulo="Escolha o extrato do mês" arquivo={arquivo} aoEscolher={enviar} />
        {ocupado && <p className="mudo" style={{ marginTop: 10 }}>{ocupado}</p>}
        {previa && (
          <div className="rx-previa">
            <span>Prévia de <b>{previa.rotulo}</b> pronta.{previa.jaExiste && ` Já existe ${previa.rotulo} no histórico: salvar vai substituir.`}</span>
            <button type="button" className="btn primario" disabled={!!ocupado} onClick={salvar}>{previa.jaExiste ? "Substituir no histórico" : "Salvar no histórico"}</button>
            <button type="button" className="btn" onClick={() => { setPrevia(null); setArquivo(null); setSel(null); carregar(); }}>Descartar</button>
          </div>)}
      </section>

      <section className="painel">
        <div className="painel-cab"><h2>Histórico acumulado</h2><p>{ordenado.length} meses no banco · {antigos.length} de referência e {novos.length} enviados</p></div>
        <Kpis itens={[["Buraco acumulado", novos.length ? novos.reduce((a, h) => a + (h.resultado || 0), 0) : null, `Soma dos ${novos.length} meses enviados`],
          ["Crédito bancário usado", novos.length ? -garantida : null, "Conta garantida somada"], ["Alertas registrados", null, "Regras e picos, todos os meses", String(nAlertas)],
          ["Receita média na época boa", media(antigos.map((h) => h.receita || 0)), "Referência nov/25 a fev/26"]]} />
        <Grafico meses={grafico} sel={sel} />
        <div className="tabela-rolo"><table className="tabela">
          <thead><tr><th>Mês</th><th className="d">Receita</th><th className="d">Despesas fixas</th><th className="d">Passagem</th><th className="d">Resultado</th><th className="d">Coberto por fora</th><th>Alertas</th><th>Risco</th><th /></tr></thead>
          <tbody>{ordenado.map((h) => { const al = [...(h.flags || []), ...(h.anomalias || [])]; const a = al.filter((f) => f.sev === "alta").length, m = al.filter((f) => f.sev === "media").length;
            return (
              <tr key={h.id} className={"clicavel" + (h.id === sel && !(previa && previa.id === sel) ? " rx-sel" : "")} tabIndex={0} onClick={() => setSel(h.id)} onKeyDown={(e) => e.key === "Enter" && setSel(h.id)}>
                <td><b>{h.rotulo}</b>{h.formato === "antigo" && <small>referência</small>}</td>
                <td className="num">{mil(h.receita)}</td><td className="num">{mil(h.fixas != null ? -h.fixas : null)}</td>
                <td className={"num " + (h.passagem < 0 ? "rx-neg-cel" : "")}>{mil(h.passagem)}</td><td className={"num " + (h.resultado < 0 ? "rx-neg-cel" : "")}>{mil(h.resultado)}</td>
                <td className="num">{mil(h.financiamento)}</td>
                <td>{a > 0 && <span className="rx-pill alta">{a} alta</span>} {m > 0 && <span className="rx-pill media">{m} média</span>}{!a && !m && <span className="mudo">—</span>}</td>
                <td><Risco v={h.risco || 0} /></td>
                <td className="acoes">{h.formato === "novo" && <button type="button" className="btn leve" onClick={(e) => { e.stopPropagation(); apagar(h.id); }}>Apagar</button>}</td>
              </tr>); })}</tbody>
        </table></div>
        <details className="rx-det"><summary>Problemas que se repetem ({recorrentes.length})</summary>
          <div className="tabela-rolo"><table className="tabela"><thead><tr><th>Problema</th><th>Gravidade</th><th className="d">Meses</th><th>Quando</th></tr></thead>
            <tbody>{recorrentes.length ? recorrentes.map((r) => <tr key={r.t}><td>{r.t}</td><td><span className={"rx-pill " + r.sev}>{SEV[r.sev]}</span></td><td className="num">{r.meses.length}</td><td>{r.meses.join(", ")}</td></tr>)
              : <tr><td colSpan={4} className="vazio">Nenhum problema registrado.</td></tr>}</tbody></table></div></details>
      </section>

      {atual && <Mes key={atual.id + (previa ? "p" : "")} d={atual} hist={ordenado} previa={!!(previa && previa.id === atual.id)} aoParecer={parecer} />}
    </>
  );
}
