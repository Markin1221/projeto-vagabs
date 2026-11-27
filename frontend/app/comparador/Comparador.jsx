"use client";
import { useState } from "react";
import Dica from "../ui/Dica";
import Soltar from "../ui/Soltar";
import { Baixar, Ok } from "../ui/Icones";
import { API, fmt, autFetch, mensagemDeErro } from "../lib";

function Tabela({ linhas, colunas }) {
  if (!linhas.length) return <p className="vazio">Nada aqui.</p>;
  return (
    <div className="tabela-rolo alto"><table className="tabela">
      <thead><tr>{colunas.map(([k, r, d]) => <th key={k} className={d ? "d" : ""}>{r}</th>)}</tr></thead>
      <tbody>{linhas.map((l, i) => <tr key={i}>{colunas.map(([k, , d]) => <td key={k} className={d ? "d num" : ""}>{d && l[k] != null ? fmt(l[k]) : l[k]}</td>)}</tr>)}</tbody>
    </table></div>
  );
}
const COL_EXTRATO = [["Data", "Data"], ["Tipo", "Tipo"], ["Valor", "Valor", 1], ["Histórico", "Histórico"], ["Documento", "Documento"], ["Detalhe", "Detalhe"]];

export default function Comparador() {
  const [extrato, setExtrato] = useState(null);
  const [ddata, setDdata] = useState(null);
  const [rende, setRende] = useState(true);
  const [creditos, setCreditos] = useState(false);
  const [datas, setDatas] = useState(false);
  const [res, setRes] = useState(null);
  const [erro, setErro] = useState("");
  const [lendo, setLendo] = useState(false);
  const [baixando, setBaixando] = useState(false);
  const [aba, setAba] = useState("faltando");

  const dados = () => { const fd = new FormData(); fd.append("extrato", extrato); fd.append("ddata", ddata);
    fd.append("ignorar_rende", String(rende)); fd.append("ignorar_creditos", String(creditos)); fd.append("ignorar_datas", String(datas)); return fd; };

  async function comparar() {
    setLendo(true); setErro(""); setRes(null);
    try {
      const r = await autFetch(API + "/comparador/comparar", { method: "POST", body: dados() });
      const c = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(typeof c.detail === "string" ? c.detail : "Erro ao comparar");
      setRes(c); setAba(c.faltando.length ? "faltando" : c.outra_data.length ? "outra" : c.agrupados.length ? "soma" : "so");
    } catch (x) { setErro(mensagemDeErro(x)); }
    setLendo(false);
  }
  async function baixar() {
    setErro(""); setBaixando(true);
    try {
      const r = await autFetch(API + "/comparador/xlsx", { method: "POST", body: dados() });
      if (!r.ok) { const c = await r.json().catch(() => ({})); throw new Error(typeof c.detail === "string" ? c.detail : `Erro ${r.status} ao gerar a planilha`); }
      const url = URL.createObjectURL(await r.blob());
      const a = document.createElement("a"); a.href = url; a.download = "transferencias_faltando_ddata.xlsx";
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch (x) { setErro(mensagemDeErro(x)); }
    setBaixando(false);
  }
  const tudoCerto = res && !res.faltando.length && !res.outra_data.length;
  const abas = res && [["faltando", "Faltando no DDATA", res.faltando.length], ["outra", "Valor em outra data", res.outra_data.length], ["soma", "Soma de vários lançamentos", res.agrupados.length], ["so", "Só no DDATA", res.so_ddata.length]];

  return (
    <>
      <Dica passos={[
        "Envie o extrato do banco (.xlsx) no primeiro campo e, no segundo, a planilha do DDATA Sol ou a conferência (o sistema usa só as abas dos dias do extrato, ex.: 26.11.26).",
        "Escolha as opções: ignorar as aplicações automáticas (BB Rende Fácil), comparar só os débitos, ou ignorar as datas.",
        "Clique em Comparar. As abas mostram o que está no banco e falta no DDATA, o que existe com data diferente e o que só tem no DDATA.",
        "Clique em Baixar planilha para levar o resultado para o Excel."]} />
      <section className="painel">
        <div className="painel-cab"><h2>Comparar extrato e DDATA</h2><p>Descubra quais pagamentos do banco não aparecem na planilha e quais da planilha não saíram do banco. Na conferência, vários boletos somados numa linha (\"dda\") também são reconhecidos.</p></div>
        {erro && <div className="faixa-erro" role="alert" style={{ marginBottom: 14 }}>{erro}</div>}
        <div className="duas-colunas">
          <div><p className="rotulo-campo">Extrato do banco</p><Soltar rotulo="Escolha o extrato do banco" arquivo={extrato} aoEscolher={setExtrato} /></div>
          <div><p className="rotulo-campo">Planilha do DDATA Sol ou conferência</p><Soltar rotulo="Escolha a planilha do DDATA" arquivo={ddata} aoEscolher={setDdata} /></div>
        </div>
        <div className="opcoes">
          <label className="marca"><input type="checkbox" checked={rende} onChange={(e) => setRende(e.target.checked)} />Ignorar aplicações e resgates automáticos (BB Rende Fácil, RF Simples)</label>
          <label className="marca"><input type="checkbox" checked={creditos} onChange={(e) => setCreditos(e.target.checked)} />Comparar só débitos (ignorar créditos)</label>
          <label className="marca"><input type="checkbox" checked={datas} onChange={(e) => setDatas(e.target.checked)} />Ignorar as datas e procurar só pelos valores</label>
        </div>
        <div className="gerar">
          <span style={{ flex: 1 }} />
          {(!extrato || !ddata) && <p className="gerar-msg">Envie os dois arquivos para comparar.</p>}
          <button type="button" className="btn primario grande" disabled={!extrato || !ddata || lendo} onClick={comparar}>{lendo ? "Comparando…" : "Comparar"}</button>
        </div>
      </section>

      {res && (
        <section className="painel">
          <div className="painel-cab"><h2>Resultado</h2><p>{res.n_extrato} lançamentos no extrato · {res.n_ddata} no DDATA</p></div>
          {erro && <div className="faixa-erro" role="alert" style={{ marginBottom: 14 }}>{erro}</div>}
          {tudoCerto && <p className="aviso ok-aviso"><Ok />Nenhum pagamento faltando no DDATA. Tudo conferiu.</p>}
          <div className="abas" role="tablist">
            {abas.map(([k, r, n]) => <button key={k} type="button" role="tab" aria-selected={aba === k} className={aba === k ? "ativa" : ""} onClick={() => setAba(k)}>{r} <b>{n}</b></button>)}
            <span style={{ flex: 1 }} />
            <button type="button" className="btn" disabled={baixando} onClick={baixar}><Baixar />{baixando ? "Gerando…" : "Baixar planilha"}</button>
          </div>
          {aba === "faltando" && <Tabela linhas={res.faltando} colunas={COL_EXTRATO} />}
          {aba === "outra" && <Tabela linhas={res.outra_data} colunas={[...COL_EXTRATO.slice(0, 4), ["Data no DDATA", "Data no DDATA"], ["Título no DDATA", "Título no DDATA"], ["Diferença (dias)", "Dias", 0]]} />}
          {aba === "soma" && <><p className="vazio" style={{ textAlign: "left" }}>Linhas da planilha que são a soma de vários lançamentos do banco (ex.: "dda" = todos os boletos do dia). Estão conferidas.</p><Tabela linhas={res.agrupados} colunas={[["Data", "Data"], ["Valor", "Valor", 1], ["Descrição", "Descrição"], ["Lançamentos no banco", "Lançamentos", 0], ["Detalhe", "Detalhe"]]} /></>}
          {aba === "so" && <Tabela linhas={res.so_ddata} colunas={[["Data", "Data"], ["Valor", "Valor", 1], ["Título", "Título"], ["Descrição", "Descrição"]]} />}
        </section>)}
    </>
  );
}
