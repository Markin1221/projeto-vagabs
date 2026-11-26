"use client";
// Casca do sistema (lateral, topo, login). O grupo (sistema) não aparece na URL: as rotas são /folha, /quinzena,
// /extrato e /config. A área /pagina-secreta fica fora deste grupo e tem casca própria.
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Login from "../Login";
import Entrada from "../ui/Entrada";
import MobileTabelas from "../ui/MobileTabelas";
import Mascote from "../ui/Mascote";
import Cofrinho from "../ui/Cofrinho";
import { API, lerToken } from "../lib";
import { ConfigProvider } from "../config";
import { Folha as IconeFolha, Etiqueta, Comparar, Cofre, Engrenagem, Sol, Lua, Onibus, Caixa } from "../ui/Icones";

const FERRAMENTAS = [
  { href: "/folha", curto: "Folha", nome: "Folha de pagamento", Icone: IconeFolha, titulo: "Lançamentos da folha", desc: "Converta o Resumo Geral dos PDFs em lançamentos prontos para importar." },
  { href: "/quinzena", curto: "Quinzena", nome: "Quinzena dos permissionários", Icone: Etiqueta, titulo: "Quinzena dos permissionários", desc: "Transforme o relatório de remuneração da quinzena em lançamentos por item." },
  { href: "/extrato", curto: "Extrato", nome: "Extrato × DDATA", Icone: Comparar, titulo: "Extrato × DDATA", desc: "Encontre os pagamentos do banco que ainda não foram lançados no DDATA Sol." },
  { href: "/caixinha", curto: "Caixinha", nome: "Caixinha", Icone: Cofre, titulo: "Caixinha", desc: "Transforme a planilha da caixinha do mês no CSV de importação." },
  { href: "/estoque", curto: "Estoque", nome: "Estoque", Icone: Caixa, titulo: "Estoque do administrativo", desc: "Saldo dos produtos, quem pegou e quando, e quem já pediu." },
];
const CONFIG = { href: "/config", curto: "Ajustes", nome: "Configurações", Icone: Engrenagem, titulo: "Configurações", desc: "Ajuste como o sistema se comporta para você." };

export default function LayoutSistema({ children }) {
  const caminho = usePathname();
  const router = useRouter();
  const [tema, setTema] = useState("light");
  const [mascote, setMascote] = useState("ambos"); // ambos | onibus | cofrinho | nenhum
  const [menuMascote, setMenuMascote] = useState(false);
  const [acesso, setAcesso] = useState("conectando"); // conectando | login | ok | falha
  const conectar = () => {
    setAcesso("conectando");
    fetch(API + "/saude").then((r) => r.json())
      .then((c) => setAcesso(!c.protegido || lerToken() ? "ok" : "login")).catch(() => setAcesso("falha"));
  };
  useEffect(() => { conectar(); const volta = () => setAcesso("login"); window.addEventListener("vagabs-401", volta); return () => window.removeEventListener("vagabs-401", volta); }, []);
  useEffect(() => { setTema(document.documentElement.dataset.theme || "light"); try { const m = localStorage.getItem("vagabs-mascote"); setMascote(["ambos", "onibus", "cofrinho", "nenhum"].includes(m) ? m : m === "off" ? "nenhum" : "ambos"); } catch {} }, []);
  function escolherMascote(v) {
    setMascote(v); setMenuMascote(false);
    try { localStorage.setItem("vagabs-mascote", v); } catch {}
  }
  useEffect(() => {
    if (!menuMascote) return;
    const fora = (e) => { if (!e.target.closest?.(".menu-mascote-caixa")) setMenuMascote(false); };
    const esc = (e) => e.key === "Escape" && setMenuMascote(false);
    document.addEventListener("pointerdown", fora); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", fora); document.removeEventListener("keydown", esc); };
  }, [menuMascote]);
  function alternarTema() {
    const novo = tema === "dark" ? "light" : "dark";
    setTema(novo); document.documentElement.dataset.theme = novo;
    try { localStorage.setItem("vagabs-tema", novo); } catch {}
  }
  const f = [...FERRAMENTAS, CONFIG].find((x) => caminho?.startsWith(x.href)) || FERRAMENTAS[0];
  const Item = ({ t, n }) => {
    const ativa = t.href === f.href;
    return (
      <li><button type="button" className={ativa ? "ativa" : ""} aria-current={ativa ? "page" : undefined}
        onMouseEnter={() => router.prefetch(t.href)} onClick={() => router.push(t.href)}>
        <span className="parada" aria-hidden="true">{n}</span><t.Icone /><span className="nome">{t.nome}</span><span className="curto">{t.curto}</span></button></li>
    );
  };
  if (acesso !== "ok") {
    return (
      <ConfigProvider>
        {acesso === "login" ? <Login aoEntrar={() => setAcesso("ok")} /> : (
          <Entrada>
            {acesso === "conectando"
              ? <div className="entrada-form" role="status"><h1>Conectando…</h1><p className="mudo"><span className="giro" /> Acordando o servidor. Na primeira vez do dia pode levar cerca de um minuto.</p></div>
              : <div className="entrada-form"><h1>Sem conexão</h1><p className="msg ruim" role="alert">Não consegui falar com o servidor. Confira a internet e tente de novo.</p><button type="button" className="btn primario grande" onClick={conectar}>Tentar de novo</button></div>}
          </Entrada>)}
      </ConfigProvider>
    );
  }
  return (
    <ConfigProvider>
      <MobileTabelas />
      <div className="app" data-linha={f.href.slice(1)}>
        <nav className="lateral" aria-label="Ferramentas">
          <div className="marca-app">
            <img className="logo-img logo-claro" src="/logo-claro.png" alt="VAGABS — Versátil Assistente de Gestão Administrativa, Business e Serviços" />
            <img className="logo-img logo-escuro" src="/logo-escuro.png" alt="" aria-hidden="true" />
          </div>
          <ul>{FERRAMENTAS.map((t, i) => <Item key={t.href} t={t} n={i + 1} />)}</ul>
          <ul className="lateral-fim"><Item t={CONFIG} n="•" /></ul>
        </nav>
        <div className="principal">
          <header className="topo">
            <div className="topo-tit"><span className="topo-icone"><f.Icone /></span><div><h1>{f.titulo}</h1><p>{f.desc}</p></div></div>
            <div className="topo-botoes">
            <div className="menu-mascote-caixa">
              <button type="button" className="btn tema" onClick={() => setMenuMascote(!menuMascote)} aria-expanded={menuMascote} aria-haspopup="true" title="Mascotes">
                <Onibus /><span>Mascote</span>
              </button>
              {menuMascote && (
                <div className="menu-mascote" role="radiogroup" aria-label="Mascotes na tela">
                  {[["ambos", "Os dois", "Busão na estrada e Cofrinho no canto"], ["onibus", "Só o Busão", "Anda pela estrada e acompanha as contas"], ["cofrinho", "Só o Cofrinho", "Bichinho que você alimenta e leva para outro canto"], ["nenhum", "Nenhum", "Tela limpa"]].map(([v, nome, desc]) => (
                    <button key={v} type="button" role="radio" aria-checked={mascote === v} className={mascote === v ? "ativo" : ""} onClick={() => escolherMascote(v)}><b>{nome}</b><small>{desc}</small></button>))}
                </div>)}
            </div>
            <button type="button" className="btn tema" onClick={alternarTema} aria-label={tema === "dark" ? "Usar tema claro" : "Usar tema escuro"}>
              {tema === "dark" ? <Sol /> : <Lua />}<span>{tema === "dark" ? "Claro" : "Escuro"}</span>
            </button>
            </div>
          </header>
          <main key={f.href}>{children}</main>
        </div>
      </div>
      {(mascote === "ambos" || mascote === "onibus") && <Mascote linha={f.href.slice(1)} />}
      {(mascote === "ambos" || mascote === "cofrinho") && <Cofrinho />}
    </ConfigProvider>
  );
}
