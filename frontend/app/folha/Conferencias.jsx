"use client";
import { useState } from "react";
import { Chevron, Ok, Alerta, Olho } from "../ui/Icones";
import { fmt } from "../lib";

// Cada total da folha é uma "fita de soma": abre e mostra as parcelas que formam o número.
export default function Conferencias({ itens, aoVerFonte, abertoInicial }) {
  const [abertos, setAbertos] = useState(() => new Set(abertoInicial ? itens.filter((c) => !c.ok).map((c) => c.nome) : []));
  const alterna = (n) => setAbertos((s) => { const x = new Set(s); x.has(n) ? x.delete(n) : x.add(n); return x; });
  return (
    <div className="conf">
      <div className="conf-cab"><span>Total</span><span>No PDF</span><span>Soma dos eventos</span><span>Diferença</span><span /></div>
      {itens.map((c) => {
        const aberto = abertos.has(c.nome);
        return (
          <div key={c.nome} className={"conf-item" + (aberto ? " aberto" : "") + (c.ok ? "" : " diverge")}>
            <button type="button" className="conf-linha" aria-expanded={aberto} onClick={() => alterna(c.nome)}>
              <span className="conf-nome"><Chevron className="seta" />{c.nome}</span>
              <span className="num">{fmt(c.pdf)}</span>
              <span className="num">{fmt(c.calculado)}</span>
              <span className="num">{c.ok ? "0,00" : fmt(c.diferenca)}</span>
              <span className={"selo " + (c.ok ? "ok" : "ruim")}>{c.ok ? <><Ok />Confere</> : <><Alerta />Diverge</>}</span>
            </button>
            <div className="gaveta"><div>
              <div className="fita">
                <p className="fita-tit">De onde vem a soma de {c.nome.toLowerCase()}</p>
                <ul>
                  {c.composicao.map((p, i) => (
                    <li key={i} className={p.valor === 0 ? "zero" : ""}>
                      <span className="sinal">{p.sinal === "-" ? "−" : i === 0 ? "" : "+"}</span>
                      {p.pdf_nome
                        ? <button type="button" className="parcela" onClick={() => aoVerFonte({ titulo: p.nome, valor: p.valor, pdf_nome: p.pdf_nome, pdf_origem: p.pdf_origem })} title="Ver no PDF"><span>{p.nome}</span><i /><b>{fmt(p.valor)}</b><Olho /></button>
                        : <div className="parcela fixa"><span>{p.nome}</span><i /><b>{fmt(p.valor)}</b></div>}
                    </li>))}
                  {c.composicao.length === 0 && <li className="zero"><div className="parcela fixa"><span>Nenhum evento cadastrado entra nesta soma</span></div></li>}
                </ul>
                <div className="fita-total"><span>Soma dos eventos</span><i /><b>{fmt(c.calculado)}</b></div>
                <button type="button" className="fita-pdf" onClick={() => aoVerFonte({ titulo: c.nome, valor: c.pdf, pdf_nome: c.pdf_nome, pdf_origem: c.pdf_origem })}>
                  <span>Total que o PDF mostra</span><i /><b>{fmt(c.pdf)}</b><Olho />
                </button>
                {!c.ok && <p className="fita-alerta">Diferença de {fmt(c.diferenca)}. Quase sempre é um evento do PDF que ainda não está cadastrado, ou um valor lido no lugar errado.</p>}
              </div>
            </div></div>
          </div>
        );
      })}
    </div>
  );
}
