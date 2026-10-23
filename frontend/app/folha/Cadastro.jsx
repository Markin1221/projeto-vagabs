"use client";
import { SECOES } from "../lib";

export default function Cadastro({ form, setForm, editId, aliasEdit, itens, centros, msg, aoSalvar, aoCancelar, aoRemoverApelido }) {
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });
  return (
    <form id="cadastro" className="painel" onSubmit={aoSalvar}>
      <div className="painel-cab"><h2>{editId ? "Editar evento" : "Cadastrar evento novo"}</h2>
        <p>{editId ? "Altere o que precisar e salve. Para tirar o evento do CSV sem apagar, desmarque “Ativo”." : "Use quando o PDF trouxer um evento que ainda não existe no cadastro."}</p></div>
      <div className="grade-form">
        <label>Código no PDF<input value={form.codigo_pdf} onChange={set("codigo_pdf")} inputMode="numeric" /></label>
        <label className="tres">Nome no PDF<input value={form.nome_pdf} onChange={set("nome_pdf")} required={form.secao !== "calculado"} /></label>
        <label className="duas">Descrição no CSV<input value={form.descricao} onChange={set("descricao")} required /></label>
        <label>Seção<select value={form.secao} onChange={set("secao")}>{SECOES.map((s) => <option key={s}>{s}</option>)}</select></label>
        <label>Tipo<select value={form.tipo_lancamento} onChange={set("tipo_lancamento")}><option value="">Não lança</option><option value="DEBITO">Débito</option><option value="CREDITO">Crédito</option></select></label>
        <label className="duas">Item de despesa
          <select value={form.item_despesa} onChange={set("item_despesa")}><option value="">Escolha…</option>{itens.map((i) => <option key={i.codigo} value={i.codigo}>{i.codigo} — {i.nome}</option>)}</select></label>
        <label className="duas">Centro de custo
          <select value={form.centro_custo_fixo} onChange={set("centro_custo_fixo")}><option value="">Segue o departamento do PDF</option>{centros.map((c) => <option key={c.codigo} value={c.codigo}>{c.codigo} — {c.nome}</option>)}</select></label>
        <label>Grupo<select value={form.grupo} onChange={set("grupo")}><option value="folha">Folha</option><option value="conselho">Conselho</option></select></label>
        <label className="tres"><span>Cálculo <span className="dica-campo">opcional, ex.: {"{INSS} + {Sócios}"}</span></span><input value={form.calculo} onChange={set("calculo")} /></label>
        <label className="duas">Observação<input value={form.observacao} onChange={set("observacao")} /></label>
        <div className="marcas">
          <label className="marca"><input type="checkbox" checked={form.gera_lancamento} onChange={set("gera_lancamento")} />Gera lançamento</label>
          {editId && <label className="marca"><input type="checkbox" checked={form.ativo} onChange={set("ativo")} />Ativo</label>}
        </div>
      </div>
      {editId && aliasEdit.length > 0 && (
        <div className="apelidos"><span>Outros nomes que o PDF usa para este evento:</span>
          {aliasEdit.map((a) => <span key={a.id} className="chip">{a.nome}<button type="button" onClick={() => aoRemoverApelido(a)} aria-label={`Remover ${a.nome}`}>×</button></span>)}</div>)}
      <div className="form-rodape">
        {msg && <p className={"msg " + (msg.ok ? "ok" : "ruim")} role="status">{msg.t}</p>}
        <span style={{ flex: 1 }} />
        {editId && <button type="button" className="btn" onClick={aoCancelar}>Cancelar</button>}
        <button type="submit" className="btn primario">{editId ? "Salvar alterações" : "Cadastrar evento"}</button>
      </div>
    </form>
  );
}
