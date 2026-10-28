"use client";
import { useState } from "react";
import { Chevron, Ok, Alerta, Fechar } from "../ui/Icones";
import { fmt, data as dataBR } from "../lib";

export default function QArquivo({ f, r, aberto, grupos, opcoesLinha, aoAlternar, aoRemover, aoMudar, aoCriarRegra, aoVerCarros }) {
  const [linhaAberta, setLinhaAberta] = useState(null);
  const [escolha, setEscolha] = useState({});
  const [padroes, setPadroes] = useState({});
  const [erroRegra, setErroRegra] = useState("");
  const estado = !r ? "lendo" : r.ok ? "ok" : "problema";
  const nProb = r?.problemas?.length || 0;
  const dep = Number(String(f.deposito || "").replace(/\./g, "").replace(",", "."));
  const difDep = f.deposito && r?.total_quinzena != null ? Math.round((r.total_quinzena - dep) * 100) / 100 : null;

  async function criar(p) {
    const ev = p.evento, linha = escolha[ev.nome];
    setErroRegra("");
    try { await aoCriarRegra(padroes[ev.nome] ?? ev.sugestao, linha); } catch (x) { setErroRegra(x.message); }
  }

  return (
    <section className={"arq " + estado + (aberto ? " aberto" : "")}>
      <div className="arq-topo">
        <button type="button" className="arq-nome" aria-expanded={aberto} onClick={aoAlternar}>
          <Chevron className="seta" />
          <span className="arq-status" aria-hidden>{estado === "lendo" ? <i className="giro" /> : estado === "ok" ? <Ok /> : <Alerta />}</span>
          <span className="arq-titulo"><b>{f.file.name}</b>
            <small>{!r ? "Lendo o relatório…" : r.erro ? "Não foi possível usar" : <>{r.grupo} · {r.n_carros} carros · {r.linhas.length} linhas · total {fmt(r.total_quinzena)}</>}</small>
          </span>
        </button>
        <span className={"selo " + (estado === "ok" ? "ok" : estado === "problema" ? "ruim" : "neutro")}>
          {estado === "lendo" ? "Conferindo" : estado === "ok" ? "Pronto para gerar" : `${nProb} ${nProb === 1 ? "problema" : "problemas"}`}
        </span>
        <button type="button" className="icone" onClick={aoRemover} aria-label={`Remover ${f.file.name}`}><Fechar /></button>
      </div>
      <div className="gaveta"><div>
        {r && (
          <div className="arq-corpo">
            <div className="grade-form">
              <label>Grupo<select value={f.grupo} onChange={(e) => aoMudar("grupo", e.target.value)}>
                <option value="">{r.grupo ? `${r.grupo} (pelo nome do arquivo)` : "Escolha o grupo"}</option>
                {grupos.map((g) => <option key={g}>{g}</option>)}</select></label>
              {r.linhas && <label>Crédito aos permissionários<input inputMode="decimal" value={f.credito} placeholder={fmt(Math.abs(r.credito_calculado))}
                onChange={(e) => aoMudar("credito", e.target.value)} /><span className="dica-campo">Vazio = calculado pelo relatório</span></label>}
              {r.linhas && <label>Depósito no banco<input inputMode="decimal" value={f.deposito} placeholder="Para conferir" onChange={(e) => aoMudar("deposito", e.target.value)} /></label>}
            </div>

            {r.problemas?.length > 0 && (
              <div className="problemas" role="alert">
                <h3>Resolva {nProb === 1 ? "este problema" : "estes problemas"} para poder gerar os lançamentos</h3>
                {r.problemas.map((p, i) => (
                  <div key={i} className="problema">
                    <div className="problema-txt"><b>{p.titulo}</b><p>{p.detalhe}</p></div>
                    {p.evento && (
                      <div className="problema-acoes">
                        <label>Quando o evento contiver<input value={padroes[p.evento.nome] ?? p.evento.sugestao} onChange={(e) => setPadroes({ ...padroes, [p.evento.nome]: e.target.value })} /></label>
                        <label>vai para a linha<select value={escolha[p.evento.nome] || ""} onChange={(e) => setEscolha({ ...escolha, [p.evento.nome]: e.target.value })}>
                          <option value="">Escolha…</option>{opcoesLinha.map((o) => <option key={o.codigo} value={o.codigo}>{o.nome}</option>)}</select></label>
                        <button type="button" className="btn primario" disabled={!escolha[p.evento.nome]} onClick={() => criar(p)}>Criar regra</button>
                        <button type="button" className="btn leve" onClick={() => aoVerCarros({ nome: p.evento.nome, valor: p.evento.total, por_carro: p.evento.por_carro })}>Ver carros</button>
                      </div>)}
                  </div>))}
                {erroRegra && <p className="msg ruim">{erroRegra}</p>}
              </div>)}
            {(r.avisos || []).map((a, i) => <p key={i} className="aviso"><Alerta />{a}</p>)}

            {r.linhas && (
              <div>
                <h3 className="sub-tit">Lançamentos que serão gerados <small>Toque numa linha para ver os eventos que a formam</small></h3>
                <div className="conf">
                  <div className="conf-cab q"><span>Descrição</span><span>Tipo</span><span>Centro · item</span><span>Data</span><span>Valor</span></div>
                  {r.linhas.map((l) => {
                    const ab = linhaAberta === l.codigo;
                    return (
                      <div key={l.codigo} className={"conf-item" + (ab ? " aberto" : "")}>
                        <button type="button" className="conf-linha q" aria-expanded={ab} onClick={() => setLinhaAberta(ab ? null : l.codigo)}>
                          <span className="conf-nome"><Chevron className="seta" />{l.descricao}</span>
                          <span><span className={"tipo " + (l.tipo_lancamento === "DEBITO" ? "deb" : "cred")}>{l.tipo_lancamento === "DEBITO" ? "Débito" : "Crédito"}</span></span>
                          <span>{l.codigo_centro_de_custo} · {l.codigo_item_despesa || "—"}</span>
                          <span>{dataBR(l.data_inicial)}</span>
                          <span className="num">{fmt(l.valor)}</span>
                        </button>
                        <div className="gaveta"><div>
                          <div className="fita">
                            <p className="fita-tit">{`De onde vem ${l.descricao.toLowerCase()}`}</p>
                            <ul>{l.composicao.map((p, i) => (
                              <li key={i}><span className="sinal">{i === 0 ? "" : "+"}</span>
                                <button type="button" className="parcela" onClick={() => aoVerCarros(p)} title="Ver por carro"><span>{p.nome}</span><i /><b>{fmt(p.valor)}</b></button></li>))}</ul>
                            <div className="fita-total"><span>Soma (o lançamento usa o valor sem sinal)</span><i /><b>{fmt(l.total_eventos)}</b></div>
                          </div>
                        </div></div>
                      </div>);
                  })}
                </div>
                <div className="totais-lanc">
                  <div className="total-bloco"><button type="button" disabled><span>Total da quinzena</span><b className="num">{fmt(r.total_quinzena)}</b></button></div>
                  {difDep !== null && (
                    <div className="total-bloco"><button type="button" disabled className={Math.abs(difDep) < 0.01 ? "bate" : "nao-bate"}>
                      <span>{Math.abs(difDep) < 0.01 ? "Bate com o depósito" : "Diferença para o depósito"}</span><b className="num">{fmt(difDep)}</b></button></div>)}
                </div>
                <p className="dica-campo" style={{ marginTop: 8 }}>Líquido dos carros {fmt(r.liquido)} · saldo negativo da quinzena anterior {fmt(r.saldo_negativo)} · taxa: {r.taxa.carros} carros, Cooperativa {fmt(r.taxa.cooperativa)}, Sindicato {fmt(r.taxa.sindicato)}</p>
              </div>)}
          </div>)}
      </div></div>
    </section>
  );
}
