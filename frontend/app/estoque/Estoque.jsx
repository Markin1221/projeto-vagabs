"use client";
// Estoque do administrativo: ações rápidas no topo (alguém pegou / chegou produto / pedido), números do dia e abas
// em cartões: produtos (saldo), histórico (linha do tempo), pessoas (última vez que pegou) e pedidos (quem está esperando).
import { useEffect, useMemo, useState } from "react";
import Modal from "../ui/Modal";
import { Lapis, Lixo, Mais, Ok } from "../ui/Icones";
import { api, data, mensagemDeErro } from "../lib";
import "./estoque.css";

const hoje = () => new Date().toISOString().slice(0, 10);
const diasDesde = (iso) => (iso ? Math.round((new Date(hoje()) - new Date(iso)) / 86400000) : null);
const ha = (iso) => { const d = diasDesde(iso); return d == null ? "" : d === 0 ? "hoje" : d === 1 ? "ontem" : `há ${d} dias`; };

// ---------- Produtos ----------
function ModalProduto({ edit, setEdit, aoSalvar }) {
  const [erro, setErro] = useState("");
  const muda = (k) => (e) => setEdit({ ...edit, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });
  async function salvar(ev) {
    ev.preventDefault(); setErro("");
    try {
      const { id, saldo, ...corpo } = edit;
      await api(id ? `/estoque/produtos/${id}` : "/estoque/produtos", { method: id ? "PUT" : "POST", body: JSON.stringify({ ...corpo, minimo: Number(corpo.minimo) || 0 }) });
      setEdit(null); await aoSalvar();
    } catch (x) { setErro(mensagemDeErro(x)); }
  }
  return (
    <Modal titulo={edit.id ? "Editar produto" : "Novo produto"} onClose={() => setEdit(null)}
      rodape={<><button type="button" className="btn" onClick={() => setEdit(null)}>Cancelar</button><button type="submit" form="form-produto" className="btn primario">Salvar</button></>}>
      <form id="form-produto" className="form-modal" onSubmit={salvar}>
        <label>Nome<input value={edit.nome} onChange={muda("nome")} required autoFocus /></label>
        <label>Unidade <span className="dica-campo">un, cx, resma, pct…</span><input value={edit.unidade} onChange={muda("unidade")} /></label>
        <label>Estoque mínimo <span className="dica-campo">abaixo disso aparece “repor”</span><input type="number" min="0" value={edit.minimo} onChange={muda("minimo")} /></label>
        {edit.id && <label className="marca"><input type="checkbox" checked={edit.ativo} onChange={muda("ativo")} />Ativo</label>}
        {erro && <p className="msg ruim">{erro}</p>}
      </form>
    </Modal>
  );
}

// ---------- Campos com sugestão (produto e pessoa) ----------
// Mostra embaixo do nome quando a pessoa pegou pela última vez e se tem pedido pendente.
const PARTICULAS = new Set(["da", "de", "do", "das", "dos", "e"]);
// Igual à chave_pessoa do backend: "Joao Silva" e "JOÃO da silva" são a mesma pessoa.
const chavePessoa = (n) => norm(n).split(" ").filter((w) => w && !PARTICULAS.has(w)).join(" ");

// Mostra embaixo do nome quando a pessoa pegou pela última vez e se tem pedido pendente.
function AvisoPessoa({ nome, pessoas }) {
  const r = pessoas.find((p) => chavePessoa(p.pessoa) === chavePessoa(nome));
  if (!nome.trim()) return null;
  if (!r) return <small className="mudo">Pessoa nova: “{nome.trim()}” vai ser cadastrada.</small>;
  return (
    <small className={r.pendentes ? "msg ruim" : "mudo"}>
      {r.pessoa !== nome.trim() && <>Vai como <b>{r.pessoa}</b> · </>}
      {r.ultima_retirada ? <>Última retirada: {data(r.ultima_retirada)} ({ha(r.ultima_retirada)}) · {r.ultimo_produto}</> : "Nunca pegou nada."}
      {r.pendentes ? ` · ${r.pendentes} pedido(s) pendente(s)` : ""}
    </small>
  );
}

// Campo de nome que sugere as pessoas parecidas (erro de digitação, sem acento, nome pela metade).
function CampoPessoa({ valor, aoMudar, pessoas, aviso = true, ...resto }) {
  const [aberto, setAberto] = useState(false);
  const k = chavePessoa(valor);
  const exata = pessoas.find((p) => chavePessoa(p.pessoa) === k);
  const sugestoes = valor.trim()
    ? pessoas.map((p) => [p, parecido(valor, p.pessoa)]).filter(([, n]) => n >= 0.55).sort((x, y) => y[1] - x[1]).slice(0, 6).map(([p]) => p)
    : [];
  const mostrar = aberto && sugestoes.length > 0 && !(exata && exata.pessoa === valor.trim() && sugestoes.length === 1);
  return (
    <span style={{ position: "relative", display: "grid", gap: 4 }}>
      <input value={valor} onChange={(e) => { aoMudar(e.target.value); setAberto(true); }} onFocus={() => setAberto(true)}
        onBlur={() => setTimeout(() => setAberto(false), 150)} autoComplete="off" role="combobox" aria-expanded={mostrar} {...resto} />
      {mostrar && (
        <ul role="listbox" className="est-sugestoes">
          {!exata && <li className="mudo">É alguma dessas pessoas?</li>}
          {sugestoes.map((p) => (
            <li key={p.pessoa} role="option" aria-selected={p.pessoa === valor}>
              <button type="button" className="btn" onMouseDown={(e) => e.preventDefault()}
                onClick={() => { aoMudar(p.pessoa); setAberto(false); }}>
                <span>{p.pessoa}</span><small className="mudo">{p.ultima_retirada ? `pegou ${data(p.ultima_retirada)}` : "nunca pegou"}</small></button></li>))}
        </ul>)}
      {aviso && <AvisoPessoa nome={valor} pessoas={pessoas} />}
    </span>
  );
}

// Sem acento, minúsculo e sem espaço sobrando: "Caneta  Azúl" e "caneta azul" contam como o mesmo produto.
const norm = (s) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
function distancia(a, b) {
  const d = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let ant = d[0]; d[0] = i;
    for (let j = 1; j <= b.length; j++) { const t = d[j]; d[j] = Math.min(d[j] + 1, d[j - 1] + 1, ant + (a[i - 1] === b[j - 1] ? 0 : 1)); ant = t; }
  }
  return d[b.length];
}
// Nota de 0 a 1 de quanto o nome digitado parece com o produto (contém, palavras em comum ou erro de digitação).
function parecido(digitado, nome) {
  const a = norm(digitado), b = norm(nome);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (b.includes(a) || a.includes(b)) return 0.9;
  const pa = a.split(" "), pb = b.split(" ");
  const comum = pa.filter((w) => w.length > 2 && pb.some((x) => x.startsWith(w) || w.startsWith(x) || distancia(w, x) <= (w.length > 5 ? 2 : 1))).length;
  const porPalavra = comum / pa.length; // quanto do que foi digitado bate com o nome
  const porLetra = 1 - distancia(a, b) / Math.max(a.length, b.length);
  return Math.max(porPalavra * 0.85, porLetra);
}

// Campo de produto que sugere os parecidos. Se nada for escolhido, o texto vira um produto novo na hora de salvar.
function CampoProduto({ mov, setMov, produtos }) {
  const [aberto, setAberto] = useState(false);
  const escolhido = produtos.find((p) => p.id === Number(mov.produto_id));
  const texto = mov.produto_nome ?? "";
  const exato = produtos.find((p) => norm(p.nome) === norm(texto));
  const sugestoes = texto.trim() ? produtos.map((p) => [p, parecido(texto, p.nome)]).filter(([, n]) => n >= 0.55)
    .sort((x, y) => y[1] - x[1]).slice(0, 6).map(([p]) => p) : produtos.filter((p) => p.ativo).slice(0, 6);
  const escolher = (p) => { setMov({ ...mov, produto_id: p.id, produto_nome: p.nome, unidade: p.unidade }); setAberto(false); };
  function digitar(e) {
    const v = e.target.value, ex = produtos.find((p) => norm(p.nome) === norm(v));
    setMov({ ...mov, produto_nome: v, produto_id: ex ? ex.id : "" }); setAberto(true);
  }
  return (
    <label style={{ gridColumn: "1 / -1", position: "relative" }}>Produto <span className="dica-campo">escolha um ou digite um nome novo</span>
      <input value={texto} onChange={digitar} onFocus={() => setAberto(true)} onBlur={() => setTimeout(() => setAberto(false), 150)}
        placeholder="Ex.: Papel A4" required autoFocus autoComplete="off" role="combobox" aria-expanded={aberto} aria-controls="sugestoes-produto" />
      {aberto && sugestoes.length > 0 && !(escolhido && sugestoes.length === 1 && sugestoes[0].id === escolhido.id) && (
        <ul id="sugestoes-produto" role="listbox" className="est-sugestoes">
          {texto.trim() && !exato && <li className="mudo">Parecidos com “{texto.trim()}”:</li>}
          {sugestoes.map((p) => (
            <li key={p.id} role="option" aria-selected={escolhido?.id === p.id}>
              <button type="button" className="btn" onMouseDown={(e) => e.preventDefault()} onClick={() => escolher(p)}>
                <span>{p.nome}{!p.ativo && <small className="mudo"> · desativado</small>}</span><small className="mudo">{p.saldo} {p.unidade}</small></button></li>))}
        </ul>)}
      {escolhido ? <small className="mudo">Saldo atual: {escolhido.saldo} {escolhido.unidade}</small>
        : texto.trim() && <small className="msg ok">Produto novo: “{texto.trim()}” vai ser cadastrado ao registrar.</small>}
    </label>
  );
}

function ModalMovimento({ mov, setMov, produtos, pessoas, aoSalvar }) {
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const muda = (k) => (e) => setMov({ ...mov, [k]: e.target.value });
  const saida = mov.tipo === "SAIDA";
  const prod = produtos.find((p) => p.id === Number(mov.produto_id));
  const novo = !saida && !prod && (mov.produto_nome || "").trim();
  async function salvar(ev) {
    ev.preventDefault(); setErro(""); setSalvando(true);
    try {
      let pid = prod?.id;
      if (!pid && novo) pid = (await api("/estoque/produtos", { method: "POST", body: JSON.stringify({ nome: novo, unidade: (mov.unidade || "").trim() || "un", minimo: 0 }) })).id;
      if (!pid) throw new Error("Escolha o produto");
      await api("/estoque/movimentos", { method: "POST", body: JSON.stringify({ tipo: mov.tipo, produto_id: pid, quantidade: Number(mov.quantidade), data: mov.data, observacao: mov.observacao, pessoa: saida ? mov.pessoa : null }) });
      setMov(null); await aoSalvar();
    } catch (x) { setErro(mensagemDeErro(x)); setSalvando(false); }
  }
  return (
    <Modal titulo={saida ? "Saída — alguém pegou" : "Entrada no estoque"} subtitulo={prod ? `${prod.nome} · saldo ${prod.saldo} ${prod.unidade}` : ""} onClose={() => setMov(null)}
      rodape={<><button type="button" className="btn" onClick={() => setMov(null)}>Cancelar</button><button type="submit" form="form-mov" className="btn primario" disabled={salvando}>{salvando ? "Registrando…" : novo ? "Cadastrar e registrar" : "Registrar"}</button></>}>
      <form id="form-mov" className="form-modal" onSubmit={salvar}>
        {saida ? <label>Produto<select value={mov.produto_id} onChange={muda("produto_id")} required>
          <option value="">Escolha…</option>{produtos.filter((p) => p.ativo).map((p) => <option key={p.id} value={p.id}>{p.nome} ({p.saldo} {p.unidade})</option>)}</select></label>
          : <CampoProduto mov={mov} setMov={setMov} produtos={produtos} />}
        <label>Tipo<select value={mov.tipo} onChange={(e) => setMov({ ...mov, tipo: e.target.value, produto_nome: prod?.nome ?? mov.produto_nome })}><option value="SAIDA">Saída</option><option value="ENTRADA">Entrada</option></select></label>
        {novo && <label>Unidade do produto novo <span className="dica-campo">un, cx, resma…</span><input value={mov.unidade ?? "un"} onChange={muda("unidade")} /></label>}
        <label>Quantidade<input type="number" min="1" max={saida && prod ? prod.saldo : undefined} value={mov.quantidade} onChange={muda("quantidade")} required /></label>
        <label>Data<input type="date" value={mov.data} onChange={muda("data")} required /></label>
        {saida && <label style={{ gridColumn: "1 / -1" }}>Quem pegou<CampoPessoa valor={mov.pessoa} aoMudar={(v) => setMov({ ...mov, pessoa: v })} pessoas={pessoas} required autoFocus /></label>}
        <label style={{ gridColumn: "1 / -1" }}>Observação<input value={mov.observacao} onChange={muda("observacao")} /></label>
        {erro && <p className="msg ruim">{erro}</p>}
      </form>
    </Modal>
  );
}

// ---------- Modal de pedido ----------
function ModalPedido({ ped, setPed, produtos, pessoas, aoSalvar }) {
  const [erro, setErro] = useState("");
  const muda = (k) => (e) => setPed({ ...ped, [k]: e.target.value });
  async function salvar(ev) {
    ev.preventDefault(); setErro("");
    try {
      await api("/estoque/pedidos", { method: "POST", body: JSON.stringify({ ...ped, produto_id: ped.produto_id ? Number(ped.produto_id) : null, quantidade: Number(ped.quantidade) }) });
      setPed(null); await aoSalvar();
    } catch (x) { setErro(mensagemDeErro(x)); }
  }
  return (
    <Modal titulo="Novo pedido" subtitulo="Fica pendente até você marcar como atendido." onClose={() => setPed(null)}
      rodape={<><button type="button" className="btn" onClick={() => setPed(null)}>Cancelar</button><button type="submit" form="form-ped" className="btn primario">Salvar pedido</button></>}>
      <form id="form-ped" className="form-modal" onSubmit={salvar}>
        <label>Quem pediu<CampoPessoa valor={ped.pessoa} aoMudar={(v) => setPed({ ...ped, pessoa: v })} pessoas={pessoas} required autoFocus /></label>
        <label>Produto<select value={ped.produto_id} onChange={muda("produto_id")}>
          <option value="">Não está cadastrado (descrever)</option>{produtos.filter((p) => p.ativo).map((p) => <option key={p.id} value={p.id}>{p.nome} ({p.saldo} {p.unidade})</option>)}</select></label>
        {!ped.produto_id && <label>O que pediu<input value={ped.descricao} onChange={muda("descricao")} required /></label>}
        <label>Quantidade<input type="number" min="1" value={ped.quantidade} onChange={muda("quantidade")} required /></label>
        <label>Data do pedido<input type="date" value={ped.data_pedido} onChange={muda("data_pedido")} required /></label>
        <label style={{ gridColumn: "1 / -1" }}>Observação<input value={ped.observacao} onChange={muda("observacao")} /></label>
        {erro && <p className="msg ruim">{erro}</p>}
      </form>
    </Modal>
  );
}

// ---------- peças visuais ----------
const SetaEntra = () => <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M8 13V3M4 7l4-4 4 4" /></svg>;
const SetaSai = () => <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M8 3v10M4 9l4 4 4-4" /></svg>;
const iniciais = (n) => n.split(" ").filter((w) => !PARTICULAS.has(w.toLowerCase())).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
const Avatar = ({ nome }) => <span className="est-avatar" aria-hidden>{iniciais(nome)}</span>;
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
function rotuloDia(iso) {
  const d = diasDesde(iso);
  if (d === 0) return "Hoje";
  if (d === 1) return "Ontem";
  const dt = new Date(iso + "T12:00:00");
  const sem = dt.toLocaleDateString("pt-BR", { weekday: "long" });
  return d < 7 ? `${sem[0].toUpperCase()}${sem.slice(1)}, ${data(iso).slice(0, 5)}` : data(iso);
}
function Chips({ valor, aoMudar, opcoes, rotulo }) {
  return (
    <div className="est-chips" role="radiogroup" aria-label={rotulo}>
      {opcoes.map(([v, nome, n]) => (
        <button key={v} type="button" role="radio" aria-checked={valor === v} className={valor === v ? "ativo" : ""} onClick={() => aoMudar(v)}>
          {nome}{n != null && <span>{n}</span>}</button>))}
    </div>
  );
}
function Vazio({ titulo, texto, children }) {
  return <div className="est-vazio"><b>{titulo}</b>{texto && <p>{texto}</p>}{children}</div>;
}

// ---------- Produtos ----------
function Produtos({ produtos, aoMudar, aoMovimentar }) {
  const [edit, setEdit] = useState(null);
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState("ativos");
  const [erro, setErro] = useState("");
  const repor = (p) => p.ativo && p.saldo <= p.minimo;
  const nRepor = produtos.filter(repor).length;
  const lista = produtos
    .filter((p) => (filtro === "repor" ? repor(p) : filtro === "inativos" ? !p.ativo : p.ativo))
    .filter((p) => !busca.trim() || parecido(busca, p.nome) >= 0.55)
    .sort((a, b) => repor(b) - repor(a) || a.nome.localeCompare(b.nome));
  async function excluir(p) {
    if (!confirm(`Excluir o produto “${p.nome}”?`)) return;
    setErro(""); try { await api(`/estoque/produtos/${p.id}`, { method: "DELETE" }); await aoMudar(); } catch (x) { setErro(mensagemDeErro(x)); }
  }
  const novo = () => setEdit({ nome: busca.trim(), unidade: "un", minimo: 0, ativo: true });
  return (
    <>
      <div className="est-barra-ferr">
        <input className="est-busca" type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Procurar produto…" aria-label="Procurar produto" />
        <Chips rotulo="Filtrar produtos" valor={filtro} aoMudar={setFiltro} opcoes={[["ativos", "Todos", produtos.filter((p) => p.ativo).length], ["repor", "Para repor", nRepor], ["inativos", "Desativados", null]]} />
        <button type="button" className="btn" onClick={novo}><Mais />Cadastrar produto</button>
      </div>
      {erro && <p className="msg ruim">{erro}</p>}
      {lista.length ? (
        <div className="est-grade">{lista.map((p) => {
          const falta = repor(p);
          const cheio = p.minimo ? Math.min(1, p.saldo / (p.minimo * 3)) : null;
          return (
            <article key={p.id} className={"est-card" + (falta ? " falta" : "") + (p.ativo ? "" : " inativo")}>
              <header>
                <h3>{p.nome}</h3>
                <div className="est-card-menu">
                  <button type="button" className="icone" aria-label={`Editar ${p.nome}`} title="Editar" onClick={() => setEdit(p)}><Lapis /></button>
                  <button type="button" className="icone perigo" aria-label={`Excluir ${p.nome}`} title="Excluir" onClick={() => excluir(p)}><Lixo /></button>
                </div>
              </header>
              <div className="est-saldo"><b>{p.saldo}</b><span>{p.unidade}</span></div>
              {cheio != null && <div className="est-nivel" aria-hidden><i style={{ width: `${Math.max(cheio, 0.03) * 100}%` }} /></div>}
              <p className={"est-status" + (falta ? " ruim" : "")}>
                {!p.ativo ? "Desativado" : falta ? (p.saldo ? `Acabando · mínimo ${p.minimo}` : "Acabou") : p.minimo ? `Ok · mínimo ${p.minimo}` : "Sem mínimo definido"}</p>
              {p.ativo && (
                <footer>
                  <button type="button" className="btn" disabled={!p.saldo} onClick={() => aoMovimentar({ produto_id: p.id, tipo: "SAIDA" })}><SetaSai />Saída</button>
                  <button type="button" className="btn" onClick={() => aoMovimentar({ produto_id: p.id, tipo: "ENTRADA" })}><SetaEntra />Entrada</button>
                </footer>)}
            </article>);
        })}</div>
      ) : produtos.length ? (
        <Vazio titulo={busca ? `Nada parecido com “${busca}”` : "Nenhum produto aqui"} texto={busca ? "Confira a escrita ou cadastre o produto." : null}>
          {busca && <button type="button" className="btn primario" onClick={novo}><Mais />Cadastrar “{busca.trim()}”</button>}</Vazio>
      ) : (
        <Vazio titulo="O estoque está vazio" texto="Registre a primeira entrada: o produto é cadastrado na hora.">
          <button type="button" className="btn primario" onClick={() => aoMovimentar({ tipo: "ENTRADA" })}><SetaEntra />Chegou produto</button></Vazio>
      )}
      {edit && <ModalProduto edit={edit} setEdit={setEdit} aoSalvar={aoMudar} />}
    </>
  );
}

// ---------- Histórico (entradas e saídas) ----------
function Movimentos({ movimentos, aoMudar, aoMovimentar }) {
  const [busca, setBusca] = useState("");
  const [tipo, setTipo] = useState("");
  const [erro, setErro] = useState("");
  const b = norm(busca);
  const lista = movimentos.filter((m) => (!tipo || m.tipo === tipo) && (!b || norm(`${m.produto} ${m.pessoa || ""}`).includes(b)));
  const dias = lista.reduce((acc, m) => { (acc[m.data] ||= []).push(m); return acc; }, {});
  async function desfazer(m) {
    if (!confirm(`Desfazer ${m.tipo === "SAIDA" ? "a saída" : "a entrada"} de ${m.quantidade} ${m.unidade} de ${m.produto}? O saldo volta ao que era.`)) return;
    setErro(""); try { await api(`/estoque/movimentos/${m.id}`, { method: "DELETE" }); await aoMudar(); } catch (x) { setErro(mensagemDeErro(x)); }
  }
  return (
    <>
      <div className="est-barra-ferr">
        <input className="est-busca" type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Procurar produto ou pessoa…" aria-label="Procurar no histórico" />
        <Chips rotulo="Tipo" valor={tipo} aoMudar={setTipo} opcoes={[["", "Tudo", null], ["SAIDA", "Saídas", null], ["ENTRADA", "Entradas", null]]} />
      </div>
      {erro && <p className="msg ruim">{erro}</p>}
      {lista.length ? Object.entries(dias).map(([dia, ms]) => (
        <section key={dia} className="est-dia">
          <h3>{rotuloDia(dia)}</h3>
          <ul className="est-feed">{ms.map((m) => {
            const sai = m.tipo === "SAIDA";
            return (
              <li key={m.id}>
                <span className={"est-feed-icone " + (sai ? "sai" : "entra")}>{sai ? <SetaSai /> : <SetaEntra />}</span>
                <div className="est-feed-txt">
                  <p>{sai ? <><b>{m.pessoa}</b> pegou <b>{m.quantidade} {m.unidade}</b> de {m.produto}</> : <>Entraram <b>{m.quantidade} {m.unidade}</b> de {m.produto}</>}</p>
                  {m.observacao && <small>{m.observacao}</small>}
                </div>
                <button type="button" className="icone perigo" aria-label="Desfazer" title="Desfazer" onClick={() => desfazer(m)}><Lixo /></button>
              </li>);
          })}</ul>
        </section>
      )) : movimentos.length ? <Vazio titulo="Nada encontrado" texto="Tente outro nome ou limpe o filtro." />
        : <Vazio titulo="Nenhuma movimentação ainda" texto="Tudo que entrar ou sair do estoque aparece aqui, do mais novo ao mais antigo.">
            <button type="button" className="btn primario" onClick={() => aoMovimentar({ tipo: "SAIDA" })}><SetaSai />Alguém pegou</button></Vazio>}
    </>
  );
}

// ---------- Pessoas ----------
function FichaPessoa({ nome, aoFechar, aoMovimentar, aoPedir }) {
  const [ficha, setFicha] = useState(null);
  const [erro, setErro] = useState("");
  useEffect(() => { api(`/estoque/pessoas/${encodeURIComponent(nome)}`).then(setFicha).catch((x) => setErro(mensagemDeErro(x))); }, [nome]);
  const r = ficha?.resumo;
  const pendentes = ficha?.pedidos.filter((p) => p.status === "PENDENTE") || [];
  return (
    <Modal titulo={ficha?.pessoa || nome} onClose={aoFechar}
      rodape={<><button type="button" className="btn" onClick={() => aoPedir(ficha?.pessoa || nome)}><Mais />Novo pedido</button>
        <button type="button" className="btn primario" onClick={() => aoMovimentar({ tipo: "SAIDA", pessoa: ficha?.pessoa || nome })}><SetaSai />Registrar que pegou</button></>}>
      {erro && <p className="msg ruim">{erro}</p>}
      {!ficha ? <p className="mudo"><span className="giro" /> Carregando…</p> : (
        <div className="est-ficha">
          <div className="est-ficha-numeros">
            <div><small>Última vez que pegou</small><b>{r.ultima_retirada ? ha(r.ultima_retirada) : "Nunca"}</b>{r.ultima_retirada && <span>{data(r.ultima_retirada)} · {r.ultimo_produto}</span>}</div>
            <div><small>Retiradas</small><b>{r.retiradas}</b></div>
            <div className={pendentes.length ? "ruim" : ""}><small>Pedidos esperando</small><b>{pendentes.length}</b></div>
          </div>
          {pendentes.length > 0 && (
            <div className="est-alerta"><b>Já pediu e está esperando</b>
              <ul>{pendentes.map((p) => <li key={p.id}>{p.quantidade}× {p.produto} <span className="mudo">· pediu {ha(p.data_pedido)}</span></li>)}</ul></div>)}
          <h4>Histórico</h4>
          {ficha.retiradas.length ? (
            <ul className="est-feed compacto">{ficha.retiradas.map((m) => (
              <li key={m.id}><span className="est-feed-icone sai"><SetaSai /></span>
                <div className="est-feed-txt"><p><b>{m.quantidade} {m.unidade}</b> de {m.produto}</p><small>{data(m.data)} · {ha(m.data)}{m.observacao ? ` · ${m.observacao}` : ""}</small></div></li>))}</ul>
          ) : <p className="mudo">Ainda não pegou nada.</p>}
        </div>)}
    </Modal>
  );
}

function Pessoas({ pessoas, aoAbrir }) {
  const [nome, setNome] = useState("");
  const [filtro, setFiltro] = useState("");
  const lista = pessoas
    .filter((p) => !filtro || p.pendentes > 0)
    .filter((p) => !nome.trim() || parecido(nome, p.pessoa) >= 0.55)
    .sort((a, b) => (b.ultima_retirada || "").localeCompare(a.ultima_retirada || "") || a.pessoa.localeCompare(b.pessoa));
  return (
    <>
      <form className="est-barra-ferr" onSubmit={(e) => { e.preventDefault(); if (nome.trim()) aoAbrir(nome.trim()); }}>
        <div className="est-busca-pessoa"><CampoPessoa valor={nome} aoMudar={setNome} pessoas={pessoas} aviso={false} className="est-busca" placeholder="Nome da pessoa…" aria-label="Nome da pessoa" /></div>
        <Chips rotulo="Filtrar pessoas" valor={filtro} aoMudar={setFiltro} opcoes={[["", "Todas", pessoas.length], ["pendentes", "Com pedido esperando", pessoas.filter((p) => p.pendentes).length]]} />
        <button type="submit" className="btn" disabled={!nome.trim()}>Ver ficha</button>
      </form>
      {lista.length ? (
        <div className="est-grade pessoas">{lista.map((p) => (
          <button key={p.pessoa} type="button" className="est-card est-pessoa" onClick={() => aoAbrir(p.pessoa)}>
            <Avatar nome={p.pessoa} />
            <div>
              <h3>{p.pessoa}</h3>
              <p>{p.ultima_retirada ? <>Pegou {ha(p.ultima_retirada)} · {p.ultimo_produto}</> : "Nunca pegou nada"}</p>
              {p.pendentes > 0 && <span className="tipo deb">{plural(p.pendentes, "pedido esperando", "pedidos esperando")}</span>}
            </div>
          </button>))}</div>
      ) : pessoas.length ? (
        <Vazio titulo={nome ? `Ninguém parecido com “${nome}”` : "Ninguém aqui"} texto={nome ? "Pode ser a primeira vez dessa pessoa." : null}>
          {nome && <button type="button" className="btn" onClick={() => aoAbrir(nome.trim())}>Ver ficha de “{nome.trim()}”</button>}</Vazio>
      ) : <Vazio titulo="Ninguém pegou nem pediu nada ainda" texto="As pessoas aparecem aqui na primeira saída ou pedido." />}
    </>
  );
}

// ---------- Pedidos ----------
function Pedidos({ pedidos, aoMudar, aoPedir, aoAbrirPessoa }) {
  const [filtro, setFiltro] = useState("PENDENTE");
  const [erro, setErro] = useState("");
  const conta = (s) => pedidos.filter((p) => p.status === s).length;
  const lista = pedidos.filter((p) => !filtro || p.status === filtro);
  async function acao(p, qual) {
    setErro("");
    try { await api(`/estoque/pedidos/${p.id}/${qual}`, { method: "POST", body: "{}" }); await aoMudar(); } catch (x) { setErro(mensagemDeErro(x)); }
  }
  async function excluir(p) {
    if (!confirm(`Excluir o pedido de ${p.pessoa}?`)) return;
    setErro(""); try { await api(`/estoque/pedidos/${p.id}`, { method: "DELETE" }); await aoMudar(); } catch (x) { setErro(mensagemDeErro(x)); }
  }
  return (
    <>
      <div className="est-barra-ferr">
        <Chips rotulo="Status" valor={filtro} aoMudar={setFiltro} opcoes={[["PENDENTE", "Esperando", conta("PENDENTE")], ["ATENDIDO", "Atendidos", conta("ATENDIDO")], ["CANCELADO", "Cancelados", conta("CANCELADO")], ["", "Todos", null]]} />
        <button type="button" className="btn" onClick={() => aoPedir("")}><Mais />Novo pedido</button>
      </div>
      {erro && <p className="msg ruim">{erro}</p>}
      {lista.length ? (
        <ul className="est-pedidos">{lista.map((p) => (
          <li key={p.id} className={"est-card est-pedido " + p.status.toLowerCase()}>
            <button type="button" className="est-pedido-quem" onClick={() => aoAbrirPessoa(p.pessoa)} title="Ver ficha"><Avatar nome={p.pessoa} /></button>
            <div className="est-pedido-txt">
              <p><b>{p.pessoa}</b> pediu <b>{p.quantidade}× {p.produto}</b>{!p.produto_id && <span className="chip">não cadastrado</span>}</p>
              <small>{p.status === "ATENDIDO" ? `Atendido ${ha(p.data_atendido)} · pedido em ${data(p.data_pedido)}` : p.status === "CANCELADO" ? `Cancelado · pedido em ${data(p.data_pedido)}` : `Esperando ${diasDesde(p.data_pedido) ? `há ${plural(diasDesde(p.data_pedido), "dia", "dias")}` : "desde hoje"} · ${data(p.data_pedido)}`}
                {p.observacao ? ` · ${p.observacao}` : ""}</small>
            </div>
            <div className="est-pedido-acoes">
              {p.status === "PENDENTE" && <>
                <button type="button" className="btn" onClick={() => acao(p, "cancelar")}>Cancelar</button>
                <button type="button" className="btn primario" title={p.produto_id ? "Marca como entregue e tira do estoque" : "Marca como entregue"} onClick={() => acao(p, "atender")}><Ok />Entregar</button></>}
              {p.status !== "ATENDIDO" && <button type="button" className="icone perigo" aria-label="Excluir pedido" title="Excluir" onClick={() => excluir(p)}><Lixo /></button>}
            </div>
          </li>))}</ul>
      ) : filtro === "PENDENTE" ? <Vazio titulo="Ninguém esperando" texto="Quando alguém pedir algo que não tem na hora, anote aqui para não esquecer.">
          <button type="button" className="btn primario" onClick={() => aoPedir("")}><Mais />Anotar pedido</button></Vazio>
        : <Vazio titulo="Nenhum pedido aqui" />}
    </>
  );
}

export default function Estoque() {
  const [aba, setAba] = useState("produtos");
  const [produtos, setProdutos] = useState([]);
  const [movimentos, setMovimentos] = useState([]);
  const [pessoas, setPessoas] = useState([]);
  const [pedidos, setPedidos] = useState([]);
  const [mov, setMov] = useState(null);
  const [ped, setPed] = useState(null);
  const [ficha, setFicha] = useState(null);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(true);
  async function carregar() {
    try {
      const [pr, mv, ps, pd] = await Promise.all([api("/estoque/produtos?todos=true"), api("/estoque/movimentos"), api("/estoque/pessoas"), api("/estoque/pedidos")]);
      setProdutos(pr); setMovimentos(mv); setPessoas(ps); setPedidos(pd); setErro("");
    } catch (x) { setErro(mensagemDeErro(x)); }
    setCarregando(false);
  }
  useEffect(() => { carregar(); }, []);
  const abrirMov = (m) => { setFicha(null); setMov({ produto_id: "", produto_nome: produtos.find((p) => p.id === m.produto_id)?.nome ?? "", unidade: "un", quantidade: 1, pessoa: "", data: hoje(), observacao: "", ...m }); };
  const abrirPedido = (pessoa) => { setFicha(null); setPed({ pessoa: pessoa || "", produto_id: "", descricao: "", quantidade: 1, data_pedido: hoje(), observacao: "" }); };
  const pendentes = useMemo(() => pedidos.filter((p) => p.status === "PENDENTE").length, [pedidos]);
  const repor = produtos.filter((p) => p.ativo && p.saldo <= p.minimo).length;
  const mes = hoje().slice(0, 7);
  const saidasMes = movimentos.filter((m) => m.tipo === "SAIDA" && m.data.startsWith(mes)).reduce((t, m) => t + m.quantidade, 0);
  const ABAS = [["produtos", "Produtos"], ["movimentos", "Histórico"], ["pessoas", "Pessoas"], ["pedidos", "Pedidos", pendentes || null]];
  const Numero = ({ alvo, rotulo, valor, detalhe, alerta }) => (
    <button type="button" className={"est-numero" + (alerta ? " alerta" : "")} onClick={() => setAba(alvo)}>
      <small>{rotulo}</small><b>{valor}</b><span>{detalhe}</span></button>
  );
  return (
    <div className="est">
      <div className="est-acoes">
        <button type="button" className="est-acao principal" onClick={() => abrirMov({ tipo: "SAIDA" })}><span><SetaSai /></span><b>Alguém pegou</b><small>Registrar saída</small></button>
        <button type="button" className="est-acao" onClick={() => abrirMov({ tipo: "ENTRADA" })}><span><SetaEntra /></span><b>Chegou produto</b><small>Registrar entrada</small></button>
        <button type="button" className="est-acao" onClick={() => abrirPedido("")}><span><Mais /></span><b>Anotar pedido</b><small>Alguém pediu algo</small></button>
      </div>
      <div className="est-numeros">
        <Numero alvo="produtos" rotulo="Produtos" valor={produtos.filter((p) => p.ativo).length} detalhe={repor ? plural(repor, "para repor", "para repor") : "nenhum acabando"} alerta={repor > 0} />
        <Numero alvo="pedidos" rotulo="Pedidos esperando" valor={pendentes} detalhe={pendentes ? "toque para ver" : "tudo entregue"} alerta={pendentes > 0} />
        <Numero alvo="movimentos" rotulo="Saídas este mês" valor={saidasMes} detalhe="itens entregues" />
        <Numero alvo="pessoas" rotulo="Pessoas" valor={pessoas.length} detalhe="já pegaram ou pediram" />
      </div>
      <section className="painel est-painel">
        <div className="abas" role="tablist">
          {ABAS.map(([k, nome, n]) => <button key={k} type="button" role="tab" aria-selected={aba === k} className={aba === k ? "ativa" : ""} onClick={() => setAba(k)}>{nome}{n != null && <b>{n}</b>}</button>)}
        </div>
        {erro && <p className="msg ruim">{erro}</p>}
        {carregando ? <p className="mudo"><span className="giro" /> Carregando o estoque…</p> : <>
          {aba === "produtos" && <Produtos produtos={produtos} aoMudar={carregar} aoMovimentar={abrirMov} />}
          {aba === "movimentos" && <Movimentos movimentos={movimentos} aoMudar={carregar} aoMovimentar={abrirMov} />}
          {aba === "pessoas" && <Pessoas pessoas={pessoas} aoAbrir={setFicha} />}
          {aba === "pedidos" && <Pedidos pedidos={pedidos} aoMudar={carregar} aoPedir={abrirPedido} aoAbrirPessoa={setFicha} />}
        </>}
      </section>
      {ficha && <FichaPessoa nome={ficha} aoFechar={() => setFicha(null)} aoMovimentar={abrirMov} aoPedir={abrirPedido} />}
      {mov && <ModalMovimento mov={mov} setMov={setMov} produtos={produtos} pessoas={pessoas} aoSalvar={carregar} />}
      {ped && <ModalPedido ped={ped} setPed={setPed} produtos={produtos} pessoas={pessoas} aoSalvar={carregar} />}
    </div>
  );
}
