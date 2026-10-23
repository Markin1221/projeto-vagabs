"use client";
import { useEffect, useState } from "react";
import Folha from "./folha/Folha";
import { Folha as IconeFolha, Sol, Lua } from "./ui/Icones";

const FERRAMENTAS = [{ id: "folha", nome: "Folha de pagamento", curto: "PDFs da folha", Icone: IconeFolha, Tela: Folha, titulo: "Lançamentos da folha", desc: "Converta o Resumo Geral dos PDFs em lançamentos prontos para importar." }];

export default function Pagina() {
  const [ativa, setAtiva] = useState("folha");
  const [tema, setTema] = useState("light");
  useEffect(() => { setTema(document.documentElement.dataset.theme || "light"); }, []);
  function alternarTema() {
    const novo = tema === "dark" ? "light" : "dark";
    setTema(novo); document.documentElement.dataset.theme = novo;
    try { localStorage.setItem("vagabs-tema", novo); } catch {}
  }
  const f = FERRAMENTAS.find((x) => x.id === ativa);
  return (
    <div className="app">
      <nav className="lateral" aria-label="Ferramentas">
        <div className="marca-app"><span className="logo" aria-hidden>V</span><div><b>VAGABS</b><small>Coopernorte</small></div></div>
        <ul>{FERRAMENTAS.map(({ id, nome, Icone }) => (
          <li key={id}><button type="button" className={id === ativa ? "ativa" : ""} aria-current={id === ativa ? "page" : undefined} onClick={() => setAtiva(id)}><Icone />{nome}</button></li>))}</ul>
      </nav>
      <div className="principal">
        <header className="topo">
          <div><h1>{f.titulo}</h1><p>{f.desc}</p></div>
          <button type="button" className="btn tema" onClick={alternarTema} aria-label={tema === "dark" ? "Usar tema claro" : "Usar tema escuro"}>
            {tema === "dark" ? <Sol /> : <Lua />}<span>{tema === "dark" ? "Claro" : "Escuro"}</span>
          </button>
        </header>
        <main><f.Tela /></main>
      </div>
    </div>
  );
}
