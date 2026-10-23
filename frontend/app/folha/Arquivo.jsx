"use client";
import { useState } from "react";
import { Chevron, Pdf, Ok, Alerta, Fechar, Olho } from "../ui/Icones";
import Conferencias from "./Conferencias";
import { fmt, data } from "../lib";

const ROT_ORIGEM = { escolhido: "escolhido por você", "padrão dos Sócios": "padrão dos Sócios", "nome do arquivo": "pelo nome do arquivo", "cabeçalho do PDF": "pelo cabeçalho do PDF" };

export default function Arquivo({ f, r, aberto, aoAlternar, aoRemover, deptos, aoTrocarCentro, eventos, aoCadastrarNovo, aoVincular, aoVerFonte }) {
  const [alvo, setAlvo] = useState({});
  const [somaAberta, setSomaAberta] = useState(null);
  const lendo = !r;
  const estado = lendo ? "lendo" : r.ok ? "ok" : "problema";
  const nProb = r?.problemas?.length || 0;

  const deb = r?.linhas?.filter((l) => l.tipo_lancamento === "DEBITO") || [];
  const cred = r?.linhas?.filter((l) => l.tipo_lancamento === "CREDITO") || [];
  const soma = (ls) => ls.reduce((a, l) => a + l.valor, 0);

  return (
    <section className={"arq " + estado + (aberto ? " aberto" : "")}>
      <div className="arq-topo">
        <button type="button" className="arq-nome" aria-expanded={aberto} onClick={aoAlternar}>
          <Chevron className="seta" />
          <span className="arq-status" aria-hidden>{estado === "lendo" ? <i className="giro" /> : estado === "ok" ? <Ok /> : <Alerta />}</span>
          <span className="arq-titulo">
            <b>{f.file.name}</b>
            <small>
              {lendo ? "Lendo o PDF…" : r.erro ? "Não foi possível ler" :
                <>{r.centro_custo.codigo} {r.centro_custo.nome}{r.perfil === "conselho" ? " · Sócios e conselho" : ""} · {data(r.periodo.inicio)} a {data(r.periodo.fim)} · {r.n_linhas} linhas</>}
            </small>
          </span>
        </button>
        <span className={"selo " + (estado === "ok" ? "ok" : estado === "problema" ? "ruim" : "neutro")}>
          {estado === "lendo" ? "Conferindo" : estado === "ok" ? "Pronto para gerar" : `${nProb} ${nProb === 1 ? "problema" : "problemas"}`}
        </span>
        <button type="button" className="icone" onClick={aoRemover} aria-label={`Remover ${f.file.name}`} title="Remover"><Fechar /></button>
      </div>

      <div className="gaveta"><div>
        {r && (
          <div className="arq-corpo">
            {r.problemas?.length > 0 && (
              <div className="problemas" role="alert">
                <h3>Resolva {nProb === 1 ? "este problema" : "estes problemas"} para poder gerar os lançamentos</h3>
                {r.problemas.map((p, i) => (
                  <div key={i} className={"problema " + p.tipo}>
                    <div className="problema-txt"><b>{p.titulo}</b><p>{p.detalhe}</p>
                      {p.evento && <p className="evento-valores">{Object.entries(p.evento.valores).filter(([, v]) => v).map(([k, v]) => `${k}: ${fmt(v)}`).join(" · ")}</p>}
                    </div>
                    {p.tipo === "evento_novo" && (
                      <div className="problema-acoes">
                        <button type="button" className="btn primario" onClick={() => aoCadastrarNovo(p.evento, r.perfil)}>Cadastrar como evento novo</button>
                        <div className="vinculo">
                          <select aria-label="Evento existente" value={alvo[p.evento.nome_pdf] || ""} onChange={(e) => setAlvo({ ...alvo, [p.evento.nome_pdf]: e.target.value })}>
                            <option value="">É o mesmo que…</option>
                            {eventos.filter((e) => e.grupo === r.perfil && e.secao === p.evento.secao && e.gera_lancamento).map((e) => <option key={e.id} value={e.id}>{e.descricao}</option>)}
                          </select>
                          <button type="button" className="btn" disabled={!alvo[p.evento.nome_pdf]} onClick={() => aoVincular(p.evento, alvo[p.evento.nome_pdf])}>Vincular</button>
                        </div>
                        <button type="button" className="btn leve" onClick={() => aoVerFonte({ titulo: p.evento.nome_pdf, valor: p.evento.valores.Total, pdf_nome: p.evento.nome_pdf, pdf_origem: "resumo" })}><Olho />Ver no PDF</button>
                      </div>)}
                    {p.tipo === "conferencia" && <div className="problema-acoes"><button type="button" className="btn" onClick={() => document.getElementById(`conf-${f.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" })}>Ir para a conferência</button></div>}
                  </div>))}
              </div>)}

            {(r.avisos || []).map((a, i) => <p key={i} className="aviso"><Alerta />{a}</p>)}

            {r.conferencias && (
              <div id={`conf-${f.id}`}>
                <h3 className="sub-tit">Conferência dos totais <small>Toque num total para ver a soma que o forma</small></h3>
                <Conferencias itens={r.conferencias} abertoInicial aoVerFonte={aoVerFonte} />
              </div>)}

            {r.linhas && (
              <div>
                <h3 className="sub-tit">Lançamentos que serão gerados <small>Toque numa linha para ver de onde saiu o valor</small></h3>
                <div className="tabela-rolo">
                  <table className="tabela lanc">
                    <thead><tr><th>Descrição</th><th>Tipo</th><th>Centro</th><th>Item</th><th className="d">Valor</th></tr></thead>
                    <tbody>{r.linhas.map((l) => (
                      <tr key={l.evento_id} className={(l.valor === 0 ? "zero " : "") + "clicavel"} tabIndex={0}
                        onClick={() => aoVerFonte({ titulo: l.descricao, valor: l.valor, pdf_nome: l.pdf_nome, pdf_origem: l.pdf_origem, componentes: l.componentes })}
                        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.click()}>
                        <td>{l.descricao}</td>
                        <td><span className={"tipo " + (l.tipo_lancamento === "DEBITO" ? "deb" : "cred")}>{l.tipo_lancamento === "DEBITO" ? "Débito" : "Crédito"}</span></td>
                        <td>{l.codigo_centro_de_custo}</td><td>{l.codigo_item_despesa}</td><td className="d num">{fmt(l.valor)}</td>
                      </tr>))}</tbody>
                  </table>
                </div>
                <div className="totais-lanc">
                  {[["deb", "Total de débitos", deb], ["cred", "Total de créditos", cred]].map(([k, rot, ls]) => (
                    <div key={k} className={"total-bloco" + (somaAberta === k ? " aberto" : "")}>
                      <button type="button" aria-expanded={somaAberta === k} onClick={() => setSomaAberta(somaAberta === k ? null : k)}>
                        <Chevron className="seta" /><span>{rot}</span><b className="num">{fmt(soma(ls))}</b>
                      </button>
                      <div className="gaveta"><div><ul className="fita mini">
                        {ls.filter((l) => l.valor !== 0).map((l) => <li key={l.evento_id}><div className="parcela fixa"><span>{l.descricao}</span><i /><b>{fmt(l.valor)}</b></div></li>)}
                        <li className="soma"><div className="parcela fixa"><span>Soma</span><i /><b>{fmt(soma(ls))}</b></div></li>
                      </ul></div></div>
                    </div>))}
                </div>
              </div>)}

            <div className="arq-centro">
              <label>Centro de custo deste arquivo
                <select value={f.centro} onChange={(e) => aoTrocarCentro(e.target.value)}>
                  <option value="">{r.centro_custo ? `${r.centro_custo.codigo} ${r.centro_custo.nome} (${ROT_ORIGEM[r.origem_centro] || r.origem_centro})` : "Detectar automaticamente"}</option>
                  {deptos.map((c) => <option key={c.codigo} value={c.codigo}>{c.codigo} — {c.nome}</option>)}
                </select>
              </label>
            </div>
          </div>)}
      </div></div>
    </section>
  );
}
