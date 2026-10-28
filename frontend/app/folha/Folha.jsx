"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Arquivo from "./Arquivo";
import Eventos from "./Eventos";
import Cadastro from "./Cadastro";
import Centros from "./Centros";
import Fonte from "../ui/Fonte";
import Dica from "../ui/Dica";
import Modal from "../ui/Modal";
import { Alerta, Baixar, Pdf } from "../ui/Icones";
import Conferencias from "./Conferencias";
import { API, VAZIO, api, autFetch } from "../lib";

let seq = 0;

export default function Folha() {
  const [eventos, setEventos] = useState([]);
  const [centros, setCentros] = useState([]);
  const [itens, setItens] = useState([]);
  const [erroApi, setErroApi] = useState("");
  const [files, setFiles] = useState([]);           // [{ id, file, centro }]
  const [res, setRes] = useState({});               // id -> resposta da pré-checagem
  const [guias, setGuias] = useState([]);           // conferência das guias (FGTS...) com a soma das folhas
  const [checando, setChecando] = useState(false);
  const [abertos, setAbertos] = useState(new Set());
  const [ocultarZero, setOcultarZero] = useState(false);
  const [formato, setFormato] = useState("xlsx");
  const [versao, setVersao] = useState(0);
  const [arrastando, setArrastando] = useState(false);
  const [erroGerar, setErroGerar] = useState("");
  const [gerando, setGerando] = useState(false);
  const [fonte, setFonte] = useState(null);         // { alvo, arquivo }
  const [form, setForm] = useState(VAZIO);
  const [editId, setEditId] = useState(null);
  const [aliasEdit, setAliasEdit] = useState([]);
  const [msg, setMsg] = useState(null);
  const [excluir, setExcluir] = useState(null);
  const req = useRef(0);
  const jaAbertos = useRef(new Set());

  const carregar = useCallback(async () => {
    try {
      const [e, c, i] = await Promise.all([api("/eventos"), api("/centros-custo"), api("/itens-despesa")]);
      setEventos(e); setCentros(c); setItens(i); setErroApi("");
    } catch (x) { setErroApi(`Não consegui falar com a API em ${API}. Ela está rodando? (${x.message})`); }
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  // Pré-checagem automática: lê todos os PDFs sempre que algo muda
  useEffect(() => {
    if (!files.length) { setRes({}); setGuias([]); setChecando(false); return; }
    const meu = ++req.current, ids = files.map((f) => f.id);
    setChecando(true);
    const fd = new FormData();
    files.forEach((f) => { fd.append("arquivos", f.file); fd.append("centros", f.centro || ""); });
    fd.append("ocultar_zerados", ocultarZero ? "true" : "false");
    const t = setTimeout(() => {
      autFetch(API + "/folha/lote/processar", { method: "POST", body: fd })
        .then(async (r) => { const c = await r.json().catch(() => ({})); if (!r.ok) throw new Error(typeof c.detail === "string" ? c.detail : "Erro ao ler os PDFs"); return c; })
        .then((c) => {
          if (meu !== req.current) return;
          const novo = Object.fromEntries(c.arquivos.map((a, i) => [ids[i], a]));
          setRes(novo); setGuias(c.guias || []); setChecando(false);
          setAbertos((s) => { const x = new Set(s); ids.forEach((id) => { if (novo[id] && !novo[id].ok && !jaAbertos.current.has(id)) { x.add(id); } jaAbertos.current.add(id); }); return x; });
        })
        .catch((x) => { if (meu === req.current) { setChecando(false); setErroGerar(x.message); } });
    }, 120);
    return () => clearTimeout(t);
  }, [files, ocultarZero, versao]);

  const reprocessar = () => setVersao((v) => v + 1);

  function adicionar(lista) {
    const pdfs = Array.from(lista).filter((f) => /\.pdf$/i.test(f.name));
    if (!pdfs.length) return;
    setErroGerar("");
    setFiles((fs) => [...fs, ...pdfs.map((file) => ({ id: ++seq, file, centro: "" }))]);
  }
  const remover = (id) => setFiles((fs) => fs.filter((f) => f.id !== id));
  const trocarCentro = (id, centro) => setFiles((fs) => fs.map((f) => (f.id === id ? { ...f, centro } : f)));
  const alterna = (id) => setAbertos((s) => { const x = new Set(s); x.has(id) ? x.delete(id) : x.add(id); return x; });

  const problemas = files.reduce((n, f) => n + (res[f.id]?.problemas?.length || 0), 0);
  const semResultado = files.some((f) => !res[f.id]);
  const bloqueio = !files.length ? "Envie ao menos um PDF." : checando || semResultado ? "Conferindo os PDFs…"
    : problemas ? `Resolva ${problemas} ${problemas === 1 ? "problema" : "problemas"} para gerar.` : "";

  async function gerar() {
    setGerando(true); setErroGerar("");
    try {
      const fd = new FormData();
      const paraGerar = files.filter((f) => res[f.id]?.tipo !== "guia");
      const unico = paraGerar.length === 1;
      paraGerar.forEach((f) => { fd.append(unico ? "arquivo" : "arquivos", f.file); if (unico) { if (f.centro) fd.append("centro_custo", f.centro); } else fd.append("centros", f.centro || ""); });
      fd.append("ocultar_zerados", ocultarZero ? "true" : "false");
      fd.append("formato", formato);
      const r = await autFetch(API + (unico ? "/folha/csv" : "/folha/lote/csv"), { method: "POST", body: fd });
      if (!r.ok) { const c = await r.json().catch(() => ({})); throw new Error(c.detail || "Erro ao gerar os lançamentos"); }
      const nome = (r.headers.get("content-disposition") || "").match(/filename="(.+)"/)?.[1] || (unico ? `lancamentos.${formato}` : "lancamentos.zip");
      const a = document.createElement("a"); a.href = URL.createObjectURL(await r.blob()); a.download = nome; a.click();
    } catch (x) { setErroGerar(x.message); }
    setGerando(false);
  }

  // ---- cadastro de eventos ----
  const irParaCadastro = () => setTimeout(() => document.getElementById("cadastro")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  function cadastrarNovo(n, perfil = "folha") {
    setEditId(null); setAliasEdit([]); setMsg(null);
    setForm({ ...VAZIO, grupo: perfil, codigo_pdf: n.codigo_pdf, nome_pdf: n.nome_pdf, descricao: n.nome_pdf, secao: n.secao, tipo_lancamento: n.secao === "adicional" ? "DEBITO" : "CREDITO" });
    irParaCadastro();
  }
  async function vincular(n, eventoId) {
    try { await api(`/eventos/${eventoId}/apelidos`, { method: "POST", body: JSON.stringify({ nome: n.nome_pdf }) }); await carregar(); reprocessar(); }
    catch (x) { setErroGerar(x.message); }
  }
  async function trocarItem(e, codigo) {
    const { id, ativo, apelidos, apelidos_ids, ...corpo } = e;
    try { await api(`/eventos/${id}`, { method: "PUT", body: JSON.stringify({ ...corpo, ativo, item_despesa: Number(codigo) }) }); await carregar(); reprocessar(); }
    catch (x) { setErroApi("Não consegui trocar o item: " + x.message); }
  }
  function editar(e) {
    setEditId(e.id); setAliasEdit(e.apelidos.map((nome, i) => ({ nome, id: e.apelidos_ids[i] }))); setMsg(null);
    setForm({ codigo_pdf: e.codigo_pdf || "", nome_pdf: e.nome_pdf || "", descricao: e.descricao, secao: e.secao, tipo_lancamento: e.tipo_lancamento || "",
      centro_custo_fixo: e.centro_custo_fixo || "", item_despesa: e.item_despesa ?? "", gera_lancamento: e.gera_lancamento, calculo: e.calculo || "",
      grupo: e.grupo, observacao: e.observacao || "", ativo: e.ativo, ordem: e.ordem });
    irParaCadastro();
  }
  const cancelar = () => { setEditId(null); setAliasEdit([]); setForm(VAZIO); };
  async function salvar(ev) {
    ev.preventDefault();
    const corpo = { ...form, codigo_pdf: form.codigo_pdf || null, nome_pdf: form.nome_pdf || null, calculo: form.calculo || null,
      centro_custo_fixo: form.centro_custo_fixo || null, observacao: form.observacao || null,
      item_despesa: form.item_despesa === "" ? null : Number(form.item_despesa), tipo_lancamento: form.tipo_lancamento || null };
    try {
      const novo = editId ? await api(`/eventos/${editId}`, { method: "PUT", body: JSON.stringify(corpo) }) : await api("/eventos", { method: "POST", body: JSON.stringify(corpo) });
      setMsg({ ok: true, t: `Evento “${novo.descricao}” ${editId ? "atualizado" : "cadastrado"}.` });
      cancelar(); await carregar(); reprocessar();
    } catch (x) { setMsg({ ok: false, t: x.message }); }
  }
  async function confirmarExcluir() {
    const e = excluir; setExcluir(null);
    try { await api(`/eventos/${e.id}`, { method: "DELETE" }); setMsg({ ok: true, t: `Evento “${e.descricao}” excluído.` }); if (editId === e.id) cancelar(); await carregar(); reprocessar(); }
    catch (x) { setMsg({ ok: false, t: x.message }); }
  }
  async function removerApelido(a) {
    try { await api(`/eventos/${editId}/apelidos/${a.id}`, { method: "DELETE" }); setAliasEdit((l) => l.filter((x) => x.id !== a.id)); await carregar(); reprocessar(); }
    catch (x) { setMsg({ ok: false, t: x.message }); }
  }

  const deptos = centros;  // todos os centros (departamentos, CTPAS e REC01) podem ser escolhidos à mão
  const arqFonte = fonte && files.find((f) => f.id === fonte.id);

  return (
    <>
      {erroApi && <div className="faixa-erro" role="alert">{erroApi}</div>}
      <Dica passos={[
        "Envie o PDF “Resumo Geral” de cada departamento (pode mandar vários de uma vez, mais os dos Sócios). Junto, mande as guias do FGTS Digital e o DARF do INSS: o sistema soma as folhas e confere com cada guia.",
        "Cada PDF é conferido sozinho. Abra o arquivo para ver as conferências e os lançamentos; toque num total para ver a soma que o forma e numa linha para ver o trecho do PDF de onde o valor saiu.",
        "Se aparecer um problema (evento novo ou total que não bate), resolva ali mesmo: cadastre o evento ou diga que é o mesmo que um já existente.",
        "Escolha o formato: Excel (recomendado, mantém “1-1” como texto) ou CSV. Se abrir o CSV direto no Excel, ele troca “1-1” por data.",
        "Com tudo sem problemas, clique em Gerar lançamentos: um PDF gera um arquivo, vários geram um ZIP com um arquivo para cada."]} />

      <section className="painel" aria-labelledby="t-enviar">
        <div className="painel-cab"><h2 id="t-enviar">Enviar PDFs da folha</h2>
          <p>Envie o “Resumo Geral” de cada departamento. Cada PDF é conferido assim que chega; só gera lançamentos quando todos estiverem sem problemas.</p></div>

        <label className={"soltar" + (arrastando ? " sobre" : "")}
          onDragOver={(e) => { e.preventDefault(); setArrastando(true); }} onDragLeave={() => setArrastando(false)}
          onDrop={(e) => { e.preventDefault(); setArrastando(false); adicionar(e.dataTransfer.files); }}>
          <input type="file" accept=".pdf,application/pdf" multiple onChange={(e) => { adicionar(e.target.files); e.target.value = ""; }} />
          <Pdf /><span><b>Escolha os arquivos</b> ou arraste os PDFs até aqui</span>
        </label>

        {files.length > 0 && (
          <div className="arquivos">
            {files.map((f) => (
              <Arquivo key={f.id} f={f} r={res[f.id]} aberto={abertos.has(f.id)} aoAlternar={() => alterna(f.id)} aoRemover={() => remover(f.id)}
                deptos={deptos} aoTrocarCentro={(c) => trocarCentro(f.id, c)} eventos={eventos}
                aoCadastrarNovo={cadastrarNovo} aoVincular={vincular} aoVerFonte={(alvo) => setFonte({ alvo, id: f.id })} />))}
          </div>)}

        {guias.map((g) => (
          <div key={g.arquivo} className="conf-guia">
            <h3 className="sub-tit">Conferência com a {g.nome}{g.competencia ? ` (${g.competencia})` : ""} <small>Soma das {g.n_folhas} folhas enviadas × valor da guia. Toque para ver cada departamento.</small></h3>
            {g.aviso && <p className="aviso"><Alerta />{g.aviso}</p>}
            <Conferencias itens={g.conferencias.map((c) => ({ nome: c.nome, pdf: c.guia, calculado: c.folhas, diferenca: c.diferenca, ok: c.ok,
              composicao: c.composicao.map((p) => ({ nome: p.nome, valor: p.valor, sinal: "+" })) }))}
              abertoInicial aoVerFonte={() => {}}
              rotulos={{ pdf: "Na guia", soma: "Soma das folhas", total: "Valor na guia", vazio: "Nenhuma folha enviada",
                alerta: "Confira se todas as folhas do mês foram enviadas e se a guia é da mesma competência." }} />
          </div>))}

        <div className="gerar">
          <label className="marca"><input type="checkbox" checked={ocultarZero} onChange={(e) => setOcultarZero(e.target.checked)} />Não incluir linhas com valor zero</label>
          <label className="formato">Formato
            <select value={formato} onChange={(e) => setFormato(e.target.value)}>
              <option value="xlsx">Excel (.xlsx) — mantém 1-1 como texto</option>
              <option value="csv">CSV (.csv)</option>
            </select>
          </label>
          <span style={{ flex: 1 }} />
          {(bloqueio || erroGerar) && <p className={"gerar-msg" + (erroGerar ? " ruim" : "")} role="status">{erroGerar || bloqueio}</p>}
          <button type="button" className="btn primario grande" disabled={!!bloqueio || gerando} onClick={gerar}>
            <Baixar />{gerando ? "Gerando…" : files.length > 1 ? `Gerar ${files.length} lançamentos (ZIP)` : `Gerar lançamentos (${formato === "xlsx" ? "Excel" : "CSV"})`}
          </button>
        </div>
      </section>

      <Eventos eventos={eventos} itens={itens} aoTrocarItem={trocarItem} aoEditar={editar} aoExcluir={setExcluir} />
      <Centros centros={centros} eventos={eventos} />
      <Cadastro form={form} setForm={setForm} editId={editId} aliasEdit={aliasEdit} itens={itens} centros={centros} msg={msg}
        aoSalvar={salvar} aoCancelar={cancelar} aoRemoverApelido={removerApelido} />

      {fonte && arqFonte && <Fonte alvo={fonte.alvo} arquivo={arqFonte.file} nomeArquivo={arqFonte.file.name} onClose={() => setFonte(null)} />}
      {excluir && (
        <Modal titulo={`Excluir “${excluir.descricao}”?`} onClose={() => setExcluir(null)}
          rodape={<><button type="button" className="btn" onClick={() => setExcluir(null)}>Cancelar</button><button type="button" className="btn perigo-solido" onClick={confirmarExcluir}>Excluir evento</button></>}>
          <p>O evento sai do cadastro. Se ele veio do cadastro inicial, volta quando o sistema for reiniciado. Para tirá-lo do CSV de forma definitiva, use Editar e desmarque “Ativo”.</p>
        </Modal>)}
    </>
  );
}
