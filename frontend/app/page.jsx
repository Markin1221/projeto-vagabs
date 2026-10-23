"use client";
import { useEffect, useState } from "react";
import Folha from "./folha/Folha";
import Classificador from "./classificador/Classificador";
import Comparador from "./comparador/Comparador";
import Configuracoes from "./config/Configuracoes";
import Login from "./Login";
import { API, lerToken } from "./lib";
import { ConfigProvider } from "./config";
import { Folha as IconeFolha, Etiqueta, Comparar, Engrenagem, Sol, Lua } from "./ui/Icones";

const FERRAMENTAS = [
  { id: "folha", nome: "Folha de pagamento", Icone: IconeFolha, Tela: Folha, titulo: "Lançamentos da folha", desc: "Converta o Resumo Geral dos PDFs em lançamentos prontos para importar." },
  { id: "classificador", nome: "Classificador do extrato", Icone: Etiqueta, Tela: Classificador, titulo: "Classificador do extrato", desc: "Sugira centro de custo e item de despesa para cada linha do extrato do Sol." },
  { id: "comparador", nome: "Extrato × DDATA", Icone: Comparar, Tela: Comparador, titulo: "Extrato × DDATA", desc: "Encontre os pagamentos do banco que ainda não foram lançados no DDATA Sol." },
];
const CONFIG = { id: "config", nome: "Configurações", Icone: Engrenagem, Tela: Configuracoes, titulo: "Configurações", desc: "Ajuste como o sistema se comporta para você." };

export default function Pagina() {
  const [ativa, setAtiva] = useState("folha");
  const [tema, setTema] = useState("light");
  const [acesso, setAcesso] = useState("conectando"); // conectando | login | ok | falha
  const conectar = () => {
    setAcesso("conectando");
    fetch(API + "/saude").then((r) => r.json())
      .then((c) => setAcesso(!c.protegido || lerToken() ? "ok" : "login")).catch(() => setAcesso("falha"));
  };
  useEffect(() => { conectar(); const volta = () => setAcesso("login"); window.addEventListener("vagabs-401", volta); return () => window.removeEventListener("vagabs-401", volta); }, []);
  useEffect(() => { setTema(document.documentElement.dataset.theme || "light"); }, []);
  function alternarTema() {
    const novo = tema === "dark" ? "light" : "dark";
    setTema(novo); document.documentElement.dataset.theme = novo;
    try { localStorage.setItem("vagabs-tema", novo); } catch {}
  }
  const f = [...FERRAMENTAS, CONFIG].find((x) => x.id === ativa);
  const Item = ({ t }) => (
    <li><button type="button" className={t.id === ativa ? "ativa" : ""} aria-current={t.id === ativa ? "page" : undefined} onClick={() => setAtiva(t.id)}><t.Icone />{t.nome}</button></li>
  );
  if (acesso !== "ok") {
    return (
      <ConfigProvider>
        {acesso === "login" ? <Login aoEntrar={() => setAcesso("ok")} /> : (
          <main className="login"><div className="painel login-caixa">
            {acesso === "conectando"
              ? <p>Conectando ao servidor… na primeira vez do dia pode levar cerca de um minuto.</p>
              : <><p className="msg ruim">Não consegui falar com o servidor.</p><button type="button" className="btn primario" onClick={conectar}>Tentar de novo</button></>}
          </div></main>)}
      </ConfigProvider>
    );
  }
  return (
    <ConfigProvider>
      <div className="app">
        <nav className="lateral" aria-label="Ferramentas">
          <div className="marca-app">
            <img className="logo-img logo-claro" src="/logo-claro.png" alt="VAGABS — Versátil Assistente de Gestão Administrativa, Business e Serviços" />
            <img className="logo-img logo-escuro" src="/logo-escuro.png" alt="" aria-hidden="true" />
          </div>
          <ul>{FERRAMENTAS.map((t) => <Item key={t.id} t={t} />)}</ul>
          <ul className="lateral-fim"><Item t={CONFIG} /></ul>
        </nav>
        <div className="principal">
          <header className="topo">
            <div><h1>{f.titulo}</h1><p>{f.desc}</p></div>
            <button type="button" className="btn tema" onClick={alternarTema} aria-label={tema === "dark" ? "Usar tema claro" : "Usar tema escuro"}>
              {tema === "dark" ? <Sol /> : <Lua />}<span>{tema === "dark" ? "Claro" : "Escuro"}</span>
            </button>
          </header>
          <main key={f.id}><f.Tela /></main>
        </div>
      </div>
    </ConfigProvider>
  );
}
