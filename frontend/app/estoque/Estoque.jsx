"use client";
// Estoque do administrativo: produtos (saldo da empresa), entradas/saídas (quem pegou e quando),
// pessoas (última vez que pegou) e pedidos (se a pessoa já pediu ou não).
import { useEffect, useMemo, useState } from "react";
import Modal from "../ui/Modal";
import { Lapis, Lixo, Mais, Ok, Fechar } from "../ui/Icones";
import { api, data, mensagemDeErro } from "../lib";

const hoje = () => new Date().toISOString().slice(0, 10);
const diasDesde = (iso) => (iso ? Math.round((new Date(hoje()) - new Date(iso)) / 86400000) : null);
const ha = (iso) => { const d = diasDesde(iso); return d == null ? "" : d === 0 ? "hoje" : d === 1 ? "ontem" : `há ${d} dias`; };
const STATUS = { PENDENTE: ["Pendente", "deb"], ATENDIDO: ["Atendido", "cred"], CANCELADO: ["Cancelado", ""] };
const Status = ({ s }) => <span className={"tipo " + STATUS[s][1]}>{STATUS[s][0]}</span>;

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

function Produtos({ produtos, aoMudar, aoMovimentar }) {
  const [edit, setEdit] = useState(null);
  const [busca, setBusca] = useState("");
  const [erro, setErro] = useState("");
  const b = busca.toLowerCase();
  const lista = produtos.filter((p) => !b || p.nome.toLowerCase().includes(b));
  const repor = produtos.filter((p) => p.ativo && p.saldo <= p.minimo).length;
  async function excluir(p) { setErro(""); try { await api(`/estoque/produtos/${p.id}`, { method: "DELETE" }); await aoMudar(); } catch (x) { setErro(mensagemDeErro(x)); } }
  return (
    <>
      <div className="filtros">
        <button type="button" className="btn primario" onClick={() => setEdit({ nome: "", unidade: "un", minimo: 0, ativo: true })}><Mais />Novo produto</button>
        <input className="busca-simples" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar produto" aria-label="Buscar produto" />
        <span className="contagem">{produtos.length} produtos{repor ? ` · ${repor} para repor` : ""}</span>
      </div>
      {erro && <p className="msg ruim">{erro}</p>}
      {lista.length ? (
        <div className="tabela-rolo alto"><table className="tabela">
          <thead><tr><th>Produto</th><th>Saldo</th><th>Mínimo</th><th /><th /></tr></thead>
          <tbody>{lista.map((p) => (
            <tr key={p.id} className={p.ativo ? "" : "mudo"}>
              <td><div className="ev-nome">{p.nome}</div>{!p.ativo && <small className="mudo">desativado</small>}</td>
              <td><b>{p.saldo}</b> {p.unidade}</td><td>{p.minimo}</td>
              <td>{p.ativo && p.saldo <= p.minimo && <span className="tipo deb">Repor</span>}</td>
              <td className="acoes">
                <button type="button" className="btn" onClick={() => aoMovimentar({ produto_id: p.id, tipo: "ENTRADA" })}>Entrada</button>
                <button type="button" className="btn" disabled={!p.saldo} onClick={() => aoMovimentar({ produto_id: p.id, tipo: "SAIDA" })}>Saída</button>
                <button type="button" className="icone" aria-label={`Editar ${p.nome}`} onClick={() => setEdit(p)}><Lapis /></button>
                <button type="button" className="icone perigo" aria-label={`Excluir ${p.nome}`} onClick={() => excluir(p)}><Lixo /></button></td>
            </tr>))}</tbody>
        </table></div>
      ) : <p className="vazio">{produtos.length ? "Nenhum produto bate com a busca." : "Nenhum produto cadastrado ainda."}</p>}
      {edit && <ModalProduto edit={edit} setEdit={setEdit} aoSalvar={aoMudar} />}
    </>
  );
}

// ---------- Saída / entrada ----------
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
        <ul role="listbox" style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 5, margin: "2px 0 0", padding: 4, listStyle: "none", background: "var(--painel)", border: "1px solid var(--linha)", borderRadius: "var(--raio)", boxShadow: "0 6px 18px rgba(0,0,0,.12)", maxHeight: 220, overflow: "auto" }}>
          {!exata && <li className="mudo" style={{ padding: "6px 8px", fontSize: 12.5 }}>É alguma dessas pessoas?</li>}
          {sugestoes.map((p) => (
            <li key={p.pessoa} role="option" aria-selected={p.pessoa === valor}>
              <button type="button" className="btn" style={{ width: "100%", justifyContent: "space-between", border: 0 }} onMouseDown={(e) => e.preventDefault()}
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
  const porPalavra = comum / Math.max(pa.length, pb.length);
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
        <ul id="sugestoes-produto" role="listbox" className="sugestoes-produto"
          style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 5, margin: "2px 0 0", padding: 4, listStyle: "none", background: "var(--painel)", border: "1px solid var(--linha)", borderRadius: "var(--raio)", boxShadow: "0 6px 18px rgba(0,0,0,.12)", maxHeight: 220, overflow: "auto" }}>
          {texto.trim() && !exato && <li className="mudo" style={{ padding: "6px 8px", fontSize: 12.5 }}>Parecidos com “{texto.trim()}”:</li>}
          {sugestoes.map((p) => (
            <li key={p.id} role="option" aria-selected={escolhido?.id === p.id}>
              <button type="button" className="btn" style={{ width: "100%", justifyContent: "space-between", border: 0 }} onMouseDown={(e) => e.preventDefault()} onClick={() => escolher(p)}>
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

function Movimentos({ movimentos, aoMudar, aoMovimentar }) {
  const [busca, setBusca] = useState("");
  const [erro, setErro] = useState("");
  const b = busca.toLowerCase();
  const lista = movimentos.filter((m) => !b || `${m.produto} ${m.pessoa || ""}`.toLowerCase().includes(b));
  async function desfazer(m) {
    if (!confirm(`Desfazer ${m.tipo === "SAIDA" ? "a saída" : "a entrada"} de ${m.quantidade} ${m.produto}?`)) return;
    setErro(""); try { await api(`/estoque/movimentos/${m.id}`, { method: "DELETE" }); await aoMudar(); } catch (x) { setErro(mensagemDeErro(x)); }
  }
  return (
    <>
      <div className="filtros">
        <button type="button" className="btn primario" onClick={() => aoMovimentar({ tipo: "SAIDA" })}><Mais />Registrar saída</button>
        <button type="button" className="btn" onClick={() => aoMovimentar({ tipo: "ENTRADA" })}><Mais />Registrar entrada</button>
        <input className="busca-simples" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar produto ou pessoa" aria-label="Buscar movimento" />
        <span className="contagem">últimos {movimentos.length}</span>
      </div>
      {erro && <p className="msg ruim">{erro}</p>}
      {lista.length ? (
        <div className="tabela-rolo alto"><table className="tabela">
          <thead><tr><th>Data</th><th>Tipo</th><th>Produto</th><th>Qtd.</th><th>Quem pegou</th><th>Obs.</th><th /></tr></thead>
          <tbody>{lista.map((m) => (
            <tr key={m.id}><td>{data(m.data)}</td>
              <td><span className={"tipo " + (m.tipo === "SAIDA" ? "deb" : "cred")}>{m.tipo === "SAIDA" ? "Saída" : "Entrada"}</span></td>
              <td>{m.produto}</td><td>{m.quantidade} {m.unidade}</td><td>{m.pessoa || <span className="mudo">—</span>}</td>
              <td className="mudo">{m.observacao}</td>
              <td className="acoes"><button type="button" className="icone perigo" aria-label="Desfazer" title="Desfazer" onClick={() => desfazer(m)}><Lixo /></button></td></tr>))}</tbody>
        </table></div>
      ) : <p className="vazio">Nenhum movimento ainda.</p>}
    </>
  );
}

// ---------- Pessoas ----------
function Pessoas({ pessoas, aoMudar }) {
  const [nome, setNome] = useState("");
  const [ficha, setFicha] = useState(null);
  const [erro, setErro] = useState("");
  async function consultar(n) {
    const alvo = (n ?? nome).trim(); if (!alvo) return;
    setErro(""); setNome(alvo);
    try { setFicha(await api(`/estoque/pessoas/${encodeURIComponent(alvo)}`)); } catch (x) { setErro(mensagemDeErro(x)); }
  }
  const r = ficha?.resumo;
  const pendentes = ficha?.pedidos.filter((p) => p.status === "PENDENTE") || [];
  return (
    <>
      <form className="filtros" onSubmit={(e) => { e.preventDefault(); consultar(); }}>
        <span className="busca-simples" style={{ padding: 0, border: 0 }}><CampoPessoa valor={nome} aoMudar={setNome} pessoas={pessoas} aviso={false} placeholder="Nome da pessoa" aria-label="Nome da pessoa" /></span>
        <button type="submit" className="btn primario">Consultar</button>
        <span className="contagem">{pessoas.length} pessoas</span>
      </form>
      {erro && <p className="msg ruim">{erro}</p>}
      {ficha && (
        <div className="problema" style={{ marginBottom: 16 }}>
          <div className="problema-txt"><b>{ficha.pessoa}</b>
            {!ficha.existe ? <p>Essa pessoa nunca pegou nem pediu nada.</p> : <>
              <p>{r.ultima_retirada ? <>Última vez que pegou: <b>{data(r.ultima_retirada)}</b> ({ha(r.ultima_retirada)}) · {r.ultimo_produto} · {r.retiradas} retirada(s) no total</> : "Nunca pegou nada."}</p>
              <p className={pendentes.length ? "msg ruim" : "msg ok"}>{pendentes.length
                ? <>Já pediu e está esperando: {pendentes.map((p) => `${p.quantidade}× ${p.produto} (${data(p.data_pedido)})`).join(", ")}</>
                : "Nenhum pedido pendente."}</p></>}
          </div>
          {ficha.retiradas.length > 0 && (
            <div className="tabela-rolo"><table className="tabela">
              <thead><tr><th>Data</th><th>Produto</th><th>Qtd.</th><th>Obs.</th></tr></thead>
              <tbody>{ficha.retiradas.map((m) => <tr key={m.id}><td>{data(m.data)}</td><td>{m.produto}</td><td>{m.quantidade} {m.unidade}</td><td className="mudo">{m.observacao}</td></tr>)}</tbody>
            </table></div>)}
        </div>)}
      {pessoas.length ? (
        <div className="tabela-rolo alto"><table className="tabela">
          <thead><tr><th>Pessoa</th><th>Última retirada</th><th>Último produto</th><th>Retiradas</th><th>Pedidos</th></tr></thead>
          <tbody>{pessoas.map((p) => (
            <tr key={p.pessoa} style={{ cursor: "pointer" }} onClick={() => consultar(p.pessoa)}>
              <td><div className="ev-nome">{p.pessoa}</div></td>
              <td>{p.ultima_retirada ? <>{data(p.ultima_retirada)} <small className="mudo">{ha(p.ultima_retirada)}</small></> : <span className="mudo">nunca</span>}</td>
              <td>{p.ultimo_produto || ""}</td><td>{p.retiradas}</td>
              <td>{p.pendentes ? <span className="tipo deb">{p.pendentes} pendente(s)</span> : <span className="mudo">{p.ultimo_pedido ? "nada pendente" : "nunca pediu"}</span>}</td></tr>))}</tbody>
        </table></div>
      ) : <p className="vazio">Ninguém pegou nem pediu nada ainda.</p>}
    </>
  );
}

// ---------- Pedidos ----------
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

function Pedidos({ pedidos, produtos, pessoas, aoMudar }) {
  const [ped, setPed] = useState(null);
  const [filtro, setFiltro] = useState("PENDENTE");
  const [erro, setErro] = useState("");
  const lista = pedidos.filter((p) => !filtro || p.status === filtro);
  async function acao(p, qual) {
    setErro("");
    try { await api(`/estoque/pedidos/${p.id}/${qual}`, { method: "POST", body: "{}" }); await aoMudar(); } catch (x) { setErro(mensagemDeErro(x)); }
  }
  async function excluir(p) { setErro(""); try { await api(`/estoque/pedidos/${p.id}`, { method: "DELETE" }); await aoMudar(); } catch (x) { setErro(mensagemDeErro(x)); } }
  return (
    <>
      <div className="filtros">
        <button type="button" className="btn primario" onClick={() => setPed({ pessoa: "", produto_id: "", descricao: "", quantidade: 1, data_pedido: hoje(), observacao: "" })}><Mais />Novo pedido</button>
        <select value={filtro} onChange={(e) => setFiltro(e.target.value)} aria-label="Status">
          <option value="PENDENTE">Pendentes</option><option value="ATENDIDO">Atendidos</option><option value="CANCELADO">Cancelados</option><option value="">Todos</option></select>
        <span className="contagem">{lista.length} pedido(s)</span>
      </div>
      {erro && <p className="msg ruim">{erro}</p>}
      {lista.length ? (
        <div className="tabela-rolo alto"><table className="tabela">
          <thead><tr><th>Pedido em</th><th>Quem pediu</th><th>O quê</th><th>Qtd.</th><th>Status</th><th /></tr></thead>
          <tbody>{lista.map((p) => (
            <tr key={p.id}><td>{data(p.data_pedido)} <small className="mudo">{ha(p.data_pedido)}</small></td><td>{p.pessoa}</td>
              <td>{p.produto}{!p.produto_id && <small className="mudo"> · não cadastrado</small>}{p.observacao && <div className="mudo">{p.observacao}</div>}</td>
              <td>{p.quantidade}</td><td><Status s={p.status} />{p.data_atendido && <small className="mudo"> {data(p.data_atendido)}</small>}</td>
              <td className="acoes">{p.status === "PENDENTE" && <>
                <button type="button" className="btn" title={p.produto_id ? "Marca como atendido e lança a saída" : "Marca como atendido"} onClick={() => acao(p, "atender")}><Ok />Atender</button>
                <button type="button" className="icone" aria-label="Cancelar pedido" title="Cancelar pedido" onClick={() => acao(p, "cancelar")}><Fechar /></button></>}
                {p.status !== "ATENDIDO" && <button type="button" className="icone perigo" aria-label="Excluir pedido" onClick={() => excluir(p)}><Lixo /></button>}</td></tr>))}</tbody>
        </table></div>
      ) : <p className="vazio">Nenhum pedido aqui.</p>}
      {ped && <ModalPedido ped={ped} setPed={setPed} produtos={produtos} pessoas={pessoas} aoSalvar={aoMudar} />}
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
  const [erro, setErro] = useState("");
  async function carregar() {
    try {
      const [pr, mv, ps, pd] = await Promise.all([api("/estoque/produtos?todos=true"), api("/estoque/movimentos"), api("/estoque/pessoas"), api("/estoque/pedidos")]);
      setProdutos(pr); setMovimentos(mv); setPessoas(ps); setPedidos(pd); setErro("");
    } catch (x) { setErro(mensagemDeErro(x)); }
  }
  useEffect(() => { carregar(); }, []);
  const abrirMov = (m) => setMov({ produto_id: "", produto_nome: produtos.find((p) => p.id === m.produto_id)?.nome ?? "", unidade: "un", quantidade: 1, pessoa: "", data: hoje(), observacao: "", ...m });
  const pendentes = useMemo(() => pedidos.filter((p) => p.status === "PENDENTE").length, [pedidos]);
  const ABAS = [["produtos", "Produtos", produtos.length], ["movimentos", "Entradas e saídas", null], ["pessoas", "Pessoas", pessoas.length], ["pedidos", "Pedidos", pendentes || null]];
  return (
    <section className="painel">
      <div className="abas" role="tablist">
        {ABAS.map(([k, nome, n]) => <button key={k} type="button" role="tab" aria-selected={aba === k} className={aba === k ? "ativa" : ""} onClick={() => setAba(k)}>{nome}{n != null && <b>{n}</b>}</button>)}
      </div>
      {erro && <p className="msg ruim">{erro}</p>}
      {aba === "produtos" && <Produtos produtos={produtos} aoMudar={carregar} aoMovimentar={abrirMov} />}
      {aba === "movimentos" && <Movimentos movimentos={movimentos} aoMudar={carregar} aoMovimentar={abrirMov} />}
      {aba === "pessoas" && <Pessoas pessoas={pessoas} aoMudar={carregar} />}
      {aba === "pedidos" && <Pedidos pedidos={pedidos} produtos={produtos} pessoas={pessoas} aoMudar={carregar} />}
      {mov && <ModalMovimento mov={mov} setMov={setMov} produtos={produtos} pessoas={pessoas} aoSalvar={carregar} />}
    </section>
  );
}
