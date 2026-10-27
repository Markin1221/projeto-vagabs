"use client";
import { useState } from "react";
import Modal from "../ui/Modal";
import { Chevron, Lapis, Lixo, Mais } from "../ui/Icones";
import { api } from "../lib";

export function Regras({ regras, opcoesLinha, aoMudar }) {
  const [aberto, setAberto] = useState(false);
  const [edit, setEdit] = useState(null);
  const [erro, setErro] = useState("");
  const [busca, setBusca] = useState("");
  const nome = Object.fromEntries(opcoesLinha.map((o) => [o.codigo, o.nome]));
  const lista = regras.filter((r) => !busca || (r.padrao + " " + (nome[r.linha] || "")).toLowerCase().includes(busca.toLowerCase()));
  async function salvar(ev) {
    ev.preventDefault(); setErro("");
    try {
      const { id, ...corpo } = edit;
      await api(id ? `/quinzena/regras/${id}` : "/quinzena/regras", { method: id ? "PUT" : "POST", body: JSON.stringify({ ...corpo, ordem: corpo.ordem === "" ? null : Number(corpo.ordem) }) });
      setEdit(null); await aoMudar();
    } catch (x) { setErro(x.message); }
  }
  async function excluir(r) { try { await api(`/quinzena/regras/${r.id}`, { method: "DELETE" }); await aoMudar(); } catch (x) { setErro(x.message); } }
  return (
    <section className={"painel colapso" + (aberto ? " aberto" : "")}>
      <button type="button" className="colapso-cab" aria-expanded={aberto} onClick={() => setAberto(!aberto)}>
        <Chevron className="seta" /><h2>Regras dos eventos</h2><span className="contagem">{regras.length} regras</span>
      </button>
      <div className="gaveta"><div>
        <div className="filtros">
          <button type="button" className="btn primario" onClick={() => setEdit({ padrao: "", linha: "", ordem: "" })}><Mais />Nova regra</button>
          <input className="busca-simples" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar regra" aria-label="Buscar regra" />
          <span className="contagem">Vale a primeira regra, na ordem, cujo texto aparece no nome do evento (sem o código).</span>
        </div>
        {erro && <p className="msg ruim">{erro}</p>}
        <div className="tabela-rolo alto"><table className="tabela">
          <thead><tr><th className="d">Ordem</th><th>Quando o evento contiver</th><th>Vai para a linha</th><th /></tr></thead>
          <tbody>{lista.map((r) => (
            <tr key={r.id}><td className="d num">{r.ordem}</td><td><div className="ev-nome">{r.padrao}</div></td><td>{nome[r.linha] || r.linha}</td>
              <td className="acoes"><button type="button" className="icone" aria-label={`Editar ${r.padrao}`} onClick={() => setEdit({ ...r })}><Lapis /></button>
                <button type="button" className="icone perigo" aria-label={`Excluir ${r.padrao}`} onClick={() => excluir(r)}><Lixo /></button></td></tr>))}</tbody>
        </table></div>
      </div></div>
      {edit && (
        <Modal titulo={edit.id ? "Editar regra" : "Nova regra"} subtitulo="Eventos cujo nome contém o texto vão para a linha escolhida." onClose={() => setEdit(null)}
          rodape={<><button type="button" className="btn" onClick={() => setEdit(null)}>Cancelar</button><button type="submit" form="form-regra-q" className="btn primario">Salvar regra</button></>}>
          <form id="form-regra-q" className="form-modal" onSubmit={salvar}>
            <label>Quando o evento contiver<input value={edit.padrao} onChange={(e) => setEdit({ ...edit, padrao: e.target.value })} required autoFocus /></label>
            <label>Vai para a linha<select value={edit.linha} onChange={(e) => setEdit({ ...edit, linha: e.target.value })} required>
              <option value="">Escolha…</option>{opcoesLinha.map((o) => <option key={o.codigo} value={o.codigo}>{o.nome}</option>)}</select></label>
            <label>Ordem <span className="dica-campo">menor = testada antes</span><input inputMode="numeric" value={edit.ordem ?? ""} onChange={(e) => setEdit({ ...edit, ordem: e.target.value.replace(/\D/g, "") })} /></label>
            {erro && <p className="msg ruim">{erro}</p>}
          </form>
        </Modal>)}
    </section>
  );
}

export function Linhas({ linhasCad, cfg, aoSalvarCfg }) {
  const [aberto, setAberto] = useState(false);
  const [form, setForm] = useState(null);
  const [msg, setMsg] = useState(null);
  const f = form || (cfg && { taxa_cooperativa: String(cfg.taxa_cooperativa), taxa_sindicato: String(cfg.taxa_sindicato), conta_quinzena: cfg.conta_quinzena,
    tiuma: (cfg.terminais?.terminal_tiuma || []).join(", "), ponte: (cfg.terminais?.terminal_ponte || []).join(", ") });
  const lista = (t) => t.split(/[,;\s]+/).map((x) => x.trim()).filter(Boolean);
  async function salvar(e) {
    e.preventDefault(); setMsg(null);
    try {
      const n = (v) => Number(String(v).replace(",", "."));
      await aoSalvarCfg({ taxa_cooperativa: n(f.taxa_cooperativa), taxa_sindicato: n(f.taxa_sindicato), conta_quinzena: f.conta_quinzena,
        terminais: { terminal_tiuma: lista(f.tiuma), terminal_ponte: lista(f.ponte) } });
      setForm(null); setMsg({ ok: true, t: "Valores salvos." });
    } catch (x) { setMsg({ ok: false, t: x.message }); }
  }
  return (
    <section className={"painel colapso" + (aberto ? " aberto" : "")}>
      <button type="button" className="colapso-cab" aria-expanded={aberto} onClick={() => setAberto(!aberto)}>
        <Chevron className="seta" /><h2>Linhas do lançamento e taxa</h2><span className="contagem">{linhasCad.linhas.length} linhas</span>
      </button>
      <div className="gaveta"><div>
        {f && (
          <form className="grade-form" onSubmit={salvar} style={{ marginBottom: 16 }}>
            <label>Taxa da Cooperativa por carro<input inputMode="decimal" value={f.taxa_cooperativa} onChange={(e) => setForm({ ...f, taxa_cooperativa: e.target.value })} /></label>
            <label>Taxa do Sindicato por carro<input inputMode="decimal" value={f.taxa_sindicato} onChange={(e) => setForm({ ...f, taxa_sindicato: e.target.value })} /></label>
            <label>Conta padrão<input value={f.conta_quinzena} onChange={(e) => setForm({ ...f, conta_quinzena: e.target.value })} /></label>
            <label>Carros do Terminal Tiuma <span className="dica-campo">começo do prefixo, ex.: 04</span><input value={f.tiuma} onChange={(e) => setForm({ ...f, tiuma: e.target.value })} /></label>
            <label>Carros do Terminal Ponte <span className="dica-campo">ex.: 11</span><input value={f.ponte} onChange={(e) => setForm({ ...f, ponte: e.target.value })} /></label>
            <div className="marcas"><button type="submit" className="btn primario" disabled={!form}>Salvar valores</button>{msg && <span className={"msg " + (msg.ok ? "ok" : "ruim")}>{msg.t}</span>}</div>
          </form>)}
        <div className="tabela-rolo"><table className="tabela">
          <thead><tr><th>Linha</th><th>Tipo</th><th>Centro</th><th>Item</th><th>Fonte</th></tr></thead>
          <tbody>{linhasCad.linhas.map((l) => (
            <tr key={l.codigo}><td>{l.descricao}</td><td><span className={"tipo " + (l.tipo_lancamento === "DEBITO" ? "deb" : "cred")}>{l.tipo_lancamento === "DEBITO" ? "Débito" : "Crédito"}</span></td>
              <td>{l.centro}</td><td>{l.item || <span className="mudo">—</span>}</td><td>{l.fonte || <span className="mudo">—</span>}</td></tr>))}</tbody>
        </table></div>
      </div></div>
    </section>
  );
}
