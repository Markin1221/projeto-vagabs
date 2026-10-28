"use client";
import { useEffect, useState } from "react";

const SEV = { alta: "Alta", media: "Média", info: "Info" };
const SITU = { rombo: ["alta", "Perda no período"], compensou: ["info", "Compensou entre meses"], ok: ["info", "Ok"] };
const brl = (v) => (v == null ? "—" : (v < 0 ? "−" : "") + "R$ " + Math.abs(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const mil = (v) => (v == null ? "—" : (v < 0 ? "−" : "") + "R$ " + Math.round(Math.abs(v) / 1000).toLocaleString("pt-BR") + " mil");

// Análise do período inteiro: empréstimo num mês e devolução no outro se compensam nos saldos acumulados.
export default function Completa({ rxApi, aoFechar }) {
  const [c, setC] = useState(null);
  const [erro, setErro] = useState("");
  const [gerando, setGerando] = useState(false);

  useEffect(() => { rxApi("/completa").then(setC).catch((x) => setErro(x.message)); }, []);
  async function gerar() {
    setGerando(true); setErro("");
    try { const r = await rxApi("/completa/parecer", { method: "POST" }); setC((x) => ({ ...x, ...r })); } catch (x) { setErro(x.message); }
    setGerando(false);
  }

  if (!c) return <section className="painel">{erro ? <div className="faixa-erro" role="alert">{erro}</div> : <p className="mudo">Juntando todos os meses…</p>}</section>;
  if (c.vazio) return (
    <section className="painel"><div className="painel-cab rx-cab"><div><h2>Análise completa</h2><p>Salve pelo menos um mês no formato novo para ver a análise do período.</p></div>
      <button type="button" className="btn" onClick={aoFechar}>Fechar</button></div></section>);

  const perdaPassagem = c.passagem.filter((p) => p.situacao === "rombo").reduce((a, p) => a + p.liq, 0);
  const compensadas = c.passagem.filter((p) => p.situacao !== "ok");
  const parecerVelho = c.parecer && c.parecerMeses !== c.periodo;

  return (
    <section className="painel rx-mes" id="rx-completa">
      <div className="painel-cab rx-cab">
        <div><h2>Análise completa: {c.periodo}</h2><p>Todos os {c.meses.length} meses enviados juntos. Empréstimos feitos num mês e devolvidos em outro já estão compensados.</p></div>
        <button type="button" className="btn" onClick={aoFechar}>Voltar para o mês</button>
      </div>
      {erro && <div className="faixa-erro" role="alert" style={{ marginBottom: 14 }}>{erro}</div>}

      <div className="rx-kpis">
        {[["Resultado do período", c.totais.resultado, "Receita + despesas + passagem, sem empréstimos"],
          ["Ainda devido para fora", c.dividaEmAberto ? -c.dividaEmAberto : 0, "Posto, banco e poupança em aberto"],
          ["Perda nas contas de passagem", perdaPassagem, "Pago a mais e não recuperado"],
          ["Quinzenas nunca recebidas", -c.perdaEstimada, `${c.faltando.length} quinzena(s), estimado pela média`]].map(([l, v, n], i) => (
          <div key={l} className={"rx-kpi " + (v < 0 ? "ruim" : "bom") + (i === 0 && v < 0 ? " destaque" : "")}><span className="rx-kpi-l">{l}</span><span className={"rx-kpi-v num " + (v < 0 ? "neg" : "")}>{mil(v)}</span><span className="mudo">{n}</span></div>))}
      </div>

      <div className="rx-bloco">
        <div className="rx-cab"><h3>Parecer da IA sobre o período</h3>
          <button type="button" className="btn" disabled={gerando} onClick={gerar}>{gerando ? "Analisando…" : c.parecer ? "Gerar de novo" : "Gerar parecer"}</button></div>
        {parecerVelho && <p className="mudo">Este parecer foi gerado para {c.parecerMeses}. Entraram meses novos depois: gere de novo.</p>}
        {c.parecer ? <div className="rx-parecer">{c.parecer}</div> : <p className="mudo">Nenhum parecer do período gerado ainda.</p>}
      </div>

      <div className="rx-bloco"><h3>O que o período mostra</h3>
        <div className="rx-flags">
          {[["alta", "Precisa de atenção"], ["media", "Conferir"], ["info", "Para saber"]].map(([s, nome]) => {
            const fs = c.flags.filter((f) => f.sev === s);
            return fs.length > 0 && [<p key={s} className="rx-grupo-t">{nome} · {fs.length}</p>,
              ...fs.map((f, i) => <div key={s + i} className={"rx-flag " + f.sev}><span className={"rx-pill " + f.sev}>{SEV[f.sev]}</span><div><b>{f.t}</b><p>{f.p}</p></div></div>)];
          })}
        </div></div>

      <div className="rx-bloco"><h3>Empréstimos e devoluções mês a mês</h3>
        <p className="mudo">Saldo acumulado positivo: entrou mais do que voltou (a Matriz deve). Negativo: a Matriz mandou mais do que recebeu (devem à Matriz).</p>
        <div className="tabela-rolo"><table className="tabela">
          <thead><tr><th>Origem</th>{c.meses.map((m) => <th key={m} className="d">{m}</th>)}<th className="d">Em aberto</th></tr></thead>
          <tbody>{c.contas.map((g) => (
            <tr key={g.g}><td>{g.g}</td>
              {g.meses.map((m) => <td key={m.mes} className="num">{mil(m.in + m.out)}<small>acum. {mil(m.acum)}</small></td>)}
              <td className={"num " + (Math.abs(g.aberto) > 1000 ? "rx-neg-cel" : "")}><b>{brl(g.aberto)}</b></td></tr>))}
            {!c.contas.length && <tr><td colSpan={c.meses.length + 2} className="vazio">Nenhum movimento com Posto, banco ou poupança.</td></tr>}</tbody>
        </table></div>
        {c.semDetalheFin.length > 0 && <p className="mudo">Para ver cada transferência de {c.semDetalheFin.join(", ")}, envie e salve esse(s) mês(es) de novo.</p>}
        {c.finLanc.length > 0 && (
          <details className="rx-det"><summary>Cada transferência ({c.finLanc.length})</summary>
            <div className="tabela-rolo alto"><table className="tabela">
              <thead><tr><th>Mês</th><th>Data</th><th>Origem</th><th>Título / descrição</th><th className="d">Valor</th></tr></thead>
              <tbody>{c.finLanc.map((r, i) => <tr key={i}><td>{r.mes}</td><td>{r.d}</td><td>{r.g}</td><td>{r.tit}<small>{r.desc}</small></td>
                <td className={"num " + (r.v < 0 ? "rx-neg-cel" : "")}>{brl(r.v)}</td></tr>)}</tbody>
            </table></div></details>)}
      </div>

      <div className="rx-bloco"><h3>Contas de passagem no período</h3>
        <p className="mudo">Uma conta negativa num mês pode ser só atraso. Aqui aparece se ela se recuperou depois.</p>
        <div className="tabela-rolo alto"><table className="tabela">
          <thead><tr><th>Conta</th>{c.meses.map((m) => <th key={m} className="d">{m}</th>)}<th className="d">Período</th><th>Situação</th></tr></thead>
          <tbody>{compensadas.map((p) => (
            <tr key={p.n}><td>{p.n}</td>{c.meses.map((m) => <td key={m} className={"num " + ((p.porMes[m] || 0) < 0 ? "rx-neg-cel" : "")}>{p.porMes[m] != null ? mil(p.porMes[m]) : "—"}</td>)}
              <td className={"num " + (p.liq < 0 ? "rx-neg-cel" : "")}><b>{brl(p.liq)}</b></td><td><span className={"rx-pill " + SITU[p.situacao][0]}>{SITU[p.situacao][1]}</span></td></tr>))}
            {!compensadas.length && <tr><td colSpan={c.meses.length + 3} className="vazio">Nenhuma conta de passagem ficou negativa.</td></tr>}</tbody>
        </table></div>
      </div>

      <div className="duas-colunas rx-duas">
        <div className="rx-bloco"><h3>Quinzenas de taxa nunca recebidas</h3>
          <div className="tabela-rolo"><table className="tabela"><thead><tr><th>Linha</th><th>Referência</th></tr></thead>
            <tbody>{c.faltando.length ? c.faltando.map((f, i) => <tr key={i}><td>{f.linha}</td><td>{f.ref}</td></tr>) : <tr><td colSpan={2} className="vazio">Todas as quinzenas devidas entraram.</td></tr>}</tbody></table></div></div>
        <div className="rx-bloco"><h3>Quinzenas pagas com atraso</h3>
          <div className="tabela-rolo"><table className="tabela"><thead><tr><th>Linha</th><th>Referência</th><th>Paga em</th><th className="d">Valor</th></tr></thead>
            <tbody>{c.atrasadas.length ? c.atrasadas.map((f, i) => <tr key={i}><td>{f.linha}</td><td>{f.ref}</td><td>{f.d}</td><td className="num">{brl(f.v)}</td></tr>) : <tr><td colSpan={4} className="vazio">Nenhum atraso de 2 meses ou mais.</td></tr>}</tbody></table></div></div>
      </div>
    </section>
  );
}
