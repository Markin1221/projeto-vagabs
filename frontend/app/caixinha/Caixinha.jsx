"use client";
import { useEffect, useState } from "react";
import Dica from "../ui/Dica";
import Soltar from "../ui/Soltar";
import { Baixar, Alerta, Ok, Lapis } from "../ui/Icones";
import { RegrasCaixinha, ModalRegra } from "./Regras";
import { API, api, fmt, data, autFetch, mensagemDeErro } from "../lib";
import "./caixinha.css";

const hoje = () => new Date().toISOString().slice(0, 10);
const item3 = (c) => (c < 100 ? `*${String(c).padStart(3, "0")}` : String(c));
const numItem = (s) => (s ? Number(String(s).replace("*", "")) : "");

// Uma descrição sem regra: formulário na própria caixa vermelha (como na Quinzena). "Salvar regra" grava para os
// próximos meses; "Só desta vez" classifica só nesta planilha, sem criar regra.
function Pendente({ desc, linhas, centros, itens, aoSalvar, aoManual }) {
  const [f, setF] = useState({ kw: desc, titulo: desc, centro: "ADM01", item: "" });
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const muda = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const total = linhas.reduce((t, l) => t + l.valor, 0);
  async function salvar() {
    setSalvando(true); setErro("");
    try { await api("/caixinha/regras", { method: "POST", body: JSON.stringify({ ...f, item: Number(f.item), tipo: null }) }); await aoSalvar(); }
    catch (x) { setErro(mensagemDeErro(x)); setSalvando(false); }
  }
  if (!desc) return (
    <div className="problema"><div className="problema-txt"><b>Linha sem descrição</b>
      <p>{linhas.length} linha(s) com valor e sem descrição (R$ {fmt(total)}). Preencha a descrição na planilha e envie de novo.</p></div></div>);
  return (
    <div className="problema">
      <div className="problema-txt"><b>Sem regra: “{desc}”</b>
        <p>{linhas.length} linha(s) · R$ {fmt(total)}. Salve a regra para os próximos meses ou use só desta vez.</p></div>
      <div className="cx-form">
        <label>Quando a descrição contiver<input value={f.kw} onChange={muda("kw")} /></label>
        <label>Título no CSV<input value={f.titulo} onChange={muda("titulo")} /></label>
        <label>Centro de custo<select value={f.centro} onChange={muda("centro")}>
          {centros.map((c) => <option key={c.codigo} value={c.codigo}>{c.codigo} · {c.nome}</option>)}</select></label>
        <label>Item de despesa<select value={f.item} onChange={muda("item")}>
          <option value="">Escolha…</option>{itens.map((i) => <option key={i.codigo} value={i.codigo}>{item3(i.codigo)} · {i.nome}</option>)}</select></label>
        <button type="button" className="btn primario" disabled={salvando || !f.kw.trim() || !f.titulo.trim() || !f.item} onClick={salvar}>
          {salvando ? "Salvando…" : "Salvar regra"}</button>
        <button type="button" className="btn" disabled={salvando || !f.titulo.trim() || !f.item} title="Usa esta classificação só nesta planilha, sem criar regra"
          onClick={() => aoManual({ descricao: desc, titulo: f.titulo.trim(), centro: f.centro, item: Number(f.item) })}>Só desta vez</button>
      </div>
      {erro && <p className="msg ruim">{erro}</p>}
    </div>
  );
}

export default function Caixinha() {
  const [arquivo, setArquivo] = useState(null);
  const [dataLanc, setDataLanc] = useState(hoje());
  const [daLinha, setDaLinha] = useState(false);
  const [res, setRes] = useState(null);
  const [erro, setErro] = useState("");
  const [lendo, setLendo] = useState(false);
  const [mesAtivo, setMesAtivo] = useState(0);
  const [centros, setCentros] = useState([]);
  const [itens, setItens] = useState([]);
  const [regras, setRegras] = useState([]);
  const [fixas, setFixas] = useState([]);
  const [edit, setEdit] = useState(null);
  const [manuais, setManuais] = useState({}); // {descrição: {descricao, titulo, centro, item, tipo}} só desta planilha

  const carregarRegras = () => api("/caixinha/regras").then(setRegras).catch(() => {});
  useEffect(() => {
    api("/centros-custo").then(setCentros).catch(() => {});
    api("/itens-despesa").then(setItens).catch(() => {});
    api("/caixinha/regras-fixas").then(setFixas).catch(() => {});
    carregarRegras();
  }, []);
  // depois de salvar/editar/excluir regra: recarrega a lista e, se já tem planilha lida, processa de novo
  const aoMudarRegras = async () => { await carregarRegras(); if (res) await gerar(); };

  const dados = (m = manuais) => { const fd = new FormData(); fd.append("arquivo", arquivo); fd.append("data_lancamento", dataLanc); fd.append("data_da_linha", String(daLinha));
    fd.append("manuais", JSON.stringify(Object.values(m))); return fd; };

  async function gerar(m = manuais) {
    setLendo(true); setErro("");
    try {
      const r = await autFetch(API + "/caixinha/processar", { method: "POST", body: dados(m) });
      const c = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(typeof c.detail === "string" ? c.detail : "Erro ao ler a planilha");
      if (!Array.isArray(c.meses)) throw new Error("A API respondeu num formato antigo. Reinicie o backend e tente de novo.");
      setRes(c); setMesAtivo((m) => Math.max(0, Math.min(m, c.meses.length - 1)));
    } catch (x) { setErro(mensagemDeErro(x)); setRes(null); }
    setLendo(false);
  }
  async function baixarModelo() {
    setErro("");
    try {
      const r = await autFetch(API + "/caixinha/modelo");
      if (!r.ok) throw new Error("Não consegui baixar o modelo");
      const a = document.createElement("a"); a.href = URL.createObjectURL(await r.blob()); a.download = "modelo_caixinha.xlsx"; a.click();
    } catch (x) { setErro(mensagemDeErro(x)); }
  }
  async function baixar() {
    setErro("");
    const r = await autFetch(API + "/caixinha/csv", { method: "POST", body: dados() });
    if (!r.ok) { const c = await r.json().catch(() => ({})); setErro(typeof c.detail === "string" ? c.detail : "Erro ao gerar o CSV"); return; }
    const nome = /filename="([^"]+)"/.exec(r.headers.get("Content-Disposition") || "")?.[1] || "caixinha.csv";
    const a = document.createElement("a"); a.href = URL.createObjectURL(await r.blob()); a.download = nome; a.click();
  }
  // classificação só desta planilha (sem regra): guarda na tela e processa de novo
  const usarManual = (m) => { const novo = { ...manuais, [m.descricao]: m }; setManuais(novo); setEdit(null); gerar(novo); };
  const tirarManual = (desc) => { const novo = { ...manuais }; delete novo[desc]; setManuais(novo); gerar(novo); };
  // corrigir uma linha já classificada: abre a regra com os valores atuais e a descrição como palavra-chave
  const corrigir = (l) => setEdit({ desc: l.origem, kw: l.origem, titulo: (l.titulo || l.origem).replace(/ \d{2}$/, ""), centro: l.codigo_centro_de_custo || "ADM01",
    item: numItem(l.codigo_item_despesa), tipo: "" });

  const pend = res?.pendentes || [];
  const meses = res?.meses || [];
  const varios = meses.length > 1;
  const todas = meses.flatMap((m) => m.linhas || []);
  const mes = meses[mesAtivo];
  const deb = todas.filter((l) => l.tipo_lancamento === "DEBITO").reduce((t, l) => t + l.valor, 0);
  const cred = todas.filter((l) => l.tipo_lancamento === "CREDITO").reduce((t, l) => t + l.valor, 0);

  return (
    <>
      <Dica passos={[
        "Envie a planilha da caixinha (.xlsx): um mês ou vários lado a lado (Data, Saldo, Crédito, Débito, Descrição).",
        "Escolha a data dos lançamentos. Com vários meses, cada um usa a última data dele (ou a escolhida, se não tiver datas).",
        "Clique em Gerar. Títulos repetidos ganham 01, 02… para o sistema aceitar.",
        "O que não for reconhecido aparece em vermelho: preencha e salve a regra. Algo saiu errado? Clique no lápis da linha para corrigir.",
        "Com tudo classificado, baixe: um mês sai em CSV, vários saem num .zip com um CSV por mês."]} />

      <section className="painel">
        <div className="cx-cab">
          <div><h2>Caixinha</h2><p>Transforme a planilha da caixinha no CSV de importação.</p></div>
          <button type="button" className="btn" onClick={baixarModelo} title="Planilha em branco no formato que o sistema lê"><Baixar />Baixar modelo</button>
        </div>
        {erro && <div className="faixa-erro" role="alert" style={{ marginBottom: 14 }}>{erro}</div>}
        <Soltar rotulo="Escolha a planilha da caixinha" arquivo={arquivo} aoEscolher={(f) => { setArquivo(f); setRes(null); setManuais({}); }} />
        <div className="cx-config">
          <label className="cx-data">Data dos lançamentos
            <input type="date" value={dataLanc} onChange={(e) => setDataLanc(e.target.value)} /></label>
          <label className="marca cx-marca"><input type="checkbox" checked={daLinha} onChange={(e) => setDaLinha(e.target.checked)} />
            Usar a data de cada linha quando a planilha tiver</label>
        </div>
        <div className="gerar">
          {!arquivo && <p className="gerar-msg">Envie a planilha para gerar.</p>}
          <span style={{ flex: 1 }} />
          <button type="button" className="btn primario grande" disabled={!arquivo || !dataLanc || lendo} onClick={() => gerar()}>{lendo ? "Lendo…" : res ? "Gerar de novo" : "Gerar"}</button>
        </div>
      </section>

      {res && (
        <div className="cx-resumo">
          <div><span>{varios ? "Meses" : "Linhas"}</span><b>{varios ? meses.length : todas.length}</b>{varios && <small>{todas.length} linhas</small>}</div>
          <div><span>Débitos</span><b>R$ {fmt(deb)}</b></div>
          <div><span>Créditos</span><b>R$ {fmt(cred)}</b></div>
          <div className={pend.length ? "ruim" : "ok"}><span>Para classificar</span><b>{pend.length || <Ok />}</b>
            <small>{pend.length ? "o download fica travado" : "pronto para baixar"}</small></div>
        </div>)}

      {pend.length > 0 && (
        <div className="problemas" role="alert">
          <h3>{pend.length === 1 ? "1 descrição não foi reconhecida" : `${pend.length} descrições não foram reconhecidas`} — preencha para liberar o download</h3>
          {pend.map((d) => <Pendente key={d || "(vazia)"} desc={d} linhas={todas.filter((l) => l.revisar && l.origem === d)}
            centros={centros} itens={itens} aoSalvar={aoMudarRegras} aoManual={usarManual} />)}
        </div>)}

      {mes && (
        <section className="painel">
          <div className="cx-cab">
            <div><h2>Lançamentos</h2>
              <p>{varios ? <>{mes.rotulo} · lançado em {data(mes.data_lancamento)} · <code>{mes.nome}</code></> : `${mes.linhas.length} linhas · lançado em ${data(mes.data_lancamento)}`}</p></div>
            <button type="button" className="btn primario" disabled={pend.length > 0} onClick={baixar} title={pend.length ? "Classifique as linhas em vermelho primeiro" : ""}>
              <Baixar />{varios ? `Baixar ZIP · ${meses.length} CSVs` : "Baixar CSV"}</button>
          </div>
          {varios && (
            <div className="cx-meses" role="tablist">
              {meses.map((m, i) => (
                <button key={m.numero} type="button" role="tab" aria-selected={i === mesAtivo} className={(i === mesAtivo ? "ativa " : "") + (m.pendentes?.length ? "pend" : "")} onClick={() => setMesAtivo(i)}>
                  <b>#{m.numero}</b><span>{m.fim ? data(m.fim).slice(3) : "sem data"}</span>{m.pendentes?.length > 0 && <Alerta />}</button>))}
            </div>)}
          <div className="tabela-rolo alto cx-tabela"><table className="tabela">
            <thead><tr><th>Na planilha</th><th>Título no CSV</th><th>Tipo</th><th>Centro</th><th>Item</th><th className="d">Valor</th><th /></tr></thead>
            <tbody>{mes.linhas.map((l, i) => (
              <tr key={i} className={l.revisar ? "cx-revisar" : ""}>
                <td>{l.origem || <span className="mudo">sem descrição</span>}</td>
                <td>{l.titulo || <span className="cx-falta">não reconhecida</span>}
                  {l.manual && <span className="chip cx-manual" title="Classificado só nesta planilha, sem regra">só desta vez
                    <button type="button" aria-label={`Desfazer classificação manual de ${l.origem}`} onClick={() => tirarManual(Object.keys(manuais).find((k) => k.trim().toLowerCase() === l.origem.trim().toLowerCase()) ?? l.origem)}>×</button></span>}</td>
                <td><span className={"tipo " + (l.tipo_lancamento === "DEBITO" ? "deb" : "cred")}>{l.tipo_lancamento === "DEBITO" ? "Débito" : "Crédito"}</span></td>
                <td>{l.codigo_centro_de_custo || "—"}</td><td>{l.codigo_item_despesa || "—"}</td><td className="d num">{fmt(l.valor)}</td>
                <td className="acoes">{l.origem && <button type="button" className="icone" aria-label={`Corrigir ${l.origem}`} title="Corrigir: cria/atualiza a regra desta descrição" onClick={() => corrigir(l)}><Lapis /></button>}</td></tr>))}</tbody>
          </table></div>
        </section>)}

      <RegrasCaixinha regras={regras} fixas={fixas} centros={centros} itens={itens} aoMudar={aoMudarRegras} />
      {edit && <ModalRegra edit={edit} setEdit={setEdit} centros={centros} itens={itens} aoSalvar={aoMudarRegras}
        aoSoAgora={edit.desc ? (f) => usarManual({ descricao: edit.desc, titulo: f.titulo.trim(), centro: f.centro, item: Number(f.item), tipo: f.tipo || null }) : null} />}
    </>
  );
}
