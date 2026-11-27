"use client";
// Estoque do administrativo: ações rápidas no topo (alguém pegou / chegou produto / pedido), números do dia e abas
// em cartões: produtos (saldo), histórico (linha do tempo), pessoas (última vez que pegou) e pedidos (quem está esperando).
import { useEffect, useMemo, useState } from "react";
import Modal from "../ui/Modal";
import { Lapis, Lixo, Mais, Ok } from "../ui/Icones";
import { api, data, mensagemDeErro } from "../lib";
import "./estoque.css";

const isoLocal = (d) => { const x = new Date(d); x.setMinutes(x.getMinutes() - x.getTimezoneOffset()); return x.toISOString().slice(0, 10); };
const hoje = () => isoLocal(new Date());
const ontem = () => isoLocal(Date.now() - 864e5);
const diasDesde = (iso) => (iso ? Math.round((new Date(hoje()) - new Date(iso)) / 86400000) : null);
const ha = (iso) => { const d = diasDesde(iso); return d == null ? "" : d === 0 ? "hoje" : d === 1 ? "ontem" : `há ${d} dias`; };

// ---------- Produtos ----------
const MODELOS_TAMANHO = [["Roupa", ["PP", "P", "M", "G", "GG", "XG"]], ["Calçado", ["34", "35", "36", "37", "38", "39", "40", "41", "42", "43", "44"]], ["Calça", ["36", "38", "40", "42", "44", "46", "48"]]];

// Lista de tamanhos do produto: digita e Enter (ou vírgula), ou usa um modelo pronto. Tamanho com estoque não sai.
function EditorTamanhos({ lista, aoMudar, saldos }) {
  const [txt, setTxt] = useState("");
  const add = (v) => {
    const novos = v.split(/[,;]/).map((x) => x.trim().toUpperCase()).filter(Boolean);
    aoMudar([...lista, ...novos.filter((n) => !lista.includes(n))]); setTxt("");
  };
  return (
    <div className="est-editor-tams">
      <div className="est-tags">
        {lista.map((t) => (
          <span key={t} className="est-tag"><b>{t}</b>{saldos[t] ? <small>{saldos[t]}</small> : null}
            <button type="button" aria-label={`Tirar tamanho ${t}`} disabled={!!saldos[t]} title={saldos[t] ? "Tem estoque nesse tamanho" : "Tirar"}
              onClick={() => aoMudar(lista.filter((x) => x !== t))}>×</button></span>))}
        <input value={txt} onChange={(e) => (/[,;]$/.test(e.target.value) ? add(e.target.value) : setTxt(e.target.value))} placeholder={lista.length ? "Mais um…" : "Ex.: P, M, G ou 38, 40"}
          aria-label="Adicionar tamanho" onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (txt.trim()) add(txt); } if (e.key === "Backspace" && !txt && lista.length && !saldos[lista.at(-1)]) aoMudar(lista.slice(0, -1)); }}
          onBlur={() => txt.trim() && add(txt)} />
      </div>
      <div className="est-modelos"><span className="mudo">Modelos:</span>
        {MODELOS_TAMANHO.map(([nome, ts]) => <button key={nome} type="button" className="btn" onClick={() => aoMudar([...lista, ...ts.filter((t) => !lista.includes(t))])}>{nome}</button>)}</div>
    </div>
  );
}

function ModalProduto({ edit, setEdit, aoSalvar }) {
  const [erro, setErro] = useState("");
  const saldos = Object.fromEntries((edit.tamanhos || []).map((t) => [t.tamanho, t.saldo]));
  const [tams, setTams] = useState((edit.tamanhos || []).map((t) => t.tamanho));
  const [comTam, setComTam] = useState(tams.length > 0);
  const muda = (k) => (e) => setEdit({ ...edit, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });
  const semTamComSaldo = !(edit.tamanhos || []).length && edit.saldo > 0;
  async function salvar(ev) {
    ev.preventDefault(); setErro("");
    try {
      if (comTam && !tams.length) throw new Error("Coloque pelo menos um tamanho, ou desmarque “Tem tamanhos”.");
      const corpo = { nome: edit.nome, unidade: edit.unidade, minimo: Number(edit.minimo) || 0, ativo: edit.ativo ?? true, tamanhos: comTam ? tams : [] };
      await api(edit.id ? `/estoque/produtos/${edit.id}` : "/estoque/produtos", { method: edit.id ? "PUT" : "POST", body: JSON.stringify(corpo) });
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
        <div className="est-sec-tams">
          <label className="marca"><input type="checkbox" checked={comTam} disabled={semTamComSaldo || Object.values(saldos).some(Boolean)} onChange={(e) => setComTam(e.target.checked)} />
Tem tamanhos</label>
          <small className="mudo">Para camiseta P/M/G, bota 38/40… O estoque fica separado por tamanho e o total é a soma.</small>
          {semTamComSaldo && <small className="mudo">Tem {edit.saldo} {edit.unidade} sem tamanho no estoque. Para separar por tamanho, zere o estoque dele antes.</small>}
          {comTam && <EditorTamanhos lista={tams} aoMudar={setTams} saldos={saldos} />}
        </div>
        {erro && <p className="msg ruim" role="alert">{erro}</p>}
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
        onBlur={() => setTimeout(() => setAberto(false), 150)} autoComplete="off" role="combobox" aria-expanded={mostrar} {...resto}
        onKeyDown={(e) => {
          if (!mostrar) return;
          if (e.key === "Escape") { e.stopPropagation(); setAberto(false); }           // fecha a lista, não o modal
          if (e.key === "Enter" && sugestoes[0] && sugestoes[0].pessoa !== valor) { e.preventDefault(); aoMudar(sugestoes[0].pessoa); setAberto(false); }
        }} />
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
        placeholder="Ex.: Papel A4" required autoFocus autoComplete="off" role="combobox" aria-expanded={aberto} aria-controls="sugestoes-produto"
        onKeyDown={(e) => {
          if (e.key === "Escape" && aberto) { e.stopPropagation(); setAberto(false); }
          if (e.key === "Enter" && aberto && !escolhido && texto.trim() && sugestoes[0]) { e.preventDefault(); escolher(sugestoes[0]); }
        }} />
      {aberto && sugestoes.length > 0 && !(escolhido && sugestoes.length === 1 && sugestoes[0].id === escolhido.id) && (
        <ul id="sugestoes-produto" role="listbox" className="est-sugestoes">
          {texto.trim() && !exato && <li className="mudo">Parecidos com “{texto.trim()}”:</li>}
          {sugestoes.map((p) => (
            <li key={p.id} role="option" aria-selected={escolhido?.id === p.id}>
              <button type="button" className="btn" onMouseDown={(e) => e.preventDefault()} onClick={() => escolher(p)}>
                <span>{p.nome}{!p.ativo && <small className="mudo"> · desativado</small>}</span><small className="mudo">{p.saldo} {p.unidade}</small></button></li>))}
        </ul>)}
      {escolhido ? <small className="mudo">Saldo atual: {escolhido.saldo} {escolhido.unidade}</small>
        : texto.trim() && (sugestoes.length && texto.trim()
          ? <small className="est-dica-aviso">Não achei igual. Se for <b>{sugestoes[0].nome}</b>, escolha na lista (ou Enter); senão vira produto novo “{texto.trim()}”.</small>
          : <small className="msg ok">Produto novo: “{texto.trim()}” vai ser cadastrado ao registrar.</small>)}
    </label>
  );
}

// ---------- Campos de formulário reaproveitados ----------
// Quantidade com − e +: dá para ajustar sem digitar (e funciona bem no dedo).
function Qtd({ valor, aoMudar, max, rotulo = "Quantidade" }) {
  const n = Number(valor) || 0;
  return (
    <div className="est-qtd" role="group" aria-label={rotulo}>
      <button type="button" aria-label="Menos um" disabled={n <= 1} onClick={() => aoMudar(Math.max(1, n - 1))}>−</button>
      <input type="number" inputMode="numeric" min="1" max={max} value={valor} onChange={(e) => aoMudar(e.target.value)} aria-label={rotulo} required />
      <button type="button" aria-label="Mais um" disabled={max != null && n >= max} onClick={() => aoMudar(n + 1)}>+</button>
    </div>
  );
}

// Data com atalhos Hoje / Ontem (o caso de quase sempre) e o calendário para o resto.
function CampoData({ valor, aoMudar }) {
  const atalho = valor === hoje() ? "h" : valor === ontem() ? "o" : "";
  return (
    <div className="est-data">
      <Chips rotulo="Data" valor={atalho} aoMudar={(v) => aoMudar(v === "o" ? ontem() : hoje())} opcoes={[["h", "Hoje", null], ["o", "Ontem", null]]} />
      <input type="date" value={valor} max={hoje()} onChange={(e) => aoMudar(e.target.value)} aria-label="Outra data" required />
    </div>
  );
}

// Escolher um produto cadastrado digitando (sugere os parecidos). `soComSaldo` bloqueia os que acabaram (saída);
// `aoTexto` recebe o que foi digitado quando não é um produto da lista (pedido de algo não cadastrado).
function EscolherProduto({ id, aoEscolher, aoTexto, produtos, soComSaldo, autoFocus }) {
  const escolhido = produtos.find((p) => p.id === id);
  const [texto, setTexto] = useState(escolhido?.nome || "");
  const [aberto, setAberto] = useState(false);
  const disp = produtos.filter((p) => p.ativo);
  const busca = texto.trim() && texto !== escolhido?.nome;
  const sugestoes = (busca ? disp.map((p) => [p, parecido(texto, p.nome)]).filter(([, n]) => n >= 0.5).sort((a, b) => b[1] - a[1]).map(([p]) => p) : disp).slice(0, 8);
  const pode = (p) => !soComSaldo || p.saldo > 0;
  function escolher(p) { setTexto(p.nome); aoEscolher(p.id); aoTexto?.(""); setAberto(false); }
  function digitar(e) {
    const v = e.target.value, ex = disp.find((p) => norm(p.nome) === norm(v) && pode(p));
    setTexto(v); aoEscolher(ex ? ex.id : ""); aoTexto?.(ex ? "" : v); setAberto(true);
  }
  return (
    <span className="est-escolher">
      <input value={texto} onChange={digitar} placeholder="Qual produto?" autoComplete="off" role="combobox" aria-expanded={aberto} aria-label="Produto" autoFocus={autoFocus}
        onFocus={() => setAberto(true)} onBlur={() => setTimeout(() => setAberto(false), 150)}
        onKeyDown={(e) => {
          if (e.key === "Escape" && aberto) { e.stopPropagation(); setAberto(false); }
          const p = sugestoes.find(pode); if (e.key === "Enter" && aberto && busca && p) { e.preventDefault(); escolher(p); }
        }} />
      {aberto && sugestoes.length > 0 && (
        <ul className="est-sugestoes" role="listbox">
          {busca && !aoTexto && !escolhido && <li className="mudo">Escolha da lista:</li>}
          {sugestoes.map((p) => (
            <li key={p.id} role="option" aria-selected={p.id === id}>
              <button type="button" className="btn" disabled={!pode(p)} onMouseDown={(e) => e.preventDefault()} onClick={() => escolher(p)}>
                <span>{p.nome}</span><small className={p.saldo ? "mudo" : "msg ruim"}>{p.saldo ? `${p.saldo} ${p.unidade}` : "acabou"}</small></button></li>))}
        </ul>)}
    </span>
  );
}

// Botões de tamanho com o estoque de cada um. `soComSaldo` bloqueia os zerados (saída); `outro` deixa digitar um novo (entrada).
function EscolherTamanho({ produto, valor, aoMudar, soComSaldo, outro }) {
  const tams = produto?.tamanhos || [];
  const ehOutro = !!valor && !tams.some((t) => t.tamanho === valor);
  return (
    <div className="est-tams" role="radiogroup" aria-label={`Tamanho${produto ? ` de ${produto.nome}` : ""}`}>
      {tams.map((t) => (
        <button key={t.tamanho} type="button" role="radio" aria-checked={valor === t.tamanho} className={valor === t.tamanho ? "ativo" : ""}
          disabled={soComSaldo && !t.saldo} title={`${t.saldo} no estoque`} onClick={() => aoMudar(valor === t.tamanho ? "" : t.tamanho)}>
          <b>{t.tamanho}</b><small>{t.saldo}</small></button>))}
      {outro && <input className={"est-tam-outro" + (ehOutro ? " ativo" : "")} value={ehOutro ? valor : ""} onChange={(e) => aoMudar(e.target.value.toUpperCase())}
        placeholder={tams.length ? "Outro" : "Ex.: M, 40"} aria-label="Outro tamanho" />}
    </div>
  );
}

let seqItem = 0;
const novoItem = (produto_id = "") => ({ chave: ++seqItem, produto_id, tamanho: "", quantidade: 1 });
const comTamanho = (p) => !!p?.tamanhos?.length;
const saldoDe = (p, tamanho) => (comTamanho(p) ? p.tamanhos.find((t) => t.tamanho === tamanho)?.saldo ?? 0 : p?.saldo ?? 0);
const TagTam = ({ t }) => (t ? <span className="est-tam-tag">{t}</span> : null);

// Saída: quem pegou + um ou vários produtos, registrados juntos (ou nada, se faltar algum).
function ModalSaida({ saida, setSaida, produtos, pessoas, aoSalvar }) {
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const { itens } = saida;
  const muda = (k, v) => setSaida({ ...saida, [k]: v });
  const setItem = (i, m) => muda("itens", itens.map((it, j) => (j === i ? { ...it, ...m } : it)));
  const prontos = itens.filter((it) => it.produto_id).length;
  async function salvar(ev) {
    ev.preventDefault(); setErro("");
    if (!prontos) return setErro("Escolha pelo menos um produto da lista.");
    if (prontos < itens.length) return setErro("Tem uma linha sem produto escolhido da lista. Escolha ou tire a linha.");
    const semTam = itens.map((it) => produtos.find((x) => x.id === it.produto_id)).find((p, i) => comTamanho(p) && !itens[i].tamanho);
    if (semTam) return setErro(`Escolha o tamanho de ${semTam.nome}.`);
    setSalvando(true);
    try {
      const movs = await api("/estoque/saidas", { method: "POST", body: JSON.stringify({ pessoa: saida.pessoa, data: saida.data, observacao: saida.observacao || null,
        itens: itens.map((it) => ({ produto_id: it.produto_id, tamanho: it.tamanho || null, quantidade: Number(it.quantidade) })) }) });
      setSaida(null);
      const oque = movs.length === 1 ? `${movs[0].quantidade} ${movs[0].unidade} de ${movs[0].produto}${movs[0].tamanho ? ` (${movs[0].tamanho})` : ""}` : plural(movs.length, "produto", "produtos");
      aoSalvar(`${movs[0].pessoa} pegou ${oque}`, async () => { for (const m of movs) await api(`/estoque/movimentos/${m.id}`, { method: "DELETE" }); });
    } catch (x) { setErro(mensagemDeErro(x)); setSalvando(false); }
  }
  return (
    <Modal titulo="Alguém pegou" subtitulo="Registre tudo o que a pessoa levou de uma vez." onClose={() => setSaida(null)}
      rodape={<><button type="button" className="btn" onClick={() => setSaida(null)}>Cancelar</button>
        <button type="submit" form="form-saida" className="btn primario" disabled={salvando}>{salvando ? "Registrando…" : prontos > 1 ? `Registrar ${prontos} produtos` : "Registrar saída"}</button></>}>
      <form id="form-saida" className="est-form" onSubmit={salvar}>
        <label className="est-campo"><span>Quem pegou</span><CampoPessoa valor={saida.pessoa} aoMudar={(v) => muda("pessoa", v)} pessoas={pessoas} required autoFocus={!saida.pessoa} /></label>
        <fieldset className="est-itens"><legend>O que pegou</legend>
          {itens.map((it, i) => {
            const p = produtos.find((x) => x.id === it.produto_id);
            const tem = p && (!comTamanho(p) || it.tamanho) ? saldoDe(p, it.tamanho) : null; // estoque do que foi escolhido
            return (
              <div key={it.chave} className="est-item">
                <EscolherProduto id={it.produto_id} aoEscolher={(id) => setItem(i, { produto_id: id, tamanho: "" })} produtos={produtos} soComSaldo
                  autoFocus={!!saida.pessoa && i === itens.length - 1 && !it.produto_id} />
                <Qtd valor={it.quantidade} aoMudar={(q) => setItem(i, { quantidade: q })} max={tem ?? undefined} />
                <button type="button" className="icone perigo" aria-label="Tirar este produto" title="Tirar" disabled={itens.length === 1}
                  onClick={() => muda("itens", itens.filter((_, j) => j !== i))}><Lixo /></button>
                {comTamanho(p) && <div className="est-item-tams"><span className="mudo">Tamanho:</span>
                  <EscolherTamanho produto={p} valor={it.tamanho} aoMudar={(t) => setItem(i, { tamanho: t })} soComSaldo /></div>}
                {tem != null && <small className={"est-item-aviso " + (Number(it.quantidade) > tem ? "msg ruim" : "mudo")}>
                  {Number(it.quantidade) > tem ? `Só tem ${tem} ${p.unidade}${it.tamanho ? ` no ${it.tamanho}` : ""}` : `Fica com ${tem - Number(it.quantidade)} ${p.unidade}${it.tamanho ? ` no ${it.tamanho}` : ""}`}</small>}
              </div>);
          })}
          <button type="button" className="btn est-mais-item" onClick={() => muda("itens", [...itens, novoItem()])}><Mais />Mais um produto</button>
        </fieldset>
        <div className="est-campo"><span>Quando</span><CampoData valor={saida.data} aoMudar={(v) => muda("data", v)} /></div>
        <label className="est-campo"><span>Observação <span className="dica-campo">opcional</span></span><input value={saida.observacao} onChange={(e) => muda("observacao", e.target.value)} /></label>
        {erro && <p className="msg ruim" role="alert">{erro}</p>}
      </form>
    </Modal>
  );
}

// Entrada: produto (escolhe ou cadastra na hora), quantidade e data.
function ModalMovimento({ mov, setMov, produtos, aoSalvar }) {
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const muda = (k, v) => setMov({ ...mov, [k]: v });
  const prod = produtos.find((p) => p.id === Number(mov.produto_id));
  const novo = !prod && (mov.produto_nome || "").trim();
  async function salvar(ev) {
    ev.preventDefault(); setErro(""); setSalvando(true);
    try {
      let pid = prod?.id;
      if (!pid && novo) pid = (await api("/estoque/produtos", { method: "POST", body: JSON.stringify({ nome: novo, unidade: (mov.unidade || "").trim() || "un", minimo: 0 }) })).id;
      if (!pid) throw new Error("Escolha ou digite o produto");
      if (comTamanho(prod) && !(mov.tamanho || "").trim()) throw new Error(`Escolha o tamanho de ${prod.nome} (ou digite um novo em “Outro”).`);
      const m = await api("/estoque/movimentos", { method: "POST", body: JSON.stringify({ tipo: "ENTRADA", produto_id: pid, tamanho: (mov.tamanho || "").trim() || null, quantidade: Number(mov.quantidade), data: mov.data, observacao: mov.observacao || null }) });
      setMov(null);
      aoSalvar(`Entraram ${m.quantidade} ${m.unidade} de ${m.produto}${m.tamanho ? ` (${m.tamanho})` : ""}${novo ? " · produto novo" : ""}`, () => api(`/estoque/movimentos/${m.id}`, { method: "DELETE" }));
    } catch (x) { setErro(mensagemDeErro(x)); setSalvando(false); }
  }
  return (
    <Modal titulo="Chegou produto" subtitulo={prod ? `${prod.nome} · tem ${prod.saldo} ${prod.unidade}` : "Escolha um produto ou digite um nome novo"} onClose={() => setMov(null)}
      rodape={<><button type="button" className="btn" onClick={() => setMov(null)}>Cancelar</button><button type="submit" form="form-mov" className="btn primario" disabled={salvando}>{salvando ? "Registrando…" : novo ? "Cadastrar e registrar" : "Registrar entrada"}</button></>}>
      <form id="form-mov" className="est-form" onSubmit={salvar}>
        <div className="form-modal"><CampoProduto mov={mov} setMov={setMov} produtos={produtos} /></div>
        <div className="est-linha">
          <div className="est-campo"><span>Quantidade{prod || novo ? ` (${prod?.unidade || mov.unidade || "un"})` : ""}</span><Qtd valor={mov.quantidade} aoMudar={(v) => muda("quantidade", v)} /></div>
          {novo && <label className="est-campo"><span>Unidade <span className="dica-campo">un, cx, resma…</span></span><input value={mov.unidade ?? "un"} onChange={(e) => muda("unidade", e.target.value)} /></label>}
        </div>
        {(comTamanho(prod) || ((novo || (prod && !prod.saldo)) && mov.temTam)) && (
          <div className="est-campo"><span>Tamanho{comTamanho(prod) ? "" : " (o produto passa a ser separado por tamanho)"}</span>
            <EscolherTamanho produto={prod} valor={mov.tamanho || ""} aoMudar={(t) => muda("tamanho", t)} outro /></div>)}
        {!comTamanho(prod) && (novo || (prod && !prod.saldo)) && !mov.temTam && (
          <button type="button" className="btn est-link" onClick={() => muda("temTam", true)}>+ Esse produto tem tamanho</button>)}
        {prod && Number(mov.quantidade) > 0 && (!comTamanho(prod) || mov.tamanho) && <small className="mudo">
          Vai ficar com {saldoDe(prod, mov.tamanho) + Number(mov.quantidade)} {prod.unidade}{mov.tamanho ? ` no ${mov.tamanho}` : ""}.</small>}
        <div className="est-campo"><span>Quando</span><CampoData valor={mov.data} aoMudar={(v) => muda("data", v)} /></div>
        <label className="est-campo"><span>Observação <span className="dica-campo">opcional · ex.: nota, fornecedor</span></span><input value={mov.observacao} onChange={(e) => muda("observacao", e.target.value)} /></label>
        {erro && <p className="msg ruim" role="alert">{erro}</p>}
      </form>
    </Modal>
  );
}

// ---------- Modal de pedido ----------
function ModalPedido({ ped, setPed, produtos, pessoas, aoSalvar }) {
  const [erro, setErro] = useState("");
  const muda = (k, v) => setPed((x) => ({ ...x, [k]: v }));
  const prod = produtos.find((p) => p.id === ped.produto_id);
  async function salvar(ev) {
    ev.preventDefault(); setErro("");
    try {
      if (!ped.produto_id && !(ped.descricao || "").trim()) throw new Error("Diga o que foi pedido");
      if (comTamanho(prod) && !ped.tamanho) throw new Error(`Escolha o tamanho de ${prod.nome}.`);
      const r = await api("/estoque/pedidos", { method: "POST", body: JSON.stringify({ ...ped, produto_id: ped.produto_id || null, quantidade: Number(ped.quantidade) }) });
      setPed(null);
      aoSalvar(`Pedido de ${r.pessoa} anotado`, () => api(`/estoque/pedidos/${r.id}`, { method: "DELETE" }));
    } catch (x) { setErro(mensagemDeErro(x)); }
  }
  return (
    <Modal titulo="Anotar pedido" subtitulo="Fica esperando até você marcar como entregue." onClose={() => setPed(null)}
      rodape={<><button type="button" className="btn" onClick={() => setPed(null)}>Cancelar</button><button type="submit" form="form-ped" className="btn primario">Anotar pedido</button></>}>
      <form id="form-ped" className="est-form" onSubmit={salvar}>
        <label className="est-campo"><span>Quem pediu</span><CampoPessoa valor={ped.pessoa} aoMudar={(v) => muda("pessoa", v)} pessoas={pessoas} required autoFocus={!ped.pessoa} /></label>
        <div className="est-linha">
          <div className="est-campo est-cresce"><span>O que pediu</span>
            <EscolherProduto id={ped.produto_id} aoEscolher={(id) => setPed((x) => ({ ...x, produto_id: id, tamanho: "" }))} aoTexto={(t) => setPed((x) => ({ ...x, descricao: t }))} produtos={produtos} autoFocus={!!ped.pessoa} />
            {prod ? (comTamanho(prod) && !ped.tamanho ? null : (() => { const tem = saldoDe(prod, ped.tamanho); return (
              <small className={tem >= Number(ped.quantidade) ? "msg ok" : "mudo"}>{tem >= Number(ped.quantidade) ? `Tem ${tem} ${prod.unidade}${ped.tamanho ? ` no ${ped.tamanho}` : ""} — dá para entregar agora` : `Tem ${tem} ${prod.unidade}${ped.tamanho ? ` no ${ped.tamanho}` : ""} no estoque`}</small>); })())
              : (ped.descricao || "").trim() && <small className="mudo">Não está no estoque: fica anotado como “{ped.descricao.trim()}”.</small>}
          </div>
          <div className="est-campo"><span>Quantidade</span><Qtd valor={ped.quantidade} aoMudar={(v) => muda("quantidade", v)} /></div>
        </div>
        {comTamanho(prod) && <div className="est-campo"><span>Tamanho</span><EscolherTamanho produto={prod} valor={ped.tamanho || ""} aoMudar={(t) => muda("tamanho", t)} /></div>}
        <div className="est-campo"><span>Quando pediu</span><CampoData valor={ped.data_pedido} aoMudar={(v) => muda("data_pedido", v)} /></div>
        <label className="est-campo"><span>Observação <span className="dica-campo">opcional</span></span><input value={ped.observacao} onChange={(e) => muda("observacao", e.target.value)} /></label>
        {erro && <p className="msg ruim" role="alert">{erro}</p>}
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
              <div className="est-saldo"><b>{p.saldo}</b><span>{p.unidade}{comTamanho(p) ? " no total" : ""}</span></div>
              {comTamanho(p) && <div className="est-card-tams" aria-label="Estoque por tamanho">{p.tamanhos.map((t) => (
                <span key={t.tamanho} className={t.saldo ? "" : "zero"} title={`${t.tamanho}: ${t.saldo}`}><b>{t.tamanho}</b>{t.saldo}</span>))}</div>}
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
function ModalEditarMov({ edit, setEdit, pessoas, aoSalvar }) {
  const [erro, setErro] = useState("");
  const muda = (k) => (e) => setEdit({ ...edit, [k]: e.target.value });
  const sai = edit.tipo === "SAIDA";
  async function salvar(ev) {
    ev.preventDefault(); setErro("");
    try {
      await api(`/estoque/movimentos/${edit.id}`, { method: "PUT", body: JSON.stringify({ quantidade: Number(edit.quantidade), pessoa: sai ? edit.pessoa : null, data: edit.data, observacao: edit.observacao || null }) });
      setEdit(null); await aoSalvar();
    } catch (x) { setErro(mensagemDeErro(x)); }
  }
  return (
    <Modal titulo={sai ? "Editar saída" : "Editar entrada"} subtitulo={`${edit.produto}${edit.tamanho ? ` (${edit.tamanho})` : ""} · o saldo é recalculado com a diferença`} onClose={() => setEdit(null)}
      rodape={<><button type="button" className="btn" onClick={() => setEdit(null)}>Cancelar</button><button type="submit" form="form-edit-mov" className="btn primario">Salvar</button></>}>
      <form id="form-edit-mov" className="form-modal" onSubmit={salvar}>
        {sai && <label style={{ gridColumn: "1 / -1" }}>Quem pegou<CampoPessoa valor={edit.pessoa || ""} aoMudar={(v) => setEdit({ ...edit, pessoa: v })} pessoas={pessoas} required autoFocus /></label>}
        <label>Quantidade ({edit.unidade})<input type="number" min="1" value={edit.quantidade} onChange={muda("quantidade")} required /></label>
        <label>Data<input type="date" value={edit.data} onChange={muda("data")} required /></label>
        <label style={{ gridColumn: "1 / -1" }}>Observação<input value={edit.observacao || ""} onChange={muda("observacao")} /></label>
        {erro && <p className="msg ruim">{erro}</p>}
      </form>
    </Modal>
  );
}

// Apaga o histórico inteiro (e, se marcado, pedidos e produtos). Pede para digitar APAGAR porque não tem volta.
function ModalLimpar({ aoFechar, aoSalvar }) {
  const [pedidos, setPedidos] = useState(false);
  const [produtos, setProdutos] = useState(false);
  const [txt, setTxt] = useState("");
  const [erro, setErro] = useState("");
  const [indo, setIndo] = useState(false);
  async function apagar(ev) {
    ev.preventDefault(); setErro(""); setIndo(true);
    try { await api("/estoque/limpar", { method: "POST", body: JSON.stringify({ pedidos: pedidos || produtos, produtos }) }); aoFechar(); await aoSalvar(); }
    catch (x) { setErro(mensagemDeErro(x)); setIndo(false); }
  }
  return (
    <Modal titulo="Apagar histórico" subtitulo="Bom para recomeçar depois de testar. Não dá para desfazer." onClose={aoFechar}
      rodape={<><button type="button" className="btn" onClick={aoFechar}>Cancelar</button>
        <button type="submit" form="form-limpar" className="btn perigo-cheio" disabled={txt.trim().toUpperCase() !== "APAGAR" || indo}>{indo ? "Apagando…" : "Apagar tudo"}</button></>}>
      <form id="form-limpar" className="est-limpar" onSubmit={apagar}>
        <p>Todas as entradas e saídas vão ser apagadas e o saldo de todos os produtos volta para <b>0</b>.</p>
        <label className="marca"><input type="checkbox" checked={pedidos || produtos} disabled={produtos} onChange={(e) => setPedidos(e.target.checked)} />Apagar também os pedidos</label>
        <label className="marca"><input type="checkbox" checked={produtos} onChange={(e) => setProdutos(e.target.checked)} />Apagar também os produtos (começar do zero)</label>
        <label><span>Para confirmar, digite <b>APAGAR</b></span><input value={txt} onChange={(e) => setTxt(e.target.value)} autoFocus autoComplete="off" /></label>
        {erro && <p className="msg ruim">{erro}</p>}
      </form>
    </Modal>
  );
}

function Movimentos({ movimentos, pessoas, aoMudar, aoMovimentar }) {
  const [edit, setEdit] = useState(null);
  const [limpar, setLimpar] = useState(false);
  const [busca, setBusca] = useState("");
  const [tipo, setTipo] = useState("");
  const [erro, setErro] = useState("");
  const b = norm(busca);
  const lista = movimentos.filter((m) => (!tipo || m.tipo === tipo) && (!b || norm(`${m.produto} ${m.pessoa || ""}`).includes(b)));
  const dias = lista.reduce((acc, m) => { (acc[m.data] ||= []).push(m); return acc; }, {});
  async function desfazer(m) {
    if (!confirm(`Apagar ${m.tipo === "SAIDA" ? "a saída" : "a entrada"} de ${m.quantidade} ${m.unidade} de ${m.produto}? O saldo volta ao que era.`)) return;
    setErro(""); try { await api(`/estoque/movimentos/${m.id}`, { method: "DELETE" }); await aoMudar(); } catch (x) { setErro(mensagemDeErro(x)); }
  }
  return (
    <>
      <div className="est-barra-ferr">
        <input className="est-busca" type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Procurar produto ou pessoa…" aria-label="Procurar no histórico" />
        <Chips rotulo="Tipo" valor={tipo} aoMudar={setTipo} opcoes={[["", "Tudo", null], ["SAIDA", "Saídas", null], ["ENTRADA", "Entradas", null]]} />
        {movimentos.length > 0 && <button type="button" className="btn est-btn-perigo" onClick={() => setLimpar(true)}><Lixo />Apagar histórico</button>}
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
                  <p>{sai ? <><b>{m.pessoa}</b> pegou <b>{m.quantidade} {m.unidade}</b> de {m.produto}<TagTam t={m.tamanho} /></> : <>Entraram <b>{m.quantidade} {m.unidade}</b> de {m.produto}<TagTam t={m.tamanho} /></>}</p>
                  {m.observacao && <small>{m.observacao}</small>}
                </div>
                <div className="est-feed-acoes">
                  <button type="button" className="icone" aria-label="Editar" title="Editar" onClick={() => setEdit({ ...m })}><Lapis /></button>
                  <button type="button" className="icone perigo" aria-label="Apagar" title="Apagar (o saldo volta)" onClick={() => desfazer(m)}><Lixo /></button>
                </div>
              </li>);
          })}</ul>
        </section>
      )) : movimentos.length ? <Vazio titulo="Nada encontrado" texto="Tente outro nome ou limpe o filtro." />
        : <Vazio titulo="Nenhuma movimentação ainda" texto="Tudo que entrar ou sair do estoque aparece aqui, do mais novo ao mais antigo.">
            <button type="button" className="btn primario" onClick={() => aoMovimentar({ tipo: "SAIDA" })}><SetaSai />Alguém pegou</button></Vazio>}
      {edit && <ModalEditarMov edit={edit} setEdit={setEdit} pessoas={pessoas} aoSalvar={aoMudar} />}
      {limpar && <ModalLimpar aoFechar={() => setLimpar(false)} aoSalvar={aoMudar} />}
    </>
  );
}

// ---------- Pessoas ----------
async function apagarPessoa(nome, retiradas, pedidos) {
  if (!confirm(`Apagar ${nome}?\n\nSome junto: ${plural(retiradas, "retirada", "retiradas")} (o que pegou volta para o estoque) e ${plural(pedidos, "pedido", "pedidos")}.\nNão dá para desfazer.`)) return false;
  await api(`/estoque/pessoas/${encodeURIComponent(nome)}`, { method: "DELETE" });
  return true;
}

function FichaPessoa({ nome, renomear, pessoas, aoFechar, aoMovimentar, aoPedir, aoMudar, aoRenomeado }) {
  const [ficha, setFicha] = useState(null);
  const [erro, setErro] = useState("");
  const [novoNome, setNovoNome] = useState(renomear ? nome : null);
  const [edit, setEdit] = useState(null);
  const carregar = () => api(`/estoque/pessoas/${encodeURIComponent(nome)}`).then(setFicha).catch((x) => setErro(mensagemDeErro(x)));
  useEffect(() => { carregar(); }, [nome]);
  const atual = ficha?.pessoa || nome;
  const r = ficha?.resumo;
  const pendentes = ficha?.pedidos.filter((p) => p.status === "PENDENTE") || [];
  const outra = novoNome != null && pessoas.find((p) => p.pessoa !== atual && chavePessoa(p.pessoa) === chavePessoa(novoNome));
  async function salvarNome(e) {
    e.preventDefault(); setErro("");
    try {
      const res = await api(`/estoque/pessoas/${encodeURIComponent(atual)}`, { method: "PUT", body: JSON.stringify({ nome: novoNome }) });
      setNovoNome(null); await aoMudar(); aoRenomeado(res.pessoa);
    } catch (x) { setErro(mensagemDeErro(x)); }
  }
  async function apagar() {
    setErro("");
    try { if (await apagarPessoa(atual, r.retiradas, ficha.pedidos.length)) { aoFechar(); await aoMudar(); } } catch (x) { setErro(mensagemDeErro(x)); }
  }
  async function apagarMov(m) {
    if (!confirm(`Apagar a retirada de ${m.quantidade} ${m.unidade} de ${m.produto}? Volta para o estoque.`)) return;
    setErro(""); try { await api(`/estoque/movimentos/${m.id}`, { method: "DELETE" }); await carregar(); await aoMudar(); } catch (x) { setErro(mensagemDeErro(x)); }
  }
  return (<>
    <Modal titulo={atual} onClose={aoFechar}
      rodape={<><button type="button" className="btn" onClick={() => aoPedir(atual)}><Mais />Novo pedido</button>
        <button type="button" className="btn primario" onClick={() => aoMovimentar({ tipo: "SAIDA", pessoa: atual })}><SetaSai />Registrar que pegou</button></>}>
      {erro && <p className="msg ruim">{erro}</p>}
      {!ficha ? <p className="mudo"><span className="giro" /> Carregando…</p> : (
        <div className="est-ficha">
          {novoNome != null ? (
            <form className="est-renomear" onSubmit={salvarNome}>
              <label>Nome da pessoa<CampoPessoa valor={novoNome} aoMudar={setNovoNome} pessoas={pessoas.filter((p) => p.pessoa !== atual)} aviso={false} required autoFocus /></label>
              {outra ? <small className="msg ruim">Já existe “{outra.pessoa}”. Salvando, as duas viram uma pessoa só (histórico e pedidos juntos).</small>
                : <small className="mudo">Troca o nome em todo o histórico e nos pedidos.</small>}
              <div className="est-renomear-botoes">
                <button type="button" className="btn" onClick={() => setNovoNome(null)}>Cancelar</button>
                <button type="submit" className="btn primario" disabled={!novoNome.trim()}>{outra ? "Juntar as duas" : "Salvar nome"}</button>
              </div>
            </form>
          ) : ficha.existe && (
            <div className="est-ficha-acoes">
              <button type="button" className="btn" onClick={() => setNovoNome(atual)}><Lapis />Renomear</button>
              <button type="button" className="btn est-btn-perigo" onClick={apagar}><Lixo />Apagar pessoa</button>
            </div>)}
          <div className="est-ficha-numeros">
            <div><small>Última vez que pegou</small><b>{r.ultima_retirada ? ha(r.ultima_retirada) : "Nunca"}</b>{r.ultima_retirada && <span>{data(r.ultima_retirada)} · {r.ultimo_produto}</span>}</div>
            <div><small>Retiradas</small><b>{r.retiradas}</b></div>
            <div className={pendentes.length ? "ruim" : ""}><small>Pedidos esperando</small><b>{pendentes.length}</b></div>
          </div>
          {pendentes.length > 0 && (
            <div className="est-alerta"><b>Já pediu e está esperando</b>
              <ul>{pendentes.map((p) => <li key={p.id}>{p.quantidade}× {p.produto}<TagTam t={p.tamanho} /> <span className="mudo">· pediu {ha(p.data_pedido)}</span></li>)}</ul></div>)}
          <h4>Histórico</h4>
          {ficha.retiradas.length ? (
            <ul className="est-feed compacto">{ficha.retiradas.map((m) => (
              <li key={m.id}><span className="est-feed-icone sai"><SetaSai /></span>
                <div className="est-feed-txt"><p><b>{m.quantidade} {m.unidade}</b> de {m.produto}<TagTam t={m.tamanho} /></p><small>{data(m.data)} · {ha(m.data)}{m.observacao ? ` · ${m.observacao}` : ""}</small></div>
                <div className="est-feed-acoes">
                  <button type="button" className="icone" aria-label="Editar" title="Editar" onClick={() => setEdit({ ...m })}><Lapis /></button>
                  <button type="button" className="icone perigo" aria-label="Apagar" title="Apagar (volta para o estoque)" onClick={() => apagarMov(m)}><Lixo /></button>
                </div></li>))}</ul>
          ) : <p className="mudo">Ainda não pegou nada.</p>}
        </div>)}
    </Modal>
    {edit && <ModalEditarMov edit={edit} setEdit={setEdit} pessoas={pessoas} aoSalvar={async () => { await aoMudar(); await carregar(); }} />}
  </>);
}

function Pessoas({ pessoas, aoAbrir, aoMudar }) {
  const [nome, setNome] = useState("");
  const [filtro, setFiltro] = useState("");
  const [erro, setErro] = useState("");
  const lista = pessoas
    .filter((p) => !filtro || p.pendentes > 0)
    .filter((p) => !nome.trim() || parecido(nome, p.pessoa) >= 0.55)
    .sort((a, b) => (b.ultima_retirada || "").localeCompare(a.ultima_retirada || "") || a.pessoa.localeCompare(b.pessoa));
  async function apagar(p) {
    setErro("");
    try { if (await apagarPessoa(p.pessoa, p.retiradas, p.pedidos)) await aoMudar(); } catch (x) { setErro(mensagemDeErro(x)); }
  }
  return (
    <>
      <form className="est-barra-ferr" onSubmit={(e) => { e.preventDefault(); if (nome.trim()) aoAbrir(nome.trim()); }}>
        <div className="est-busca-pessoa"><CampoPessoa valor={nome} aoMudar={setNome} pessoas={pessoas} aviso={false} className="est-busca" placeholder="Nome da pessoa…" aria-label="Nome da pessoa" /></div>
        <Chips rotulo="Filtrar pessoas" valor={filtro} aoMudar={setFiltro} opcoes={[["", "Todas", pessoas.length], ["pendentes", "Com pedido esperando", pessoas.filter((p) => p.pendentes).length]]} />
        <button type="submit" className="btn" disabled={!nome.trim()}>Ver ficha</button>
      </form>
      {erro && <p className="msg ruim">{erro}</p>}
      {lista.length ? (
        <div className="est-grade pessoas">{lista.map((p) => (
          <article key={p.pessoa} className="est-card est-pessoa">
            <button type="button" className="est-pessoa-abrir" onClick={() => aoAbrir(p.pessoa)}>
              <Avatar nome={p.pessoa} />
              <div>
                <h3>{p.pessoa}</h3>
                <p>{p.ultima_retirada ? <>Pegou {ha(p.ultima_retirada)} · {p.ultimo_produto}</> : "Nunca pegou nada"}</p>
                {p.pendentes > 0 && <span className="tipo deb">{plural(p.pendentes, "pedido esperando", "pedidos esperando")}</span>}
              </div>
            </button>
            <div className="est-card-menu">
              <button type="button" className="icone" aria-label={`Renomear ${p.pessoa}`} title="Renomear" onClick={() => aoAbrir(p.pessoa, true)}><Lapis /></button>
              <button type="button" className="icone perigo" aria-label={`Apagar ${p.pessoa}`} title="Apagar" onClick={() => apagar(p)}><Lixo /></button>
            </div>
          </article>))}</div>
      ) : pessoas.length ? (
        <Vazio titulo={nome ? `Ninguém parecido com “${nome}”` : "Ninguém aqui"} texto={nome ? "Pode ser a primeira vez dessa pessoa." : null}>
          {nome && <button type="button" className="btn" onClick={() => aoAbrir(nome.trim())}>Ver ficha de “{nome.trim()}”</button>}</Vazio>
      ) : <Vazio titulo="Ninguém pegou nem pediu nada ainda" texto="As pessoas aparecem aqui na primeira saída ou pedido." />}
    </>
  );
}

// ---------- Pedidos ----------
function Pedidos({ pedidos, produtos, aoMudar, aoFeito, aoPedir, aoAbrirPessoa }) {
  const [filtro, setFiltro] = useState("PENDENTE");
  const [erro, setErro] = useState("");
  const conta = (s) => pedidos.filter((p) => p.status === s).length;
  // produto cadastrado sem estoque suficiente para entregar o pedido
  const falta = (p) => {
    const x = p.status === "PENDENTE" && produtos.find((q) => q.id === p.produto_id);
    if (!x) return null;
    const tem = saldoDe(x, p.tamanho);
    return tem < p.quantidade ? { saldo: tem, unidade: x.unidade } : null;
  };
  const lista = pedidos.filter((p) => !filtro || p.status === filtro);
  async function acao(p, qual) {
    setErro("");
    try {
      await api(`/estoque/pedidos/${p.id}/${qual}`, { method: "POST", body: "{}" });
      await aoFeito(qual === "atender" ? `Entregue: ${p.quantidade}× ${p.produto} para ${p.pessoa}` : `Pedido de ${p.pessoa} cancelado`);
    } catch (x) { setErro(mensagemDeErro(x)); }
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
              <p><b>{p.pessoa}</b> pediu <b>{p.quantidade}× {p.produto}</b><TagTam t={p.tamanho} />{!p.produto_id && <span className="chip">não cadastrado</span>}{falta(p) && <span className="chip est-chip-falta">{falta(p).saldo ? `só tem ${falta(p).saldo}` : "sem estoque"}</span>}</p>
              <small>{p.status === "ATENDIDO" ? `Atendido ${ha(p.data_atendido)} · pedido em ${data(p.data_pedido)}` : p.status === "CANCELADO" ? `Cancelado · pedido em ${data(p.data_pedido)}` : `Esperando ${diasDesde(p.data_pedido) ? `há ${plural(diasDesde(p.data_pedido), "dia", "dias")}` : "desde hoje"} · ${data(p.data_pedido)}`}
                {p.observacao ? ` · ${p.observacao}` : ""}</small>
            </div>
            <div className="est-pedido-acoes">
              {p.status === "PENDENTE" && <>
                <button type="button" className="btn" onClick={() => acao(p, "cancelar")}>Cancelar</button>
                <button type="button" className="btn primario" disabled={!!falta(p)} title={falta(p) ? `Só tem ${falta(p).saldo} ${falta(p).unidade} no estoque` : p.produto_id ? "Marca como entregue e tira do estoque" : "Marca como entregue"} onClick={() => acao(p, "atender")}><Ok />Entregar</button></>}
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
  const [saida, setSaida] = useState(null);
  const [ficha, setFicha] = useState(null);
  const [aviso, setAviso] = useState(null); // { texto, desfazer? } — some sozinho depois de alguns segundos
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
  useEffect(() => { if (!aviso) return; const t = setTimeout(() => setAviso(null), 7000); return () => clearTimeout(t); }, [aviso]);
  async function feito(texto, desfazer) { setAviso({ texto, desfazer, id: Date.now() }); await carregar(); }
  async function desfazerAviso() {
    const d = aviso.desfazer; setAviso(null);
    try { await d(); } catch (x) { setErro(mensagemDeErro(x)); }
    await carregar();
  }
  const abrirMov = (m) => {
    setFicha(null);
    if (m.tipo === "SAIDA") return setSaida({ pessoa: m.pessoa || "", data: hoje(), observacao: "", itens: [novoItem(m.produto_id || "")] });
    setMov({ produto_id: "", produto_nome: produtos.find((p) => p.id === m.produto_id)?.nome ?? "", unidade: "un", quantidade: 1, pessoa: "", data: hoje(), observacao: "", ...m }); };
  const abrirPedido = (pessoa) => { setFicha(null); setPed({ pessoa: pessoa || "", produto_id: "", descricao: "", quantidade: 1, data_pedido: hoje(), observacao: "" }); };
  const abrirFicha = (nome, renomear = false) => setFicha({ nome, renomear });
  const pendentes = useMemo(() => pedidos.filter((p) => p.status === "PENDENTE").length, [pedidos]);
  const repor = produtos.filter((p) => p.ativo && p.saldo <= p.minimo).length;
  const mes = hoje().slice(0, 7);
  const saidasMes = movimentos.filter((m) => m.tipo === "SAIDA" && m.data.startsWith(mes)).reduce((t, m) => t + m.quantidade, 0);
  const ABAS = [["produtos", "Produtos"], ["movimentos", "Histórico"], ["pessoas", "Pessoas"], ["pedidos", "Pedidos", pendentes || null]];
  const Numero = ({ alvo, rotulo, valor, detalhe, alerta }) => (
    <button type="button" className={"est-numero" + (alerta ? " alerta" : "")} onClick={() => setAba(alvo)}>
      <small>{rotulo}</small>{carregando ? <i className="est-esq est-esq-num" /> : <b>{valor}</b>}<span>{carregando ? "\u00a0" : detalhe}</span></button>
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
        {carregando ? <div className="est-grade" aria-busy="true" aria-label="Carregando o estoque">{[0, 1, 2, 3].map((i) => <div key={i} className="est-card est-esq est-esq-card" />)}</div> : <>
          {aba === "produtos" && <Produtos produtos={produtos} aoMudar={carregar} aoMovimentar={abrirMov} />}
          {aba === "movimentos" && <Movimentos movimentos={movimentos} pessoas={pessoas} aoMudar={carregar} aoMovimentar={abrirMov} />}
          {aba === "pessoas" && <Pessoas pessoas={pessoas} aoAbrir={abrirFicha} aoMudar={carregar} />}
          {aba === "pedidos" && <Pedidos pedidos={pedidos} produtos={produtos} aoMudar={carregar} aoFeito={feito} aoPedir={abrirPedido} aoAbrirPessoa={abrirFicha} />}
        </>}
      </section>
      {ficha && <FichaPessoa key={ficha.nome} nome={ficha.nome} renomear={ficha.renomear} pessoas={pessoas} aoFechar={() => setFicha(null)} aoMovimentar={abrirMov} aoPedir={abrirPedido}
        aoMudar={carregar} aoRenomeado={(n) => setFicha({ nome: n, renomear: false })} />}
      {saida && <ModalSaida saida={saida} setSaida={setSaida} produtos={produtos} pessoas={pessoas} aoSalvar={feito} />}
      {mov && <ModalMovimento mov={mov} setMov={setMov} produtos={produtos} aoSalvar={feito} />}
      {ped && <ModalPedido ped={ped} setPed={setPed} produtos={produtos} pessoas={pessoas} aoSalvar={feito} />}
      {aviso && (
        <div key={aviso.id} className="est-aviso" role="status">
          <span className="est-aviso-ok"><Ok /></span><span>{aviso.texto}</span>
          {aviso.desfazer && <button type="button" onClick={desfazerAviso}>Desfazer</button>}
          <button type="button" className="est-aviso-x" aria-label="Fechar aviso" onClick={() => setAviso(null)}>×</button>
        </div>)}
    </div>
  );
}
