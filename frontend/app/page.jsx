"use client";
import { useEffect, useMemo, useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const SECOES = ["adicional", "desconto", "total", "gps", "pis", "fgts", "calculado"];
const VAZIO = { codigo_pdf: "", nome_pdf: "", descricao: "", secao: "adicional", tipo_lancamento: "DEBITO", centro_custo_fixo: "", item_despesa: "", gera_lancamento: true, calculo: "" };

async function api(caminho, opcoes) {
  const r = await fetch(API + caminho, { headers: { "Content-Type": "application/json" }, ...opcoes });
  const corpo = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(typeof corpo.detail === "string" ? corpo.detail : JSON.stringify(corpo.detail || corpo));
  return corpo;
}

export default function Pagina() {
  const [eventos, setEventos] = useState([]);
  const [centros, setCentros] = useState([]);
  const [itens, setItens] = useState([]);
  const [erro, setErro] = useState("");
  const [depto, setDepto] = useState("ADM01");
  const [busca, setBusca] = useState("");
  const [secao, setSecao] = useState("");
  const [soLanca, setSoLanca] = useState(true);
  const [form, setForm] = useState(VAZIO);
  const [msg, setMsg] = useState(null);
  const [arquivo, setArquivo] = useState(null);
  const [centroUp, setCentroUp] = useState("");
  const [res, setRes] = useState(null);
  const [erroUp, setErroUp] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [ocultarZero, setOcultarZero] = useState(false);
  const [alvoApelido, setAlvoApelido] = useState({});

  function dadosUpload(extra = {}) {
    const fd = new FormData();
    fd.append("arquivo", arquivo);
    if (centroUp) fd.append("centro_custo", centroUp);
    fd.append("ocultar_zerados", ocultarZero ? "true" : "false");
    Object.entries(extra).forEach(([k, v]) => fd.append(k, v));
    return fd;
  }

  async function processar() {
    if (!arquivo) return;
    setCarregando(true); setErroUp(""); setRes(null);
    try {
      const r = await fetch(API + "/folha/processar", { method: "POST", body: dadosUpload() });
      const corpo = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(typeof corpo.detail === "string" ? corpo.detail : JSON.stringify(corpo.detail));
      setRes(corpo);
    } catch (x) { setErroUp(x.message); }
    setCarregando(false);
  }

  async function baixarCsv() {
    const r = await fetch(API + "/folha/csv", { method: "POST", body: dadosUpload() });
    if (!r.ok) { setErroUp("Erro ao gerar o CSV"); return; }
    const nome = (r.headers.get("content-disposition") || "").match(/filename="(.+)"/)?.[1] || "lancamentos.csv";
    const a = document.createElement("a");
    a.href = URL.createObjectURL(await r.blob()); a.download = nome; a.click();
  }

  async function vincular(n) {
    const id = alvoApelido[n.nome_pdf];
    if (!id) return;
    try {
      await api(`/eventos/${id}/apelidos`, { method: "POST", body: JSON.stringify({ nome: n.nome_pdf }) });
      await carregar(); processar();
    } catch (x) { setErroUp(x.message); }
  }

  function registrarNovo(n) {
    setForm({ ...VAZIO, codigo_pdf: n.codigo_pdf, nome_pdf: n.nome_pdf, descricao: n.nome_pdf,
              secao: n.secao, tipo_lancamento: n.secao === "adicional" ? "DEBITO" : "CREDITO" });
    document.getElementById("cadastro")?.scrollIntoView({ behavior: "smooth" });
  }

  async function carregar() {
    try {
      const [e, c, i] = await Promise.all([api("/eventos"), api("/centros-custo"), api("/itens-despesa")]);
      setEventos(e); setCentros(c); setItens(i); setErro("");
    } catch (x) { setErro("Não consegui falar com a API (" + API + "): " + x.message); }
  }
  useEffect(() => { carregar(); }, []);

  const deptos = centros.filter((c) => c.tipo === "departamento");
  const nomeItem = useMemo(() => Object.fromEntries(itens.map((i) => [i.codigo, i.nome])), [itens]);
  const linhas = eventos.filter((e) =>
    (!soLanca || e.gera_lancamento) && (!secao || e.secao === secao) &&
    (!busca || (e.descricao + " " + (e.nome_pdf || "")).toLowerCase().includes(busca.toLowerCase())));

  async function cadastrar(ev) {
    ev.preventDefault();
    const corpo = {
      ...form,
      codigo_pdf: form.codigo_pdf || null, nome_pdf: form.nome_pdf || null, calculo: form.calculo || null,
      centro_custo_fixo: form.centro_custo_fixo || null,
      item_despesa: form.item_despesa === "" ? null : Number(form.item_despesa),
      tipo_lancamento: form.gera_lancamento || form.tipo_lancamento ? form.tipo_lancamento : null,
    };
    try {
      const novo = await api("/eventos", { method: "POST", body: JSON.stringify(corpo) });
      setMsg({ ok: true, t: `Evento "${novo.descricao}" cadastrado (ordem ${novo.ordem}).` });
      setForm(VAZIO); carregar(); if (arquivo) processar();
    } catch (x) { setMsg({ ok: false, t: x.message }); }
  }
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });

  return (
    <main>
      <h1>VAGABS — teste das regras</h1>
      <div className="sub">Eventos base do banco e o centro de custo que cada um teria no CSV de lançamentos.</div>
      {erro && <div className="card erro">{erro}</div>}

      <div className="card">
        <h2>1. Enviar PDF da folha</h2>
        <div className="row">
          <label>PDF (Resumo Geral)<input type="file" accept=".pdf" onChange={(e) => { setArquivo(e.target.files[0] || null); setRes(null); }} /></label>
          <label>Centro de custo do PDF
            <select value={centroUp} onChange={(e) => setCentroUp(e.target.value)}>
              <option value="">detectar pelo PDF</option>
              {deptos.map((c) => <option key={c.codigo} value={c.codigo}>{c.codigo} — {c.nome}</option>)}
            </select>
          </label>
          <label style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <input type="checkbox" checked={ocultarZero} onChange={(e) => setOcultarZero(e.target.checked)} />ocultar linhas zeradas
          </label>
          <button type="button" onClick={processar} disabled={!arquivo || carregando}>{carregando ? "Lendo..." : "Processar"}</button>
          {res && <button type="button" onClick={baixarCsv}>Baixar CSV ({res.linhas.length} linhas)</button>}
        </div>
        {erroUp && <div className="msg erro">{erroUp}</div>}
        {res && (
          <div style={{ marginTop: 12 }}>
            <div className="sub">{res.departamento_pdf} → {res.centro_custo.codigo} {res.centro_custo.nome} · {res.periodo.inicio} a {res.periodo.fim}</div>
            {(res.avisos || []).map((a, i) => <div key={i} className="msg erro">Aviso: {a}</div>)}
            {(res.eventos_novos || []).length > 0 && (
              <div className="card" style={{ borderColor: "#b45309", background: "#fff7ea" }}>
                <h2 style={{ color: "#b45309" }}>⚠ {(res.eventos_novos || []).length} evento(s) novo(s) no PDF — não entram no CSV até serem cadastrados</h2>
                {(res.eventos_novos || []).map((n) => (
                  <div key={n.nome_pdf} className="row" style={{ marginBottom: 6 }}>
                    <span><b>{n.codigo_pdf}</b> {n.nome_pdf} ({n.secao}) — Total {n.valores.Total ?? "—"}</span>
                    <button type="button" onClick={() => registrarNovo(n)}>Cadastrar como novo</button>
                    <span>ou é o mesmo que</span>
                    <select value={alvoApelido[n.nome_pdf] || ""} onChange={(e) => setAlvoApelido({ ...alvoApelido, [n.nome_pdf]: e.target.value })}>
                      <option value="">— escolher evento —</option>
                      {eventos.filter((e) => e.secao === n.secao && e.gera_lancamento).map((e) => <option key={e.id} value={e.id}>{e.descricao}</option>)}
                    </select>
                    <button type="button" onClick={() => vincular(n)} disabled={!alvoApelido[n.nome_pdf]}>Vincular</button>
                  </div>
                ))}
              </div>
            )}
            <table style={{ marginBottom: 12 }}>
              <thead><tr><th>Conferência (somatórios)</th><th style={{ textAlign: "right" }}>PDF</th><th style={{ textAlign: "right" }}>Calculado</th><th style={{ textAlign: "right" }}>Diferença</th><th></th></tr></thead>
              <tbody>{(res.conferencias || []).map((c) => (
                <tr key={c.nome}><td>{c.nome}</td>
                  <td style={{ textAlign: "right" }}>{c.pdf.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                  <td style={{ textAlign: "right" }}>{c.calculado.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                  <td style={{ textAlign: "right" }}>{c.diferenca.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                  <td className={c.ok ? "okmsg" : "erro"}>{c.ok ? "ok" : "diverge — evento do PDF não cadastrado?"}</td></tr>))}</tbody>
            </table>
            <div className="wrap">
              <table>
                <thead><tr><th>descricao</th><th>tipo</th><th>centro</th><th>item</th><th style={{ textAlign: "right" }}>valor</th></tr></thead>
                <tbody>{res.linhas.map((l, i) => (
                  <tr key={i} className={l.valor === 0 ? "nao" : ""}><td>{l.descricao}</td><td className={l.tipo_lancamento === "DEBITO" ? "deb" : "cred"}>{l.tipo_lancamento}</td>
                    <td>{l.codigo_centro_de_custo}</td><td>{l.codigo_item_despesa}</td>
                    <td style={{ textAlign: "right" }}>{l.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td></tr>))}</tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <div className="card">
        <h2>Eventos ({linhas.length} de {eventos.length})</h2>
        <div className="row" style={{ marginBottom: 10 }}>
          <label>Departamento do PDF (simulação)
            <select value={depto} onChange={(e) => setDepto(e.target.value)}>
              {deptos.map((c) => <option key={c.codigo} value={c.codigo}>{c.codigo} — {c.nome}</option>)}
            </select>
          </label>
          <label>Seção
            <select value={secao} onChange={(e) => setSecao(e.target.value)}>
              <option value="">todas</option>{SECOES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </label>
          <label>Buscar<input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="nome do evento" /></label>
          <label style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <input type="checkbox" checked={soLanca} onChange={(e) => setSoLanca(e.target.checked)} />só os que geram lançamento
          </label>
        </div>
        <div className="wrap">
          <table>
            <thead><tr><th>#</th><th>Cód. PDF</th><th>Descrição (CSV)</th><th>Seção</th><th>Tipo</th><th>Item de despesa</th><th>Centro de custo</th><th>Lança?</th><th>Cálculo</th></tr></thead>
            <tbody>
              {linhas.map((e) => (
                <tr key={e.id}>
                  <td>{e.ordem < 1000 ? e.ordem : ""}</td><td>{e.codigo_pdf}</td><td>{e.descricao}</td><td>{e.secao}</td>
                  <td className={e.tipo_lancamento === "DEBITO" ? "deb" : "cred"}>{e.tipo_lancamento}</td>
                  <td>{e.item_despesa ? `${e.item_despesa} — ${nomeItem[e.item_despesa] || ""}` : ""}</td>
                  <td>{e.gera_lancamento && (e.centro_custo_fixo
                    ? <span className="tag fixo">{e.centro_custo_fixo} (fixo)</span>
                    : <span className="tag dep">{depto} (depto)</span>)}</td>
                  <td className={e.gera_lancamento ? "" : "nao"}>{e.gera_lancamento ? "sim" : "não"}</td>
                  <td style={{ maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis" }} title={e.calculo || ""}>{e.calculo || ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <form id="cadastro" className="card" onSubmit={cadastrar}>
        <h2>Cadastrar evento novo</h2>
        <div className="row">
          <label>Código no PDF<input value={form.codigo_pdf} onChange={set("codigo_pdf")} style={{ width: 80 }} /></label>
          <label>Nome no PDF<input value={form.nome_pdf} onChange={set("nome_pdf")} required /></label>
          <label>Descrição no CSV<input value={form.descricao} onChange={set("descricao")} required /></label>
          <label>Seção<select value={form.secao} onChange={set("secao")}>{SECOES.map((s) => <option key={s}>{s}</option>)}</select></label>
          <label>Tipo<select value={form.tipo_lancamento} onChange={set("tipo_lancamento")}><option>DEBITO</option><option>CREDITO</option></select></label>
          <label>Item de despesa
            <select value={form.item_despesa} onChange={set("item_despesa")}>
              <option value="">—</option>{itens.map((i) => <option key={i.codigo} value={i.codigo}>{i.codigo} — {i.nome}</option>)}
            </select>
          </label>
          <label>Centro fixo
            <select value={form.centro_custo_fixo} onChange={set("centro_custo_fixo")}>
              <option value="">(segue o departamento)</option>{centros.map((c) => <option key={c.codigo} value={c.codigo}>{c.codigo} — {c.nome}</option>)}
            </select>
          </label>
          <label style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <input type="checkbox" checked={form.gera_lancamento} onChange={set("gera_lancamento")} />gera lançamento
          </label>
          <button type="submit">Cadastrar</button>
        </div>
        {msg && <div className={"msg " + (msg.ok ? "okmsg" : "erro")}>{msg.t}</div>}
      </form>
    </main>
  );
}
