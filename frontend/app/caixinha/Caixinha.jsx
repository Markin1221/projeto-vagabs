"use client";
import { useEffect, useState } from "react";
import Dica from "../ui/Dica";
import Soltar from "../ui/Soltar";
import { Baixar, Alerta, Ok, Lapis } from "../ui/Icones";
import { RegrasCaixinha, ModalRegra } from "./Regras";
import { API, api, fmt, data, autFetch, mensagemDeErro } from "../lib";

const hoje = () => new Date().toISOString().slice(0, 10);

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

  const carregarRegras = () => api("/caixinha/regras").then(setRegras).catch(() => {});
  useEffect(() => {
    api("/centros-custo").then(setCentros).catch(() => {});
    api("/itens-despesa").then(setItens).catch(() => {});
    api("/caixinha/regras-fixas").then(setFixas).catch(() => {});
    carregarRegras();
  }, []);
  // depois de salvar/editar/excluir regra: recarrega a lista e, se já tem planilha lida, processa de novo
  const aoMudarRegras = async () => { await carregarRegras(); if (res) await gerar(); };

  const dados = () => { const fd = new FormData(); fd.append("arquivo", arquivo); fd.append("data_lancamento", dataLanc); fd.append("data_da_linha", String(daLinha)); return fd; };

  async function gerar() {
    setLendo(true); setErro("");
    try {
      const r = await autFetch(API + "/caixinha/processar", { method: "POST", body: dados() });
      const c = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(typeof c.detail === "string" ? c.detail : "Erro ao ler a planilha");
      setRes(c); setMesAtivo((m) => Math.min(m, c.meses.length - 1));
    } catch (x) { setErro(mensagemDeErro(x)); setRes(null); }
    setLendo(false);
  }
  async function baixar() {
    const r = await autFetch(API + "/caixinha/csv", { method: "POST", body: dados() });
    if (!r.ok) { const c = await r.json().catch(() => ({})); setErro(typeof c.detail === "string" ? c.detail : "Erro ao gerar o CSV"); return; }
    const nome = /filename="([^"]+)"/.exec(r.headers.get("Content-Disposition") || "")?.[1] || "caixinha.csv";
    const a = document.createElement("a"); a.href = URL.createObjectURL(await r.blob()); a.download = nome; a.click();
  }
  const pend = res?.pendentes || [];
  const varios = res?.meses.length > 1;
  const todas = res ? res.meses.flatMap((m) => m.linhas) : [];
  const mes = res?.meses[mesAtivo];

  return (
    <>
      <Dica passos={[
        "Envie a planilha da caixinha (.xlsx): um mês ou vários lado a lado (Data, Saldo, Crédito, Débito, Descrição).",
        "Escolha a data dos lançamentos. Com vários meses, cada um usa a última data dele (ou a escolhida, se não tiver datas).",
        "Marque a opção se quiser usar a data de cada linha quando ela existir.",
        "Clique em Gerar. Títulos repetidos ganham 01, 02… para o sistema aceitar.",
        "Se alguma descrição não for reconhecida, clique em Classificar e salve a regra: nos próximos meses ela entra sozinha.",
        "Em Regras da caixinha você vê, edita e exclui as regras salvas.",
        "Com tudo classificado, clique em Baixar: um mês sai em CSV, vários saem num .zip com um CSV por mês."]} />
      <section className="painel">
        <div className="painel-cab"><h2>Caixinha</h2><p>Transforme a planilha da caixinha no CSV de importação.</p></div>
        {erro && <div className="faixa-erro" role="alert" style={{ marginBottom: 14 }}>{erro}</div>}
        <Soltar rotulo="Escolha a planilha da caixinha" arquivo={arquivo} aoEscolher={(f) => { setArquivo(f); setRes(null); }} />
        <div className="opcoes">
          <label className="marca">Data dos lançamentos <input type="date" value={dataLanc} onChange={(e) => setDataLanc(e.target.value)} /></label>
          <label className="marca"><input type="checkbox" checked={daLinha} onChange={(e) => setDaLinha(e.target.checked)} />Usar a data de cada linha quando a planilha tiver</label>
        </div>
        <div className="gerar">
          <span style={{ flex: 1 }} />
          <button type="button" className="btn primario grande" disabled={!arquivo || !dataLanc || lendo} onClick={gerar}>{lendo ? "Lendo…" : "Gerar"}</button>
        </div>
      </section>

      {res && pend.length > 0 && (
        <section className="painel">
          <div className="painel-cab"><h2>Não reconhecidas</h2><p>Classifique cada descrição. A regra fica salva e vale nos próximos meses.</p></div>
          <div className="faixa-erro" role="alert" style={{ marginBottom: 14 }}>
            {pend.length} descrição(ões) sem regra. O CSV só é liberado quando todas forem classificadas.</div>
          <div className="tabela-rolo"><table className="tabela">
            <thead><tr><th>Descrição na planilha</th><th className="d">Linhas</th><th className="d">Valor</th><th /></tr></thead>
            <tbody>{pend.map((d) => {
              const ls = todas.filter((l) => l.revisar && l.origem === d);
              return (
                <tr key={d || "(vazia)"}><td>{d || <span className="mudo">(sem descrição: preencha na planilha e envie de novo)</span>}</td>
                  <td className="d num">{ls.length}</td><td className="d num">{fmt(ls.reduce((t, l) => t + l.valor, 0))}</td>
                  <td className="acoes">{d && <button type="button" className="btn" onClick={() => setEdit({ kw: d, titulo: d, centro: "ADM01", item: "", tipo: "" })}><Lapis />Classificar</button>}</td></tr>);
            })}</tbody>
          </table></div>
        </section>)}

      {res && mes && (
        <section className="painel">
          <div className="painel-cab"><h2>Lançamentos</h2>
            <p>{varios ? `${res.meses.length} meses na planilha · ${todas.length} linhas` : `${mes.linhas.length} linhas · débitos R$ ${fmt(mes.total_debitos)}${mes.total_creditos ? ` · créditos R$ ${fmt(mes.total_creditos)}` : ""}`}</p></div>
          {!pend.length && <p className="aviso ok-aviso"><Ok />Todas as linhas classificadas.</p>}
          <div className="abas" role="tablist" style={{ flexWrap: "wrap" }}>
            {varios && res.meses.map((m, i) => (
              <button key={m.numero} type="button" role="tab" aria-selected={i === mesAtivo} className={i === mesAtivo ? "ativa" : ""} onClick={() => setMesAtivo(i)}>
                {m.rotulo.replace("Caixinha ", "#")}{m.pendentes.length > 0 && <> <Alerta /></>}</button>))}
            <span style={{ flex: 1 }} />
            <button type="button" className="btn" disabled={pend.length > 0} onClick={baixar}><Baixar />{varios ? `Baixar ZIP (${res.meses.length} CSVs)` : "Baixar CSV"}</button></div>
          {varios && <p className="contagem" style={{ margin: "8px 0" }}>
            {mes.rotulo} · lançado em {data(mes.data_lancamento)} · débitos R$ {fmt(mes.total_debitos)}{mes.total_creditos ? ` · créditos R$ ${fmt(mes.total_creditos)}` : ""} · arquivo {mes.nome}</p>}
          <div className="tabela-rolo alto"><table className="tabela">
            <thead><tr><th>Na planilha</th><th>Título</th><th>Tipo</th><th>Centro</th><th>Item</th><th className="d">Valor</th></tr></thead>
            <tbody>{mes.linhas.map((l, i) => (
              <tr key={i} style={l.revisar ? { background: "rgba(220,50,50,.12)" } : undefined}>
                <td>{l.origem || "—"}</td><td>{l.titulo || "Não reconhecida"}</td><td>{l.tipo_lancamento}</td>
                <td>{l.codigo_centro_de_custo || "—"}</td><td>{l.codigo_item_despesa || "—"}</td><td className="d num">{fmt(l.valor)}</td></tr>))}</tbody>
          </table></div>
        </section>)}

      <RegrasCaixinha regras={regras} fixas={fixas} centros={centros} itens={itens} aoMudar={aoMudarRegras} />
      {edit && <ModalRegra edit={edit} setEdit={setEdit} centros={centros} itens={itens} aoSalvar={aoMudarRegras} />}
    </>
  );
}
