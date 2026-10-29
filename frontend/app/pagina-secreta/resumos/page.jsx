"use client";
// Operação Resumos: relatório bruto do sistema (um .xlsx por mês) -> planilha tratada de cada mês + resumo de todos.
// Os custos fixos (motoristas e permissionário) ficam guardados no backend em faixas de meses.
import { useEffect, useState } from "react";
import Soltar from "../../ui/Soltar";
import { Baixar, Fechar, Lixo, Mais } from "../../ui/Icones";
import { API, autFetch, fmt, mensagemDeErro } from "../../lib";
import { CHAVE_TOKEN } from "../operacoes";
import "../../raiox/raiox.css";
import "./resumos.css";

const CATS = [
  ["motorista1", "Motorista 1"],
  ["motorista2", "Motorista 2"],
  ["permissionario", "Permissionário"],
];
const NOME = Object.fromEntries(CATS);
const MES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const rot = (m) => (m ? `${MES[+m.slice(5) - 1]}/${m.slice(2, 4)}` : "");
const brl = (v) => (v == null ? "—" : (v < 0 ? "− " : "") + "R$ " + fmt(Math.abs(v)));
const numero = (s) => { const t = String(s).replace(/[R$\s]/g, ""); const n = parseFloat(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t); return Number.isFinite(n) ? n : null; };
const VAZIO = { motorista1: [], motorista2: [], permissionario: [] };

async function rsApi(caminho, opcoes = {}, comoArquivo = false) {
  let token = "";
  try { token = sessionStorage.getItem(CHAVE_TOKEN) || ""; } catch {}
  const r = await autFetch(API + "/resumos" + caminho, { ...opcoes, headers: { ...(opcoes.headers || {}), "X-Raiox-Token": token } });
  if (r.status === 403) window.dispatchEvent(new Event("raiox-403"));
  if (!r.ok) { const c = await r.json().catch(() => ({})); throw new Error(typeof c.detail === "string" ? c.detail : "Erro no servidor"); }
  return comoArquivo ? r : r.json();
}
const json = (corpo, metodo = "POST") => ({ method: metodo, headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
const comArquivos = (lista, campo = "arquivos", extra = {}) => {
  const f = new FormData();
  lista.forEach((a) => f.append(campo, a));
  Object.entries(extra).forEach(([k, v]) => f.append(k, v));
  return { method: "POST", body: f };
};

// ---------------------------------------------------------------- relatórios
function Relatorios({ custosVersao }) {
  const [arquivos, setArquivos] = useState([]);
  const [previa, setPrevia] = useState(null);
  const [ocupado, setOcupado] = useState("");
  const [erro, setErro] = useState("");
  const [formato, setFormato] = useState(() => { try { return localStorage.getItem("vagabs-resumos-formato") || "xlsx"; } catch { return "xlsx"; } });
  const escolher = (f) => { setFormato(f); try { localStorage.setItem("vagabs-resumos-formato", f); } catch {} };

  async function conferir(lista) {
    if (!lista.length) { setPrevia(null); return; }
    setOcupado("Conferindo…"); setErro("");
    try { setPrevia(await rsApi("/previa", comArquivos(lista))); } catch (x) { setErro(mensagemDeErro(x)); }
    setOcupado("");
  }
  useEffect(() => { conferir(arquivos); }, [arquivos, custosVersao]); // eslint-disable-line react-hooks/exhaustive-deps

  function juntar(novos) {
    setArquivos((a) => [...a.filter((x) => !novos.some((n) => n.name === x.name)), ...novos]);
  }
  async function baixar() {
    setOcupado("Gerando planilhas…"); setErro("");
    try {
      const r = await rsApi("/gerar", comArquivos(arquivos, "arquivos", { formato }), true);
      const nome = /filename="([^"]+)"/.exec(r.headers.get("Content-Disposition") || "")?.[1] || "relatorios.zip";
      const url = URL.createObjectURL(await r.blob());
      const a = Object.assign(document.createElement("a"), { href: url, download: nome });
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (x) { setErro(mensagemDeErro(x)); }
    setOcupado("");
  }

  const meses = previa?.meses || [];
  const faltando = meses.filter((m) => CATS.some(([c]) => m[c] == null)).length;
  return (
    <section className="painel">
      <div className="painel-cab"><h2>Relatórios do sistema</h2>
        <p>Envie um ou vários "Relatório geral" (.xlsx, um por mês). Cada um volta tratado, com valores em número e as contas no fim, e junto vem uma planilha de resumo com todos os meses.</p></div>
      <Soltar rotulo="Escolha os relatórios" multiplo aoEscolher={juntar} arquivo={null} />
      {arquivos.length > 0 && (
        <div className="rs-arquivos">
          {arquivos.map((a) => (
            <span key={a.name} className="chip">{a.name}
              <button type="button" aria-label={"Tirar " + a.name} onClick={() => setArquivos((l) => l.filter((x) => x !== a))}>×</button></span>))}
          <button type="button" className="btn leve" onClick={() => setArquivos([])}>Limpar</button>
        </div>)}
      {erro && <div className="faixa-erro" role="alert">{erro}</div>}
      {(previa?.erros || []).map((e) => <div key={e} className="faixa-erro" role="alert">{e}</div>)}

      {meses.length > 0 && (<>
        <div className="rx-kpis rs-kpis">
          <div className="rx-kpi"><span className="rx-kpi-l">Meses</span><span className="rx-kpi-v num">{meses.length}</span><span className="mudo">{rot(meses[0].id)}{meses.length > 1 && " a " + rot(meses.at(-1).id)}</span></div>
          <div className={"rx-kpi " + (previa.saldoTotal < 0 ? "ruim" : "bom")}><span className="rx-kpi-l">Saldo do período</span><span className={"rx-kpi-v num " + (previa.saldoTotal < 0 ? "neg" : "")}>{brl(previa.saldoTotal)}</span><span className="mudo">Soma dos saldos dos meses</span></div>
          <div className={"rx-kpi " + (faltando ? "ruim" : "")}><span className="rx-kpi-l">Custos faltando</span><span className="rx-kpi-v num">{faltando}</span><span className="mudo">{faltando ? "Mês sem valor conta como 0" : "Todos os meses cobertos"}</span></div>
        </div>
        <div className="tabela-rolo"><table className="tabela rs-tabela">
          <thead><tr><th>Mês</th><th className="d">Créditos</th><th className="d">Débitos</th><th className="d">Sub saldo</th>
            {CATS.map(([c, n]) => <th key={c} className="d">{n}</th>)}<th className="d">Saldo</th></tr></thead>
          <tbody>{meses.map((m, i) => (
            <tr key={i}>
              <td><b>{m.rotulo}</b><small>{m.arquivo} · {m.lancamentos} lanç.</small>{m.avisos.map((a) => <small key={a} className="obs">{a}</small>)}</td>
              <td className="num">{brl(m.credito)}</td><td className="num">{brl(m.debito)}</td>
              <td className={"num " + (m.subSaldo < 0 ? "rs-neg" : "")}>{brl(m.subSaldo)}</td>
              {CATS.map(([c]) => <td key={c} className={"num " + (m[c] == null ? "rs-falta" : "")}>{m[c] == null ? "faltando" : brl(-m[c])}</td>)}
              <td className={"num rs-saldo " + (m.saldo < 0 ? "rs-neg" : "rs-pos")}>{brl(m.saldo)}</td>
            </tr>))}</tbody>
        </table></div>
      </>)}
      <div className="form-rodape">
        <div className="rs-formato" role="radiogroup" aria-label="Formato da exportação">
          {[["xlsx", "Planilha"], ["pdf", "PDF"], ["ambos", "Os dois"]].map(([f, n]) => (
            <button key={f} type="button" role="radio" aria-checked={formato === f} className={formato === f ? "ativo" : ""} onClick={() => escolher(f)}>{n}</button>))}
        </div>
        <button type="button" className="btn primario grande" disabled={!meses.length || !!ocupado} onClick={baixar}><Baixar />Baixar {meses.length > 1 ? `${meses.length} meses` : "mês"} + resumo (.zip)</button>
        {ocupado && <span className="mudo">{ocupado}</span>}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- custos fixos
function Categoria({ cat, faixas, aoMudar }) {
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [valor, setValor] = useState("");
  const ordem = faixas.map((f, i) => ({ ...f, i })).sort((a, b) => a.de.localeCompare(b.de));
  const v = numero(valor);
  function add(e) {
    e.preventDefault();
    if (!de || v == null) return;
    aoMudar([...faixas, { de, ate: ate || null, valor: v }]);
    setDe(""); setAte(""); setValor("");
  }
  return (
    <div className="rs-cat">
      <h3>{NOME[cat]}</h3>
      {ordem.length ? (
        <ul className="rs-faixas">{ordem.map((f) => (
          <li key={f.i}><span>{rot(f.de)}{f.ate !== f.de && <> → {f.ate ? rot(f.ate) : "em diante"}</>}</span><b className="num">{brl(f.valor)}</b>
            <button type="button" className="btn leve" aria-label="Apagar faixa" onClick={() => aoMudar(faixas.filter((_, j) => j !== f.i))}><Lixo /></button></li>))}
        </ul>) : <p className="mudo">Nenhum valor cadastrado.</p>}
      <form className="rs-add" onSubmit={add}>
        <label>De<input type="month" value={de} onChange={(e) => setDe(e.target.value)} required /></label>
        <label>Até<input type="month" value={ate} min={de} onChange={(e) => setAte(e.target.value)} placeholder="em diante" /></label>
        <label>Valor<input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="3.514,73" required /></label>
        <button type="submit" className="btn" disabled={!de || v == null} title="Até vazio = vale daqui em diante"><Mais />Adicionar</button>
      </form>
    </div>
  );
}

function Importar({ aoAplicar }) {
  const [cat, setCat] = useState("auto");
  const [texto, setTexto] = useState("");
  const [lido, setLido] = useState(null);
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);
  async function ler(promessa) {
    setOcupado(true); setErro(""); setLido(null);
    try { setLido(await promessa); } catch (x) { setErro(mensagemDeErro(x)); }
    setOcupado(false);
  }
  const total = lido ? CATS.reduce((s, [c]) => s + lido.faixas[c].length, 0) : 0;
  return (
    <div className="rs-importar">
      <div className="rx-cab"><div><h3>Importar de uma vez</h3>
        <p className="mudo">Cole as mensagens do WhatsApp (ex.: "Abril 2025 a março 2026 3.350,00") ou envie uma planilha com linhas como "3350,00 - 01/25". Linhas com "Permissionário" ou "Motorista 1" mudam de quem são os valores seguintes.</p></div>
        <label className="rs-de-quem">De quem são os valores?
          <select value={cat} onChange={(e) => setCat(e.target.value)}>
            <option value="auto">Descobrir pelo texto / cabeçalho</option>
            <option value="permissionario">Permissionário</option>
            <option value="motoristas">Os dois motoristas</option>
            <option value="motorista1">Motorista 1</option>
            <option value="motorista2">Motorista 2</option>
          </select></label></div>
      <textarea rows={6} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder={"Permissionário\nJaneiro a março 3.050,00\nAbril 2025 a março 2026 3.350,00\nAbril 2026 a julho 2026 3.850,00\nAgosto e setembro 2026 4.084,00\nA partir de outubro 2026 4.084,00"} />
      <div className="rs-linha">
        <button type="button" className="btn" disabled={!texto.trim() || ocupado} onClick={() => ler(rsApi("/custos/texto", json({ texto, categoria: cat })))}>Ler texto</button>
        <span className="mudo">ou</span>
        <div className="rs-soltar-mini"><Soltar rotulo="Enviar planilha de valores" aoEscolher={(f) => ler(rsApi("/custos/planilha", comArquivos([f], "arquivo", { categoria: cat })))} arquivo={null} /></div>
      </div>
      {erro && <div className="faixa-erro" role="alert">{erro}</div>}
      {lido && (
        <div className="rx-previa rs-lido">
          <div className="rs-lido-corpo">
            <b>{total ? `Encontrei ${total} valor(es):` : "Não encontrei nenhum valor com mês."}</b>
            {CATS.filter(([c]) => lido.faixas[c].length).map(([c, n]) => (
              <p key={c}><b>{n}:</b> {lido.faixas[c].map((f) => `${rot(f.de)}${f.ate !== f.de ? "–" + (f.ate ? rot(f.ate) : "…") : ""} ${brl(f.valor)}`).join(" · ")}</p>))}
            {lido.semCategoria.length > 0 && <p className="rs-falta">Sem dono (escolha "De quem são os valores?"): {lido.semCategoria.join(" | ")}</p>}
            {lido.ignoradas.length > 0 && <p className="mudo">Linhas ignoradas: {lido.ignoradas.join(" | ")}</p>}
          </div>
          {total > 0 && <>
            <button type="button" className="btn primario" onClick={() => { aoAplicar(lido.faixas, false); setLido(null); setTexto(""); }}>Adicionar</button>
            <button type="button" className="btn" title="Apaga o que já existe nas categorias acima e fica só com estes" onClick={() => { aoAplicar(lido.faixas, true); setLido(null); setTexto(""); }}>Substituir</button></>}
          <button type="button" className="btn leve" aria-label="Descartar" onClick={() => setLido(null)}><Fechar /></button>
        </div>)}
    </div>
  );
}

function Custos({ custos, salvar, msg }) {
  function aplicar(novas, substituir) {
    const r = { ...custos };
    CATS.forEach(([c]) => { if (novas[c].length) r[c] = substituir ? novas[c] : [...custos[c], ...novas[c]]; });
    salvar(r);
  }
  return (
    <section className="painel">
      <div className="painel-cab"><h2>Custos fixos: motoristas e permissionário</h2>
        <p>Valores por faixa de meses, guardados no sistema. Se duas faixas cobrem o mesmo mês, vale a última adicionada. "Até" vazio quer dizer "daqui em diante".</p></div>
      <div className="rs-cats">{CATS.map(([c]) => <Categoria key={c} cat={c} faixas={custos[c]} aoMudar={(l) => salvar({ ...custos, [c]: l })} />)}</div>
      <Importar aoAplicar={aplicar} />
      {msg && <p className={"msg " + (msg.ruim ? "ruim" : "ok")} role="status">{msg.t}</p>}
    </section>
  );
}

export default function Resumos() {
  const [custos, setCustos] = useState(VAZIO);
  const [versao, setVersao] = useState(0);
  const [msg, setMsg] = useState(null);
  useEffect(() => { rsApi("/custos").then(setCustos).catch((x) => setMsg({ t: mensagemDeErro(x), ruim: true })); }, []);
  async function salvar(novo) {
    const antes = custos;
    setCustos(novo); setMsg({ t: "Salvando…" });
    try { setCustos(await rsApi("/custos", json(novo, "PUT"))); setVersao((v) => v + 1); setMsg({ t: "Custos salvos." }); }
    catch (x) { setCustos(antes); setMsg({ t: mensagemDeErro(x), ruim: true }); }
  }
  return (
    <div className="rs">
      <Relatorios custosVersao={versao} />
      <Custos custos={custos} salvar={salvar} msg={msg} />
    </div>
  );
}
