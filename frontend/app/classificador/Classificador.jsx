"use client";
import { useEffect, useMemo, useState } from "react";
import Dica from "../ui/Dica";
import Soltar from "../ui/Soltar";
import Modal from "../ui/Modal";
import { Baixar, Chevron, Lapis, Lixo, Mais } from "../ui/Icones";
import { API, api, fmt, autFetch } from "../lib";

const COMO = { regra: "Regra", sol: "Já no Sol", heuristica: "Automático", manual: "Manual" };
const VAZIA = { kw: "", nat: "", centro: "", item: "", fonte: "", forma: "", titulo: "" };

export default function Classificador() {
  const [arquivo, setArquivo] = useState(null);
  const [res, setRes] = useState(null);
  const [erro, setErro] = useState("");
  const [lendo, setLendo] = useState(false);
  const [filtro, setFiltro] = useState("");
  const [regras, setRegras] = useState([]);
  const [regrasAbertas, setRegrasAbertas] = useState(false);
  const [edit, setEdit] = useState(null);   // { id?, ...campos }
  const [erroRegra, setErroRegra] = useState("");
  const [versao, setVersao] = useState(0);

  const carregarRegras = () => api("/regras").then(setRegras).catch((x) => setErro(`Não consegui falar com a API: ${x.message}`));
  useEffect(() => { carregarRegras(); }, []);

  useEffect(() => {
    if (!arquivo) { setRes(null); return; }
    let vivo = true; setLendo(true); setErro("");
    const fd = new FormData(); fd.append("arquivo", arquivo);
    autFetch(API + "/classificador/processar", { method: "POST", body: fd })
      .then(async (r) => { const c = await r.json().catch(() => ({})); if (!r.ok) throw new Error(typeof c.detail === "string" ? c.detail : "Erro ao ler o extrato"); return c; })
      .then((c) => vivo && setRes(c)).catch((x) => { if (vivo) { setRes(null); setErro(x.message); } })
      .finally(() => vivo && setLendo(false));
    return () => { vivo = false; };
  }, [arquivo, versao]);

  const linhas = useMemo(() => (res?.linhas || []).filter((l) => !filtro || l.como === filtro), [res, filtro]);
  const opcoes = useMemo(() => ({
    centro: [...new Set(regras.map((r) => r.centro).filter(Boolean))], item: [...new Set(regras.map((r) => r.item).filter(Boolean))],
    fonte: [...new Set(regras.map((r) => r.fonte).filter(Boolean))], forma: [...new Set(regras.map((r) => r.forma).filter(Boolean))],
  }), [regras]);

  async function baixar() {
    const fd = new FormData(); fd.append("arquivo", arquivo);
    const r = await autFetch(API + "/classificador/xlsx", { method: "POST", body: fd });
    if (!r.ok) { setErro("Erro ao gerar a planilha"); return; }
    const a = document.createElement("a"); a.href = URL.createObjectURL(await r.blob()); a.download = "extrato_classificado.xlsx"; a.click();
  }

  async function salvarRegra(ev) {
    ev.preventDefault(); setErroRegra("");
    const { id, ...corpo } = edit;
    try {
      await api(id ? `/regras/${id}` : "/regras", { method: id ? "PUT" : "POST", body: JSON.stringify({ ...corpo, nat: corpo.nat || null }) });
      setEdit(null); await carregarRegras(); setVersao((v) => v + 1);
    } catch (x) { setErroRegra(x.message); }
  }
  async function excluirRegra(r) {
    try { await api(`/regras/${r.id}`, { method: "DELETE" }); await carregarRegras(); setVersao((v) => v + 1); } catch (x) { setErro(x.message); }
  }
  const nova = (l) => setEdit({ ...VAZIA, kw: l ? (l.titulo || l.descricao || "").slice(0, 60) : "", nat: l ? (l.tipo?.toLowerCase().startsWith("d") ? "DEBITO" : "CREDITO") : "" });
  const set = (k) => (e) => setEdit({ ...edit, [k]: e.target.value });

  return (
    <>
      {erro && <div className="faixa-erro" role="alert">{erro}</div>}
      <Dica passos={[
        "Envie o extrato exportado do DDATA Sol (arquivo .xlsx).",
        "O sistema aplica as regras e mostra, linha a linha, o centro de custo e o item de despesa sugeridos e quem decidiu (regra, o que já estava no Sol, ou automático).",
        "Nas linhas “Manual”, clique em Criar regra: da próxima vez essa linha já vem classificada.",
        "Quando estiver tudo certo, clique em Baixar planilha."]}
        nota="Esta é a versão base: ainda não aprende sozinha com o histórico dos lançamentos." />

      <section className="painel">
        <div className="painel-cab"><h2>Extrato do Sol</h2><p>Envie o .xlsx do extrato para receber a classificação sugerida de cada linha.</p></div>
        <Soltar rotulo="Escolha o extrato do Sol" arquivo={arquivo} aoEscolher={setArquivo} />
        {lendo && <p className="aviso-leve">Classificando…</p>}
        {res && (
          <div className="resultado">
            <div className="resumo-linha" role="group" aria-label="Filtrar por quem classificou">
              <button type="button" className={"filtro" + (!filtro ? " ativo" : "")} onClick={() => setFiltro("")}>Todas <b>{res.resumo.total}</b></button>
              {Object.keys(COMO).map((k) => <button key={k} type="button" className={"filtro " + k + (filtro === k ? " ativo" : "")} onClick={() => setFiltro(filtro === k ? "" : k)}>{COMO[k]} <b>{res.resumo[k]}</b></button>)}
              <span style={{ flex: 1 }} />
              <button type="button" className="btn primario" onClick={baixar}><Baixar />Baixar planilha</button>
            </div>
            <div className="tabela-rolo alto">
              <table className="tabela">
                <thead><tr><th>Linha</th><th>Data</th><th>Título e descrição</th><th className="d">Valor</th><th>Centro de custo</th><th>Item de despesa</th><th>Classificado por</th></tr></thead>
                <tbody>{linhas.map((l) => (
                  <tr key={l.linha_origem}>
                    <td className="num">{l.linha_origem}</td><td>{l.data}</td>
                    <td><div className="ev-nome">{l.titulo}</div><small>{l.descricao}</small></td>
                    <td className="d num">{l.valor == null ? "" : fmt(l.valor)}</td>
                    <td>{l.centro || <span className="mudo">—</span>}</td><td>{l.item || <span className="mudo">—</span>}</td>
                    <td>{l.como === "manual" ? <button type="button" className="btn leve" onClick={() => nova(l)}><Mais />Criar regra</button>
                      : <span className={"chip como-" + l.como} title={l.regra_kw ? `Regra: ${l.regra_kw}` : ""}>{COMO[l.como]}{l.regra_kw ? ` · ${l.regra_kw}` : ""}</span>}</td>
                  </tr>))}
                  {linhas.length === 0 && <tr><td colSpan={7} className="vazio">Nenhuma linha nesse filtro.</td></tr>}</tbody>
              </table>
            </div>
          </div>)}
      </section>

      <section className={"painel colapso" + (regrasAbertas ? " aberto" : "")}>
        <button type="button" className="colapso-cab" aria-expanded={regrasAbertas} onClick={() => setRegrasAbertas(!regrasAbertas)}>
          <Chevron className="seta" /><h2>Regras de classificação</h2><span className="contagem">{regras.length} regras</span>
        </button>
        <div className="gaveta"><div>
          <div className="filtros"><button type="button" className="btn primario" onClick={() => nova(null)}><Mais />Nova regra</button>
            <span className="contagem">Vale a primeira regra da lista cuja palavra-chave aparece no título ou na descrição.</span></div>
          <div className="tabela-rolo alto"><table className="tabela">
            <thead><tr><th>Palavra-chave</th><th>Tipo</th><th>Centro de custo</th><th>Item de despesa</th><th>Título sugerido</th><th /></tr></thead>
            <tbody>{regras.map((r) => (
              <tr key={r.id}><td><div className="ev-nome">{r.kw}</div></td><td>{r.nat ? <span className={"tipo " + (r.nat === "DEBITO" ? "deb" : "cred")}>{r.nat === "DEBITO" ? "Débito" : "Crédito"}</span> : <span className="mudo">qualquer</span>}</td>
                <td>{r.centro}</td><td>{r.item}</td><td><small>{r.titulo}</small></td>
                <td className="acoes"><button type="button" className="icone" aria-label={`Editar ${r.kw}`} onClick={() => setEdit({ ...r, nat: r.nat || "" })}><Lapis /></button>
                  <button type="button" className="icone perigo" aria-label={`Excluir ${r.kw}`} onClick={() => excluirRegra(r)}><Lixo /></button></td></tr>))}</tbody>
          </table></div>
        </div></div>
      </section>

      {edit && (
        <Modal titulo={edit.id ? "Editar regra" : "Nova regra"} subtitulo="Linhas que contêm a palavra-chave recebem estes dados." onClose={() => setEdit(null)}
          rodape={<><button type="button" className="btn" onClick={() => setEdit(null)}>Cancelar</button><button type="submit" form="form-regra" className="btn primario">Salvar regra</button></>}>
          <form id="form-regra" onSubmit={salvarRegra} className="form-modal">
            <label>Palavra-chave<input value={edit.kw} onChange={set("kw")} required autoFocus /></label>
            <label>Tipo<select value={edit.nat} onChange={set("nat")}><option value="">Qualquer</option><option value="DEBITO">Débito</option><option value="CREDITO">Crédito</option></select></label>
            <label>Centro de custo<input list="dl-centro" value={edit.centro} onChange={set("centro")} /></label>
            <label>Item de despesa<input list="dl-item" value={edit.item} onChange={set("item")} /></label>
            <label>Fonte de recurso<input list="dl-fonte" value={edit.fonte} onChange={set("fonte")} /></label>
            <label>Forma de pagamento<input list="dl-forma" value={edit.forma} onChange={set("forma")} /></label>
            <label>Título sugerido<input value={edit.titulo} onChange={set("titulo")} /></label>
            {Object.entries(opcoes).map(([k, v]) => <datalist key={k} id={`dl-${k}`}>{v.map((o) => <option key={o} value={o} />)}</datalist>)}
            {erroRegra && <p className="msg ruim" role="alert">{erroRegra}</p>}
          </form>
        </Modal>)}
    </>
  );
}
