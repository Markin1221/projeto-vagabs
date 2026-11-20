"use client";
// Casca das telas de entrada (login e "conectando"): formulário de um lado, fita de soma 3D do outro.
import dynamic from "next/dynamic";

const FitaSoma3D = dynamic(() => import("./FitaSoma3D"), { ssr: false });

export default function Entrada({ children }) {
  return (
    <main className="entrada">
      <div className="entrada-lado">
        <div className="entrada-marca">
          <img className="logo-img logo-claro" src="/logo-claro.png" alt="VAGABS — Versátil Assistente de Gestão Administrativa, Business e Serviços" />
          <img className="logo-img logo-escuro" src="/logo-escuro.png" alt="" aria-hidden="true" />
        </div>
        <div className="entrada-corpo">{children}</div>
        <p className="entrada-rodape">Ferramentas internas da contabilidade Coopernorte</p>
      </div>
      <div className="entrada-cena"><FitaSoma3D /></div>
    </main>
  );
}
