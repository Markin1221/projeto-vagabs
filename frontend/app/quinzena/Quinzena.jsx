"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Dica from "../ui/Dica";
import Soltar from "../ui/Soltar";
import Modal from "../ui/Modal";
import QArquivo from "./QArquivo";
import { Regras, Linhas } from "./Cadastros";
import { Baixar } from "../ui/Icones";
import { API, api, autFetch } from "../lib";

const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const GRUPOS = ["Interbairros", "Alimentadora", "Intermunicipal"];
let seq = 0;

// Quinzena paga agora: até o dia 15 é a 2ª do mês anterior; depois, a 1ª do mês atual
function quinzenaPadrao(hoje = new Date()) {
  if (hoje.getDate() <= 15) { const d = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1); return { q: 2, mes: d.getMonth() + 1, ano: d.getFullYear() }; }
  return { q: 1, mes: hoje.getMonth() + 1, ano: hoje.getFullYear() };
}
const hojeISO = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };

export default function Quinzena() {
  const padrao = useMemo(() => quinzenaPadrao(), []);
  const [qz, setQz] = useState(padrao.q);
  const [mes, setMes] = useState(padrao.mes);
  const [ano, setAno] = useState(padrao.ano);
  const [obs, setObs] = useState("");
  const [obsEditada, setObsEditada] = useState(false);
  const [data, setData] = useState(hojeISO());
  const [conta, setConta] = useState("");
  const [cfg, setCfg] = useState(null);
  const [linhasCad, setLinhasCad] = useState({ linhas: [], especiais: [] });
  const [regras, setRegras] = useState([]);
  const [files, setFiles] = useState([]);          // [{id, file, grupo, credito, deposito}]
  const [res, setRes] = useState({});
  const [checando, setChecando] = useState(false);
  const [abertos, setAbertos] = useState(new Set());
  const [zeradas, setZeradas] = useState(false);
  const [formato, setFormato] = useState("xlsx");
  const [versao, setVersao] = useState(0);
  const [erro, setErro] = useState("");
  const [gerando, setGerando] = useState(false);
  const [carros, setCarros] = useState(null);       // modal: {nome, valor, por_carro}
  const req = useRef(0);
  const jaAbertos = useRef(new Set());

  const observacao = obsEditada ? obs : `${qz}° Quinzena de ${MESES[mes - 1]} ${ano}`;

  const carregar = useCallback(async () => {
    try {
      const [c, l, r] = await Promise.all([api("/quinzena/config"), api("/quinzena/linhas"), api("/quinzena/regras")]);
      setCfg(c); setLinhasCad(l); setRegras(r); setConta((x) => x || c.conta_quinzena); setErro("");
    } catch (x) { setErro(`Não consegui falar com a API: ${x.message}`); }
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  useEffect(() => {
    if (!files.length) { setRes({}); setChecando(false); return; }
    const meu = ++req.current, ids = files.map((f) => f.id);
    setChecando(true);
    const fd = new FormData();
    files.forEach((f) => { fd.append("arquivos", f.file); fd.append("grupos", f.grupo || ""); fd.append("creditos", f.credito || ""); });
    fd.append("data", data); fd.append("observacao", observacao); if (conta) fd.append("conta", conta);
    fd.append("incluir_zeradas", zeradas ? "true" : "false");
    const t = setTimeout(() => {
      autFetch(API + "/quinzena/processar", { method: "POST", body: fd })
        .then(async (r) => { const c = await r.json().catch(() => ({})); if (!r.ok) throw new Error(typeof c.detail === "string" ? c.detail : "Erro ao ler os relatórios"); return c; })
        .then((c) => {
          if (meu !== req.current) return;
          const novo = Object.fromEntries(c.arquivos.map((a, i) => [ids[i], a]));
          setRes(novo); setChecando(false);
          setAbertos((s) => { const x = new Set(s); ids.forEach((id) => { if (novo[id] && !jaAbertos.current.has(id)) x.add(id); jaAbertos.current.add(id); }); return x; });
        })
        .catch((x) => { if (meu === req.current) { setChecando(false); setErro(x.message); } });
    }, 250);
    return () => clearTimeout(t);
  }, [files, data, observacao, conta, zeradas, versao]);

  const reprocessar = () => setVersao((v) => v + 1);
  const atualizar = (id, campo, valor) => setFiles((fs) => fs.map((f) => (f.id === id ? { ...f, [campo]: valor } : f)));
  const adicionar = (lista) => { setErro(""); setFiles((fs) => [...fs, ...lista.map((file) => ({ id: ++seq, file, grupo: "", credito: "", deposito: "" }))]); };

  async function criarRegra(padrao, linha) {
    await api("/quinzena/regras", { method: "POST", body: JSON.stringify({ padrao, linha }) });
    await carregar(); reprocessar();
  }

  const problemas = files.reduce((n, f) => n + (res[f.id]?.problemas?.length || 0), 0);
  const bloqueio = !files.length ? "Envie ao menos um relatório." : checando || files.some((f) => !res[f.id]) ? "Conferindo os relatórios…"
    : problemas ? `Resolva ${problemas} ${problemas === 1 ? "problema" : "problemas"} para gerar.` : !data ? "Informe a data do lançamento." : "";

  async function gerar() {
    setGerando(true); setErro("");
    try {
      const fd = new FormData();
      files.forEach((f) => { fd.append("arquivos", f.file); fd.append("grupos", f.grupo || ""); fd.append("creditos", f.credito || ""); });
      fd.append("data", data); fd.append("observacao", observacao); if (conta) fd.append("conta", conta);
      fd.append("incluir_zeradas", zeradas ? "true" : "false"); fd.append("formato", formato);
      const r = await autFetch(API + "/quinzena/gerar", { method: "POST", body: fd });
      if (!r.ok) { const c = await r.json().catch(() => ({})); throw new Error(c.detail || "Erro ao gerar os lançamentos"); }
      const nome = (r.headers.get("content-disposition") || "").match(/filename="(.+)"/)?.[1] || `lancamentos_quinzena.${files.length > 1 ? "zip" : formato}`;
      const a = document.createElement("a"); a.href = URL.createObjectURL(await r.blob()); a.download = nome; a.click();
    } catch (x) { setErro(x.message); }
    setGerando(false);
  }

  const opcoesLinha = [...linhasCad.linhas.map((l) => ({ codigo: l.codigo, nome: l.descricao })), ...linhasCad.especiais.map((l) => ({ codigo: l.codigo, nome: l.descricao }))];

  return (
    <>
      {erro && <div className="faixa-erro" role="alert">{erro}</div>}
      <Dica passos={[
        "Confira a quinzena, a data do lançamento e a conta. A observação é montada sozinha, mas dá para editar.",
        "Envie o relatório de remuneração de cada grupo (Interbairros, Alimentadora, Intermunicipal), em Excel. O grupo é reconhecido pelo nome do arquivo.",
        "Cada evento do relatório vai para uma linha do lançamento pelas regras. Toque numa linha para ver os eventos que a formam e num evento para ver o valor de cada carro.",
        "Se aparecer um evento sem regra, escolha a linha dele: a regra fica salva para as próximas quinzenas.",
        "Compare o total da quinzena com o depósito no banco e clique em Gerar lançamentos."]} />

      <section className="painel">
        <div className="painel-cab"><h2>Dados da quinzena</h2><p>Valem para todas as linhas do lançamento.</p></div>
        <div className="grade-form">
          <label>Quinzena<select value={qz} onChange={(e) => { setQz(Number(e.target.value)); setObsEditada(false); }}><option value={1}>1ª quinzena</option><option value={2}>2ª quinzena</option></select></label>
          <label>Mês<select value={mes} onChange={(e) => { setMes(Number(e.target.value)); setObsEditada(false); }}>{MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select></label>
          <label>Ano<input inputMode="numeric" value={ano} onChange={(e) => { setAno(e.target.value.replace(/\D/g, "").slice(0, 4)); setObsEditada(false); }} /></label>
          <label>Data do lançamento<input type="date" value={data} onChange={(e) => setData(e.target.value)} /></label>
          <label className="duas">Observação<input value={observacao} onChange={(e) => { setObs(e.target.value); setObsEditada(true); }} /></label>
          <label>Conta<input value={conta} onChange={(e) => setConta(e.target.value)} /></label>
        </div>
      </section>

      <section className="painel">
        <div className="painel-cab"><h2>Relatórios de remuneração</h2><p>Um arquivo por grupo. Cada relatório é conferido assim que chega.</p></div>
        <Soltar rotulo="Escolha os relatórios (.xlsx)" multiplo aoEscolher={adicionar} />
        {files.length > 0 && (
          <div className="arquivos">
            {files.map((f) => (
              <QArquivo key={f.id} f={f} r={res[f.id]} aberto={abertos.has(f.id)} grupos={GRUPOS} opcoesLinha={opcoesLinha}
                aoAlternar={() => setAbertos((s) => { const x = new Set(s); x.has(f.id) ? x.delete(f.id) : x.add(f.id); return x; })}
                aoRemover={() => setFiles((fs) => fs.filter((x) => x.id !== f.id))}
                aoMudar={(campo, v) => atualizar(f.id, campo, v)} aoCriarRegra={criarRegra} aoVerCarros={setCarros} />))}
          </div>)}
        <div className="gerar">
          <label className="marca"><input type="checkbox" checked={zeradas} onChange={(e) => setZeradas(e.target.checked)} />Incluir linhas com valor zero</label>
          <label className="formato">Formato
            <select value={formato} onChange={(e) => setFormato(e.target.value)}><option value="xlsx">Excel (.xlsx)</option><option value="csv">CSV (.csv)</option></select>
          </label>
          <span style={{ flex: 1 }} />
          {bloqueio && <p className="gerar-msg" role="status">{bloqueio}</p>}
          <button type="button" className="btn primario grande" disabled={!!bloqueio || gerando} onClick={gerar}>
            <Baixar />{gerando ? "Gerando…" : files.length > 1 ? `Gerar ${files.length} lançamentos (ZIP)` : "Gerar lançamentos"}
          </button>
        </div>
      </section>

      <Regras regras={regras} opcoesLinha={opcoesLinha} aoMudar={async () => { await carregar(); reprocessar(); }} />
      <Linhas linhasCad={linhasCad} cfg={cfg} aoSalvarCfg={async (c) => { await api("/quinzena/config", { method: "PUT", body: JSON.stringify(c) }); setConta(c.conta_quinzena); await carregar(); reprocessar(); }} />

      {carros && (
        <Modal titulo={carros.nome} subtitulo={`${carros.por_carro.length} carro(s) · total ${carros.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`} onClose={() => setCarros(null)}>
          {carros.por_carro.length ? (
            <div className="tabela-rolo alto"><table className="tabela">
              <thead><tr><th>Carro (prefixo)</th><th className="d">Valor</th></tr></thead>
              <tbody>{carros.por_carro.map((c) => <tr key={c.prefixo}><td>{c.prefixo}</td><td className="d num">{c.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td></tr>)}</tbody>
            </table></div>) : <p className="vazio">Este valor é calculado; não vem de um evento por carro.</p>}
        </Modal>)}
    </>
  );
}
