"use client";
import { useState } from "react";
import { Chevron } from "../ui/Icones";

const TIPO = { departamento: "Departamento", passagem: "Contas de passagem", receita: "Receita" };

// Consulta dos centros de custo cadastrados (código usado no CSV e nome do departamento)
export default function Centros({ centros, eventos }) {
  const [aberto, setAberto] = useState(false);
  const fixos = (cod) => eventos.filter((e) => e.ativo && e.gera_lancamento && e.centro_custo_fixo === cod).length;
  return (
    <section className={"painel colapso" + (aberto ? " aberto" : "")}>
      <button type="button" className="colapso-cab" aria-expanded={aberto} onClick={() => setAberto(!aberto)}>
        <Chevron className="seta" />
        <h2>Centros de custo</h2>
        <span className="contagem">{centros.length} cadastrados</span>
      </button>
      <div className="gaveta"><div>
        <div className="tabela-rolo">
          <table className="tabela">
            <thead><tr><th>Código</th><th>Nome</th><th>Tipo</th><th className="d">Eventos com este centro fixo</th></tr></thead>
            <tbody>
              {centros.map((c) => (
                <tr key={c.codigo}>
                  <td><div className="ev-nome">{c.codigo}</div></td><td>{c.nome}</td><td>{TIPO[c.tipo] || c.tipo}</td>
                  <td className="d num">{fixos(c.codigo) || <span className="mudo">—</span>}</td>
                </tr>))}
              {centros.length === 0 && <tr><td colSpan={4} className="vazio">Nenhum centro de custo carregado.</td></tr>}
            </tbody>
          </table>
        </div>
      </div></div>
    </section>
  );
}
