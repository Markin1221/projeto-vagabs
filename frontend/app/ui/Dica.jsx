"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useConfig } from "../config";
import { Chevron } from "./Icones";

// Passo a passo de cada ferramenta. Só aparece se a pessoa deixou "dicas" ligadas em Configurações.
// Dá para recolher; cada página lembra se a pessoa deixou aberto ou fechado.
export default function Dica({ titulo = "Como usar", passos, nota }) {
  const { dicas } = useConfig();
  const caminho = usePathname() || "";
  const chave = "vagabs-dica-fechada:" + caminho;
  const [aberta, setAberta] = useState(true);
  useEffect(() => { try { setAberta(localStorage.getItem(chave) !== "1"); } catch {} }, [chave]);
  if (!dicas) return null;
  const alternar = () => {
    const nova = !aberta; setAberta(nova);
    try { nova ? localStorage.removeItem(chave) : localStorage.setItem(chave, "1"); } catch {}
  };
  return (
    <aside className={"dica" + (aberta ? " aberto" : "")} aria-label={titulo}>
      <button type="button" className="dica-cab" onClick={alternar} aria-expanded={aberta}>
        <Chevron className="seta" />
        <h3>{titulo}</h3>
        <span className="dica-conta">{passos.length} passos</span>
      </button>
      <div className="gaveta"><div>
        <ol>{passos.map((p, i) => <li key={i}>{p}</li>)}</ol>
        {nota && <p className="dica-nota">{nota}</p>}
      </div></div>
    </aside>
  );
}
