"use client";
import { useEffect, useState } from "react";
import Dica from "../ui/Dica";
import Soltar from "../ui/Soltar";
import { Baixar, Alerta, Ok } from "../ui/Icones";
import { API, api, fmt, autFetch, mensagemDeErro } from "../lib";

const hoje = () => new Date().toISOString().slice(0, 10);

// Formulário de uma descrição que nenhuma regra reconheceu. Ao salvar, a regra fica no banco e vale nos próximos meses.
function Classificar({ desc, centros, itens, aoSalvar }) {
  const [f, setF] = useState({ kw: desc, titulo: desc, centro: "ADM01", item: "", tipo: "" });
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const muda = (k) => (e) => setF({ ...f, [k]: e.target.value });
  async function salvar() {
    setSalvando(true); setErro("");
    try {
      await api("/caixinha/regras", { method: "POST", body: JSON.stringify({ ...f, item: Number(f.item), tipo: f.tipo || null }) });
      aoSalvar();
    } catch (x) { setErro(mensagemDeErro(x)); setSalvando(false); }
  }
  if (!desc) return <p className="aviso"><Alerta />Há linha com valor e sem descrição. Preencha a descrição na planilha e envie de novo.</p>;
  return (
    <div className="painel" style={{ marginBottom: 10 }}>
      <p><b>“{desc}”</b></p>
      {erro && <div className="faixa-erro" role="alert">{erro}</div>}
      <div className="opcoes" style={{ flexWrap: "wrap" }}>
        <label className="marca">Palavra-chave <input value={f.kw} onChange={muda("kw")} /></label>
        <label className="marca">Título <input value={f.titulo} onChange={muda("titulo")} /></label>
        <label className="marca">Centro <select value={f.centro} onChange={muda("centro")}>
          {centros.map((c) => <option key={c.codigo} value={c.codigo}>{c.codigo} · {c.nome}</option>)}</select></label>
        <label className="marca">Item <select value={f.item} onChange={muda("item")}>
          <option value="">Escolha…</option>
          {itens.map((i) => <option key={i.codigo} value={i.codigo}>{i.codigo} · {i.nome}</option>)}</select></label>
        <label className="marca">Tipo <select value={f.tipo} onChange={muda("tipo")}>
          <option value="">O da planilha</option><option value="DEBITO">DEBITO</option><option value="CREDITO">CREDITO</option></select></label>
        <button type="button" className="btn primario" disabled={salvando || !f.kw.trim() || !f.titulo.trim() || !f.item} onClick={salvar}>
          {salvando ? "Salvando…" : "Salvar regra"}</button>
      </div>
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
  const [centros, setCentros] = useState([]);
  const [itens, setItens] = useState([]);

  useEffect(() => {
    api("/centros-custo").then(setCentros).catch(() => {});
    api("/itens-despesa").then(setItens).catch(() => {});
  }, []);

  const dados = () => { const fd = new FormData(); fd.append("arquivo", arquivo); fd.append("data_lancamento", dataLanc); fd.append("data_da_linha", String(daLinha)); return fd; };

  async function gerar() {
    setLendo(true); setErro("");
    try {
      const r = await autFetch(API + "/caixinha/processar", { method: "POST", body: dados() });
      const c = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(typeof c.detail === "string" ? c.detail : "Erro ao ler a planilha");
      setRes(c);
    } catch (x) { setErro(mensagemDeErro(x)); setRes(null); }
    setLendo(false);
  }
  async function baixar() {
    const r = await autFetch(API + "/caixinha/csv", { method: "POST", body: dados() });
    if (!r.ok) { const c = await r.json().catch(() => ({})); setErro(typeof c.detail === "string" ? c.detail : "Erro ao gerar o CSV"); return; }
    const a = document.createElement("a"); a.href = URL.createObjectURL(await r.blob()); a.download = `caixinha_${dataLanc.slice(5, 7)}-${dataLanc.slice(0, 4)}.csv`; a.click();
  }
  const pend = res?.pendentes || [];

  return (
    <>
      <Dica passos={[
        "Envie a planilha da caixinha (.xlsx) com um mês só (Data, Saldo, Crédito, Débito, Descrição).",
        "Escolha a data dos lançamentos. Marque a opção se quiser usar a data de cada linha quando ela existir.",
        "Clique em Gerar. Títulos repetidos ganham 01, 02… para o sistema aceitar.",
        "Se alguma descrição não for reconhecida, classifique e salve a regra: nos próximos meses ela entra sozinha.",
        "Com tudo classificado, clique em Baixar CSV."]} />
      <section className="painel">
        <div className="painel-cab"><h2>Caixinha do mês</h2><p>Transforme a planilha da caixinha no CSV de importação.</p></div>
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
          <div className="faixa-erro" role="alert" style={{ marginBottom: 14 }}>
            {pend.length} descrição(ões) não reconhecida(s). Classifique cada uma e salve a regra para liberar o CSV.</div>
          {pend.map((d) => <Classificar key={d || "(vazia)"} desc={d} centros={centros} itens={itens} aoSalvar={gerar} />)}
        </section>)}

      {res && (
        <section className="painel">
          <div className="painel-cab"><h2>Lançamentos</h2>
            <p>{res.linhas.length} linhas · débitos R$ {fmt(res.total_debitos)}{res.total_creditos ? ` · créditos R$ ${fmt(res.total_creditos)}` : ""}</p></div>
          {res.avisos.map((a) => <p key={a} className="aviso"><Alerta />{a}</p>)}
          {!pend.length && <p className="aviso ok-aviso"><Ok />Todas as linhas classificadas.</p>}
          <div className="abas"><span style={{ flex: 1 }} />
            <button type="button" className="btn" disabled={pend.length > 0} onClick={baixar}><Baixar />Baixar CSV</button></div>
          <div className="tabela-rolo alto"><table className="tabela">
            <thead><tr><th>Na planilha</th><th>Título</th><th>Tipo</th><th>Centro</th><th>Item</th><th className="d">Valor</th></tr></thead>
            <tbody>{res.linhas.map((l, i) => (
              <tr key={i} style={l.revisar ? { background: "rgba(220,50,50,.12)" } : undefined}>
                <td>{l.origem || "—"}</td><td>{l.titulo || "Não reconhecida"}</td><td>{l.tipo_lancamento}</td>
                <td>{l.codigo_centro_de_custo || "—"}</td><td>{l.codigo_item_despesa || "—"}</td><td className="d num">{fmt(l.valor)}</td></tr>))}</tbody>
          </table></div>
        </section>)}
    </>
  );
}
