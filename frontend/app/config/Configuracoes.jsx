"use client";
import { useConfig } from "../config";

export default function Configuracoes() {
  const { dicas, setDicas } = useConfig();
  return (
    <section className="painel">
      <div className="painel-cab"><h2>Preferências</h2><p>Valem para você neste computador e ficam salvas: da próxima vez que abrir o sistema, continuam como você deixou.</p></div>
      <label className="interruptor">
        <input type="checkbox" role="switch" checked={dicas} onChange={(e) => setDicas(e.target.checked)} />
        <span className="trilho" aria-hidden />
        <span><b>Mostrar dicas passo a passo</b><small>Cada ferramenta exibe um guia curto de como usar. Desligue quando já souber o caminho.</small></span>
      </label>
    </section>
  );
}
