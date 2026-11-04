"use client";
import { useState } from "react";
import Modal from "../ui/Modal";
import { Chevron, Lapis, Lixo, Mais } from "../ui/Icones";
import { api } from "../lib";

const item3 = (c) => (c < 100 ? `*${String(c).padStart(3, "0")}` : String(c));

// Modal de criar/editar regra. `edit` = { id?, kw, titulo, centro, item, tipo }.
export function ModalRegra({ edit, setEdit, centros, itens, aoSalvar }) {
  const [erro, setErro] = useState("");
  const muda = (k) => (e) => setEdit({ ...edit, [k]: e.target.value });
  async function salvar(ev) {
    ev.preventDefault(); setErro("");
    try {
      const { id, ...corpo } = edit;
      await api(id ? `/caixinha/regras/${id}` : "/caixinha/regras", { method: id ? "PUT" : "POST",
        body: JSON.stringify({ ...corpo, item: Number(corpo.item), tipo: corpo.tipo || null }) });
      setEdit(null); await aoSalvar();
    } catch (x) { setErro(x.message); }
  }
  return (
    <Modal titulo={edit.id ? "Editar regra" : "Nova regra"} subtitulo="Linhas da caixinha cuja descrição contém a palavra-chave viram este lançamento."
      onClose={() => setEdit(null)}
      rodape={<><button type="button" className="btn" onClick={() => setEdit(null)}>Cancelar</button><button type="submit" form="form-regra-cx" className="btn primario">Salvar regra</button></>}>
      <form id="form-regra-cx" className="form-modal" onSubmit={salvar}>
        <label>Quando a descrição contiver <span className="dica-campo">sem acento e sem diferença de maiúscula</span>
          <input value={edit.kw} onChange={muda("kw")} required autoFocus /></label>
        <label>Título no CSV <span className="dica-campo">repetidos ganham 01, 02…</span><input value={edit.titulo} onChange={muda("titulo")} required /></label>
        <label>Centro de custo<select value={edit.centro} onChange={muda("centro")} required>
          <option value="">Escolha…</option>{centros.map((c) => <option key={c.codigo} value={c.codigo}>{c.codigo} · {c.nome}</option>)}</select></label>
        <label>Item de despesa<select value={edit.item} onChange={muda("item")} required>
          <option value="">Escolha…</option>{itens.map((i) => <option key={i.codigo} value={i.codigo}>{item3(i.codigo)} · {i.nome}</option>)}</select></label>
        <label>Tipo<select value={edit.tipo || ""} onChange={muda("tipo")}>
          <option value="">O da planilha (crédito ou débito)</option><option value="DEBITO">Débito</option><option value="CREDITO">Crédito</option></select></label>
        {erro && <p className="msg ruim">{erro}</p>}
      </form>
    </Modal>
  );
}

export function RegrasCaixinha({ regras, fixas, centros, itens, aoMudar }) {
  const [aberto, setAberto] = useState(false);
  const [verFixas, setVerFixas] = useState(false);
  const [edit, setEdit] = useState(null);
  const [erro, setErro] = useState("");
  const [busca, setBusca] = useState("");
  const nomeItem = Object.fromEntries(itens.map((i) => [i.codigo, i.nome]));
  const b = busca.toLowerCase();
  const lista = regras.filter((r) => !b || `${r.kw} ${r.titulo} ${r.centro}`.toLowerCase().includes(b));
  const listaFixas = fixas.filter((r) => !b || `${r.padrao} ${r.titulo} ${r.centro}`.toLowerCase().includes(b));
  async function excluir(r) { setErro(""); try { await api(`/caixinha/regras/${r.id}`, { method: "DELETE" }); await aoMudar(); } catch (x) { setErro(x.message); } }
  const Tipo = ({ t }) => t ? <span className={"tipo " + (t === "DEBITO" ? "deb" : "cred")}>{t === "DEBITO" ? "Débito" : "Crédito"}</span> : <span className="mudo">Da planilha</span>;
  const Item = ({ c }) => <span title={nomeItem[c] || ""}>{item3(c)}{nomeItem[c] ? ` · ${nomeItem[c]}` : ""}</span>;

  return (
    <section className={"painel colapso" + (aberto ? " aberto" : "")}>
      <button type="button" className="colapso-cab" aria-expanded={aberto} onClick={() => setAberto(!aberto)}>
        <Chevron className="seta" /><h2>Regras da caixinha</h2><span className="contagem">{regras.length} salvas · {fixas.length} do sistema</span>
      </button>
      <div className="gaveta"><div>
        <div className="filtros">
          <button type="button" className="btn primario" onClick={() => setEdit({ kw: "", titulo: "", centro: "ADM01", item: "", tipo: "" })}><Mais />Nova regra</button>
          <input className="busca-simples" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar regra" aria-label="Buscar regra" />
          <label className="marca"><input type="checkbox" checked={verFixas} onChange={(e) => setVerFixas(e.target.checked)} />Mostrar regras do sistema</label>
          <span className="contagem">As regras salvas valem antes das do sistema; a palavra-chave mais longa vence.</span>
        </div>
        {erro && <p className="msg ruim">{erro}</p>}
        {lista.length ? (
          <div className="tabela-rolo alto"><table className="tabela">
            <thead><tr><th>Quando a descrição contiver</th><th>Título</th><th>Tipo</th><th>Centro</th><th>Item</th><th /></tr></thead>
            <tbody>{lista.map((r) => (
              <tr key={r.id}><td><div className="ev-nome">{r.kw}</div></td><td>{r.titulo}</td><td><Tipo t={r.tipo} /></td><td>{r.centro}</td><td><Item c={r.item} /></td>
                <td className="acoes"><button type="button" className="icone" aria-label={`Editar ${r.kw}`} onClick={() => setEdit({ ...r, tipo: r.tipo || "" })}><Lapis /></button>
                  <button type="button" className="icone perigo" aria-label={`Excluir ${r.kw}`} onClick={() => excluir(r)}><Lixo /></button></td></tr>))}</tbody>
          </table></div>
        ) : <p className="vazio">{regras.length ? "Nenhuma regra salva bate com a busca." : "Nenhuma regra salva ainda. Elas aparecem aqui quando você classifica uma linha não reconhecida."}</p>}
        {verFixas && (
          <div className="tabela-rolo alto" style={{ marginTop: 14 }}><table className="tabela">
            <thead><tr><th>Do sistema · padrão na descrição</th><th>Título</th><th>Tipo</th><th>Centro</th><th>Item</th></tr></thead>
            <tbody>{listaFixas.map((r) => (
              <tr key={r.padrao}><td><code className="mudo">{r.padrao}</code></td><td>{r.titulo}</td><td><Tipo t={r.tipo} /></td><td>{r.centro}</td><td><Item c={r.item} /></td></tr>))}</tbody>
          </table></div>)}
      </div></div>
      {edit && <ModalRegra edit={edit} setEdit={setEdit} centros={centros} itens={itens} aoSalvar={aoMudar} />}
    </section>
  );
}
