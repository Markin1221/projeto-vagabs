"use client";
import { useConfig } from "../config";

// Passo a passo de cada ferramenta. Só aparece se a pessoa deixou "dicas" ligadas em Configurações.
export default function Dica({ titulo = "Como usar", passos, nota }) {
  const { dicas } = useConfig();
  if (!dicas) return null;
  return (
    <aside className="dica" aria-label={titulo}>
      <h3>{titulo}</h3>
      <ol>{passos.map((p, i) => <li key={i}>{p}</li>)}</ol>
      {nota && <p className="dica-nota">{nota}</p>}
    </aside>
  );
}
