"use client";
import { useMemo, useState } from "react";
import { Chevron, Lupa, Lapis, Lixo } from "../ui/Icones";
import { SECOES } from "../lib";

export default function Eventos({ eventos, itens, aoTrocarItem, aoEditar, aoExcluir }) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const [secao, setSecao] = useState("");
  const [grupo, setGrupo] = useState("");
  const [soLanca, setSoLanca] = useState(true);
  const lista = useMemo(() => eventos.filter((e) =>
    (!soLanca || e.gera_lancamento) && (!secao || e.secao === secao) && (!grupo || e.grupo === grupo) &&
    (!busca || (e.descricao + " " + (e.nome_pdf || "")).toLowerCase().includes(busca.toLowerCase()))), [eventos, soLanca, secao, grupo, busca]);

  return (
    <section className={"painel colapso" + (aberto ? " aberto" : "")}>
      <button type="button" className="colapso-cab" aria-expanded={aberto} onClick={() => setAberto(!aberto)}>
        <Chevron className="seta" />
        <h2>Eventos</h2>
        <span className="contagem">{eventos.filter((e) => e.ativo).length} ativos · {eventos.filter((e) => e.gera_lancamento && e.ativo).length} geram lançamento</span>
      </button>
      <div className="gaveta"><div>
        <div className="filtros">
          <label className="busca"><Lupa /><input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar pelo nome do evento" aria-label="Buscar evento" /></label>
          <select value={secao} onChange={(e) => setSecao(e.target.value)} aria-label="Seção"><option value="">Todas as seções</option>{SECOES.map((s) => <option key={s}>{s}</option>)}</select>
          <select value={grupo} onChange={(e) => setGrupo(e.target.value)} aria-label="Grupo"><option value="">Folha e conselho</option><option value="folha">Folha</option><option value="conselho">Conselho</option></select>
          <label className="marca"><input type="checkbox" checked={soLanca} onChange={(e) => setSoLanca(e.target.checked)} />Só os que geram lançamento</label>
          <span className="contagem">{lista.length} de {eventos.length}</span>
        </div>
        <div className="tabela-rolo alto">
          <table className="tabela">
            <thead><tr><th>Cód.</th><th>Evento</th><th>Seção</th><th>Tipo</th><th>Item de despesa</th><th>Centro</th><th /></tr></thead>
            <tbody>
              {lista.map((e) => (
                <tr key={e.id} className={e.ativo ? "" : "zero"}>
                  <td className="num">{e.codigo_pdf}</td>
                  <td>
                    <div className="ev-nome">{e.descricao}{!e.ativo && <span className="chip">inativo</span>}{e.grupo === "conselho" && <span className="chip">conselho</span>}</div>
                    {e.nome_pdf && e.nome_pdf !== e.descricao && <small>No PDF: {e.nome_pdf}</small>}
                    {e.observacao && <small className="obs">{e.observacao}</small>}
                    {e.calculo && <small className="calc" title={e.calculo}>Calculado: {e.calculo}</small>}
                  </td>
                  <td>{e.secao}</td>
                  <td>{e.tipo_lancamento && <span className={"tipo " + (e.tipo_lancamento === "DEBITO" ? "deb" : "cred")}>{e.tipo_lancamento === "DEBITO" ? "Débito" : "Crédito"}</span>}</td>
                  <td>{e.gera_lancamento ? (
                    <select value={e.item_despesa || ""} onChange={(ev) => aoTrocarItem(e, ev.target.value)} aria-label={`Item de despesa de ${e.descricao}`}>
                      {itens.map((i) => <option key={i.codigo} value={i.codigo}>{i.codigo} — {i.nome}</option>)}
                    </select>) : <span className="mudo">Não lança</span>}</td>
                  <td>{e.gera_lancamento && (e.centro_custo_fixo ? <span className="chip fixo">{e.centro_custo_fixo}</span> : <span className="mudo">do departamento</span>)}</td>
                  <td className="acoes">
                    <button type="button" className="icone" onClick={() => aoEditar(e)} aria-label={`Editar ${e.descricao}`} title="Editar"><Lapis /></button>
                    <button type="button" className="icone perigo" onClick={() => aoExcluir(e)} aria-label={`Excluir ${e.descricao}`} title="Excluir"><Lixo /></button>
                  </td>
                </tr>))}
              {lista.length === 0 && <tr><td colSpan={7} className="vazio">Nenhum evento com esses filtros.</td></tr>}
            </tbody>
          </table>
        </div>
      </div></div>
    </section>
  );
}
