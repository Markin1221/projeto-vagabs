import Link from "next/link";
import { OPERACOES } from "./operacoes";

// Central de operações: um cartão por pasta registrada em operacoes.js.
export default function Central() {
  return (
    <section className="painel">
      <div className="painel-cab"><h2>Operações</h2><p>{OPERACOES.length} operação(ões) ativa(s). Escolha uma para abrir.</p></div>
      <div className="sec-ops">
        {OPERACOES.map((o) => (
          <Link key={o.href} href={o.href} className="sec-op">
            <span className="sec-op-cod">{o.codigo} · ativa</span>
            <b>{o.nome}</b>
            <span className="sec-op-desc">{o.desc}</span>
            <span className="sec-op-ir">Abrir dossiê →</span>
          </Link>))}
      </div>
    </section>
  );
}
