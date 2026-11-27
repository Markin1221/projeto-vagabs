"use client";
// Calendário de pagamentos do financeiro. Abre no "pagar hoje" (e no que ficou para trás) para lembrar do que vence
// no dia; embaixo, o mês em calendário e a lista dos pagamentos cadastrados (criar, editar e excluir).
import { useEffect, useMemo, useState } from "react";
import Modal from "../ui/Modal";
import { Chevron, Lapis, Lixo, Mais, Ok } from "../ui/Icones";
import { api, data, fmt, mensagemDeErro } from "../lib";
import "./calendario.css";

const isoLocal = (d) => { const x = new Date(d); x.setMinutes(x.getMinutes() - x.getTimezoneOffset()); return x.toISOString().slice(0, 10); };
const hoje = () => isoLocal(new Date());
const deIso = (iso) => { const [a, m, d] = iso.split("-").map(Number); return new Date(a, m - 1, d); };
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
// Dias da semana como o backend guarda: 0 = segunda ... 6 = domingo. A grade do mês começa no domingo.
const SEMANA = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
const SEMANA_LONGA = ["segunda", "terça", "quarta", "quinta", "sexta", "sábado", "domingo"];
const ORDEM_GRADE = [6, 0, 1, 2, 3, 4, 5];
const diaSemana = (iso) => (deIso(iso).getDay() + 6) % 7;
const reais = (v) => (v == null ? "" : `R$ ${fmt(v)}`);
const soma = (l) => l.reduce((t, i) => t + (i.valor || 0), 0);
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
const FREQ = [["DIARIO", "Diário"], ["SEMANAL", "Semanal"], ["MENSAL", "Mensal"]];

// ---------- Cadastro ----------
function ModalPagamento({ edit, setEdit, aoSalvar }) {
  const [erro, setErro] = useState("");
  const muda = (k) => (e) => setEdit({ ...edit, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });
  const trocaFreq = (f) => setEdit({ ...edit, frequencia: f, dias: f === edit.frequencia ? edit.dias : f === "MENSAL" ? [] : f === "DIARIO" ? [0, 1, 2, 3, 4, 5, 6] : [] });
  const alterna = (n) => setEdit({ ...edit, dias: edit.dias.includes(n) ? edit.dias.filter((x) => x !== n) : [...edit.dias, n].sort((a, b) => a - b) });
  async function salvar(ev) {
    ev.preventDefault(); setErro("");
    try {
      if (edit.frequencia !== "DIARIO" && !edit.dias.length) throw new Error(edit.frequencia === "MENSAL" ? "Escolha pelo menos um dia do mês." : "Escolha pelo menos um dia da semana.");
      if (edit.prazo === "ate" && !edit.fim) throw new Error("Informe até quando vai o pagamento, ou marque “Sem fim”.");
      const corpo = { titulo: edit.titulo, detalhes: edit.detalhes, valor: edit.valor === "" || edit.valor == null ? null : Number(String(edit.valor).replace(/\./g, "").replace(",", ".")),
        frequencia: edit.frequencia, dias: edit.frequencia === "DIARIO" && edit.dias.length === 7 ? [] : edit.dias, inicio: edit.inicio || null,
        fim: edit.prazo === "ate" ? edit.fim : null, observacao: edit.observacao, ativo: edit.ativo ?? true };
      if (corpo.valor != null && Number.isNaN(corpo.valor)) throw new Error("Valor inválido. Ex.: 100,00");
      await api(edit.id ? `/pagamentos/${edit.id}` : "/pagamentos", { method: edit.id ? "PUT" : "POST", body: JSON.stringify(corpo) });
      setEdit(null); await aoSalvar(edit.id ? "Pagamento atualizado" : "Pagamento cadastrado");
    } catch (x) { setErro(mensagemDeErro(x)); }
  }
  return (
    <Modal titulo={edit.id ? "Editar pagamento" : "Novo pagamento"} onClose={() => setEdit(null)} largo
      rodape={<><button type="button" className="btn" onClick={() => setEdit(null)}>Cancelar</button><button type="submit" form="form-pagamento" className="btn primario">Salvar</button></>}>
      <form id="form-pagamento" className="form-modal" onSubmit={salvar}>
        <label>O que pagar<input value={edit.titulo} onChange={muda("titulo")} required autoFocus placeholder="Ex.: Allana Fenatral, aluguel, internet" /></label>
        <label>Como pagar <span className="dica-campo">PIX, chave, conta, boleto…</span><input value={edit.detalhes} onChange={muda("detalhes")} placeholder="Ex.: PIX 041.207.404-47" /></label>
        <label>Valor (R$) <span className="dica-campo">pode deixar vazio se muda todo mês</span><input inputMode="decimal" value={edit.valor} onChange={muda("valor")} placeholder="100,00" /></label>
        <fieldset className="cal-campo cal-largo">
          <legend>Repete</legend>
          <div className="cal-chips" role="radiogroup" aria-label="Frequência">
            {FREQ.map(([k, nome]) => <button key={k} type="button" role="radio" aria-checked={edit.frequencia === k} className={edit.frequencia === k ? "ativo" : ""} onClick={() => trocaFreq(k)}>{nome}</button>)}
          </div>
        </fieldset>
        <fieldset className="cal-campo cal-largo">
          <legend>{edit.frequencia === "MENSAL" ? "Em quais dias do mês" : edit.frequencia === "SEMANAL" ? "Em quais dias da semana" : "Em quais dias da semana (desmarque os que não tem pagamento)"}</legend>
          {edit.frequencia === "MENSAL" ? (
            <div className="cal-dias-mes">{Array.from({ length: 31 }, (_, i) => i + 1).map((n) => (
              <button key={n} type="button" aria-pressed={edit.dias.includes(n)} className={edit.dias.includes(n) ? "ativo" : ""} onClick={() => alterna(n)}>{n}</button>))}</div>
          ) : (
            <div className="cal-chips">{SEMANA.map((s, n) => (
              <button key={n} type="button" aria-pressed={edit.dias.includes(n)} aria-label={SEMANA_LONGA[n]} className={edit.dias.includes(n) ? "ativo" : ""} onClick={() => alterna(n)}>{s}</button>))}
              {edit.frequencia === "DIARIO" && <button type="button" className="btn leve" onClick={() => setEdit({ ...edit, dias: [0, 1, 2, 3, 4] })}>Só dias úteis</button>}</div>
          )}
          {edit.frequencia === "MENSAL" && edit.dias.some((d) => d > 28) && <small className="mudo">Em mês que não tem esse dia, o pagamento cai no último dia do mês.</small>}
        </fieldset>
        <label>Começa em<input type="date" value={edit.inicio} onChange={muda("inicio")} /></label>
        <fieldset className="cal-campo">
          <legend>Duração</legend>
          <div className="cal-prazo">
            <label className="marca"><input type="radio" name="prazo" checked={edit.prazo === "sem"} onChange={() => setEdit({ ...edit, prazo: "sem" })} />Sem fim</label>
            <label className="marca"><input type="radio" name="prazo" checked={edit.prazo === "ate"} onChange={() => setEdit({ ...edit, prazo: "ate" })} />Até</label>
            {edit.prazo === "ate" && <input type="date" aria-label="Último dia" value={edit.fim || ""} min={edit.inicio} onChange={muda("fim")} />}
          </div>
        </fieldset>
        <label className="cal-largo">Observação<input value={edit.observacao} onChange={muda("observacao")} /></label>
        {edit.id && <label className="marca"><input type="checkbox" checked={edit.ativo} onChange={muda("ativo")} />Ativo (desmarque para pausar sem apagar)</label>}
        {erro && <p className="msg ruim" role="alert">{erro}</p>}
      </form>
    </Modal>
  );
}

// ---------- Uma linha de pagamento do dia (com o botão Paguei) ----------
function Linha({ i, aoMarcar, mostrarData }) {
  return (
    <li className={"cal-item" + (i.pago ? " pago" : "")}>
      <button type="button" className="cal-check" aria-pressed={i.pago} aria-label={i.pago ? `Desmarcar ${i.titulo}` : `Marcar ${i.titulo} como pago`}
        title={i.pago ? "Desmarcar" : "Marcar como pago"} onClick={() => aoMarcar(i)}>{i.pago && <Ok />}</button>
      <div className="cal-item-txt">
        <b>{i.titulo}</b>
        <small>{[mostrarData && `${SEMANA_LONGA[diaSemana(i.data)]}, ${data(i.data)}`, i.detalhes, i.pago && `pago em ${data(i.pago_em)}`].filter(Boolean).join(" · ")}</small>
      </div>
      {i.valor != null && <span className="cal-valor">{reais(i.valor)}</span>}
    </li>
  );
}

// ---------- Mês ----------
function Mes({ mes, setMes, itens, dia, setDia, aoMarcar }) {
  const [a, m] = mes.split("-").map(Number);
  const primeiro = new Date(a, m - 1, 1);
  const total = new Date(a, m, 0).getDate();
  const vazios = ORDEM_GRADE.indexOf((primeiro.getDay() + 6) % 7);
  const porDia = useMemo(() => itens.reduce((o, i) => ((o[i.data] ||= []).push(i), o), {}), [itens]);
  const anda = (n) => { const d = new Date(a, m - 1 + n, 1); setMes(isoLocal(d).slice(0, 7)); setDia(null); };
  const h = hoje();
  const doDia = dia ? porDia[dia] || [] : [];
  return (
    <div className="cal-mes-area">
      <div className="cal-mes-topo">
        <button type="button" className="icone" aria-label="Mês anterior" onClick={() => anda(-1)}><Chevron style={{ transform: "rotate(180deg)" }} /></button>
        <h3>{MESES[m - 1]} de {a}</h3>
        <button type="button" className="icone" aria-label="Próximo mês" onClick={() => anda(1)}><Chevron /></button>
        {mes !== h.slice(0, 7) && <button type="button" className="btn leve" onClick={() => { setMes(h.slice(0, 7)); setDia(h); }}>Hoje</button>}
        <span className="mudo cal-mes-total">{plural(itens.length, "pagamento", "pagamentos")} · {reais(soma(itens))}</span>
      </div>
      <div className="cal-grade" role="grid" aria-label={`Pagamentos de ${MESES[m - 1]}`}>
        {ORDEM_GRADE.map((n) => <div key={n} className="cal-cab" role="columnheader">{SEMANA[n]}</div>)}
        {Array.from({ length: vazios }, (_, i) => <div key={"v" + i} className="cal-dia vazio" />)}
        {Array.from({ length: total }, (_, i) => {
          const iso = `${mes}-${String(i + 1).padStart(2, "0")}`;
          const l = porDia[iso] || [];
          const pend = l.filter((x) => !x.pago).length;
          const cls = ["cal-dia", iso === h && "hoje", iso === dia && "sel", l.length && (pend ? (iso < h ? "atrasado" : "tem") : "quitado")].filter(Boolean).join(" ");
          return (
            <button key={iso} type="button" role="gridcell" className={cls} aria-selected={iso === dia} onClick={() => setDia(iso === dia ? null : iso)}
              aria-label={`${i + 1} de ${MESES[m - 1]}: ${l.length ? plural(l.length, "pagamento", "pagamentos") + (pend ? `, ${pend} a pagar` : ", tudo pago") : "nada"}`}>
              <span className="cal-num">{i + 1}</span>
              <span className="cal-pilulas">{l.slice(0, 3).map((x) => <i key={x.pagamento_id} className={x.pago ? "pago" : ""}>{x.titulo}</i>)}{l.length > 3 && <i className="mais">+{l.length - 3}</i>}</span>
            </button>);
        })}
      </div>
      {dia && (
        <div className="cal-dia-det">
          <h4>{SEMANA_LONGA[diaSemana(dia)]}, {data(dia)}</h4>
          {doDia.length ? <ul className="cal-lista">{doDia.map((i) => <Linha key={i.pagamento_id} i={i} aoMarcar={aoMarcar} />)}</ul> : <p className="mudo">Nenhum pagamento nesse dia.</p>}
        </div>)}
    </div>
  );
}

// ---------- Cadastrados ----------
function Cadastrados({ pagamentos, aoEditar, aoExcluir, aoNovo }) {
  if (!pagamentos.length) return (
    <div className="cal-vazio"><b>Nenhum pagamento cadastrado</b><p className="mudo">Cadastre o que se paga todo dia, toda semana ou todo mês.</p>
      <button type="button" className="btn primario" onClick={aoNovo}><Mais />Novo pagamento</button></div>);
  return (
    <div className="cal-cards">{pagamentos.map((p) => (
      <article key={p.id} className={"cal-card" + (p.ativo ? "" : " inativo")}>
        <header><h3>{p.titulo}</h3>
          <div className="cal-card-menu">
            <button type="button" className="icone" aria-label={`Editar ${p.titulo}`} title="Editar" onClick={() => aoEditar(p)}><Lapis /></button>
            <button type="button" className="icone perigo" aria-label={`Excluir ${p.titulo}`} title="Excluir" onClick={() => aoExcluir(p)}><Lixo /></button>
          </div></header>
        {p.valor != null && <b className="cal-card-valor">{reais(p.valor)}</b>}
        <p>{p.descricao}</p>
        {p.detalhes && <small className="mudo">{p.detalhes}</small>}
        {p.observacao && <small className="cal-obs">{p.observacao}</small>}
        {!p.ativo && <span className="chip">pausado</span>}
      </article>))}</div>
  );
}

export default function Calendario() {
  const [aba, setAba] = useState("mes");
  const [pagamentos, setPagamentos] = useState([]);
  const [doDia, setDoDia] = useState({ hoje: [], atrasados: [] });
  const [mes, setMes] = useState(hoje().slice(0, 7));
  const [dia, setDia] = useState(hoje());
  const [itensMes, setItensMes] = useState([]);
  const [edit, setEdit] = useState(null);
  const [aviso, setAviso] = useState("");
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(true);
  async function carregar() {
    try {
      const [a, m] = mes.split("-").map(Number);
      const fimMes = isoLocal(new Date(a, m, 0));
      const [ps, hj, ag] = await Promise.all([api("/pagamentos"), api(`/pagamentos/hoje?data=${hoje()}`), api(`/pagamentos/agenda?de=${mes}-01&ate=${fimMes}`)]);
      setPagamentos(ps); setDoDia(hj); setItensMes(ag); setErro("");
    } catch (x) { setErro(mensagemDeErro(x)); }
    setCarregando(false);
  }
  useEffect(() => { carregar(); }, [mes]);
  useEffect(() => { if (!aviso) return; const t = setTimeout(() => setAviso(""), 5000); return () => clearTimeout(t); }, [aviso]);
  async function marcar(i) {
    setErro("");
    try {
      if (i.pago) await api(`/pagamentos/${i.pagamento_id}/pagar/${i.data}`, { method: "DELETE" });
      else await api(`/pagamentos/${i.pagamento_id}/pagar`, { method: "POST", body: JSON.stringify({ data: i.data }) });
      setAviso(i.pago ? `${i.titulo}: desmarcado` : `${i.titulo}: pago`); await carregar();
    } catch (x) { setErro(mensagemDeErro(x)); }
  }
  async function excluir(p) {
    if (!confirm(`Excluir “${p.titulo}”? O histórico de pagos dele também some. Para só parar por um tempo, edite e desmarque “Ativo”.`)) return;
    setErro(""); try { await api(`/pagamentos/${p.id}`, { method: "DELETE" }); setAviso(`${p.titulo} excluído`); await carregar(); } catch (x) { setErro(mensagemDeErro(x)); }
  }
  const novo = () => setEdit({ titulo: "", detalhes: "", valor: "", frequencia: "MENSAL", dias: [], inicio: hoje(), prazo: "sem", fim: "", observacao: "", ativo: true });
  const editar = (p) => setEdit({ ...p, valor: p.valor == null ? "" : fmt(p.valor), detalhes: p.detalhes || "", observacao: p.observacao || "",
    dias: p.frequencia === "DIARIO" && !p.dias.length ? [0, 1, 2, 3, 4, 5, 6] : p.dias, prazo: p.fim ? "ate" : "sem", fim: p.fim || "" });
  const aPagar = doDia.hoje.filter((i) => !i.pago);
  const h = hoje();
  return (
    <div className="cal">
      <section className={"cal-hoje" + (aPagar.length || doDia.atrasados.length ? " alerta" : "")} aria-live="polite">
        <header>
          <div>
            <small>{SEMANA_LONGA[diaSemana(h)]}, {data(h)}</small>
            <h2>{carregando ? "Carregando…" : aPagar.length ? `Hoje tem ${plural(aPagar.length, "pagamento", "pagamentos")} para fazer` : doDia.hoje.length ? "Tudo de hoje já foi pago" : "Nada para pagar hoje"}</h2>
            {!carregando && aPagar.length > 0 && <p>Total de hoje: <b>{reais(soma(aPagar))}</b></p>}
          </div>
          <button type="button" className="btn primario" onClick={novo}><Mais />Novo pagamento</button>
        </header>
        {doDia.hoje.length > 0 && <ul className="cal-lista">{doDia.hoje.map((i) => <Linha key={i.pagamento_id} i={i} aoMarcar={marcar} />)}</ul>}
        {doDia.atrasados.length > 0 && <>
          <h3 className="cal-atrasados-tit">Ficou para trás ({doDia.atrasados.length}) · {reais(soma(doDia.atrasados))}</h3>
          <ul className="cal-lista atrasados">{doDia.atrasados.map((i) => <Linha key={i.pagamento_id + i.data} i={i} aoMarcar={marcar} mostrarData />)}</ul>
        </>}
      </section>
      {erro && <p className="msg ruim" role="alert">{erro}</p>}
      <section className="painel">
        <div className="abas" role="tablist">
          {[["mes", "Calendário"], ["lista", "Pagamentos cadastrados", pagamentos.length]].map(([k, nome, n]) => (
            <button key={k} type="button" role="tab" aria-selected={aba === k} className={aba === k ? "ativa" : ""} onClick={() => setAba(k)}>{nome}{n != null && <b>{n}</b>}</button>))}
        </div>
        {aba === "mes" && <Mes mes={mes} setMes={setMes} itens={itensMes} dia={dia} setDia={setDia} aoMarcar={marcar} />}
        {aba === "lista" && <Cadastrados pagamentos={pagamentos} aoEditar={editar} aoExcluir={excluir} aoNovo={novo} />}
      </section>
      {edit && <ModalPagamento edit={edit} setEdit={setEdit} aoSalvar={async (t) => { setAviso(t); await carregar(); }} />}
      {aviso && <div className="cal-aviso" role="status"><Ok /><span>{aviso}</span></div>}
    </div>
  );
}
