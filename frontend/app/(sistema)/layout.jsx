"use client";
// Casca do sistema (lateral, topo, login). O grupo (sistema) não aparece na URL: as rotas são /folha, /quinzena,
// /extrato e /config. A área /pagina-secreta fica fora deste grupo e tem casca própria.
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Login from "../Login";
import MobileTabelas from "../ui/MobileTabelas";
import { API, lerToken } from "../lib";
import { ConfigProvider } from "../config";
import { Folha as IconeFolha, Etiqueta, Comparar, Engrenagem, Sol, Lua } from "../ui/Icones";

const FERRAMENTAS = [
  { href: "/folha", curto: "Folha", nome: "Folha de pagamento", Icone: IconeFolha, titulo: "Lançamentos da folha", desc: "Converta o Resumo Geral dos PDFs em lançamentos prontos para importar." },
  { href: "/quinzena", curto: "Quinzena", nome: "Quinzena dos permissionários", Icone: Etiqueta, titulo: "Quinzena dos permissionários", desc: "Transforme o relatório de remuneração da quinzena em lançamentos por item." },
  { href: "/extrato", curto: "Extrato", nome: "Extrato × DDATA", Icone: Comparar, titulo: "Extrato × DDATA", desc: "Encontre os pagamentos do banco que ainda não foram lançados no DDATA Sol." },
];
const CONFIG = { href: "/config", curto: "Ajustes", nome: "Configurações", Icone: Engrenagem, titulo: "Configurações", desc: "Ajuste como o sistema se comporta para você." };

export default function LayoutSistema({ children }) {
  const caminho = usePathname();
  const router = useRouter();
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
  const f = [...FERRAMENTAS, CONFIG].find((x) => caminho?.startsWith(x.href)) || FERRAMENTAS[0];
  const Item = ({ t }) => {
    const ativa = t.href === f.href;
    return (
      <li><button type="button" className={ativa ? "ativa" : ""} aria-current={ativa ? "page" : undefined}
        onMouseEnter={() => router.prefetch(t.href)} onClick={() => router.push(t.href)}>
        <t.Icone /><span className="nome">{t.nome}</span><span className="curto">{t.curto}</span></button></li>
    );
  };
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
      <MobileTabelas />
      <div className="app">
        <nav className="lateral" aria-label="Ferramentas">
          <div className="marca-app">
            <img className="logo-img logo-claro" src="/logo-claro.png" alt="VAGABS — Versátil Assistente de Gestão Administrativa, Business e Serviços" />
            <img className="logo-img logo-escuro" src="/logo-escuro.png" alt="" aria-hidden="true" />
          </div>
          <ul>{FERRAMENTAS.map((t) => <Item key={t.href} t={t} />)}</ul>
          <ul className="lateral-fim"><Item t={CONFIG} /></ul>
        </nav>
        <div className="principal">
          <header className="topo">
            <div><h1>{f.titulo}</h1><p>{f.desc}</p></div>
            <button type="button" className="btn tema" onClick={alternarTema} aria-label={tema === "dark" ? "Usar tema claro" : "Usar tema escuro"}>
              {tema === "dark" ? <Sol /> : <Lua />}<span>{tema === "dark" ? "Claro" : "Escuro"}</span>
            </button>
          </header>
          <main key={f.href}>{children}</main>
        </div>
      </div>
    </ConfigProvider>
  );
}
