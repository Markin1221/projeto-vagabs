"use client";
import { useEffect, useState } from "react";
import Folha from "./folha/Folha";
import Quinzena from "./quinzena/Quinzena";
import Comparador from "./comparador/Comparador";
import RaioX from "./raiox/RaioX";
import Configuracoes from "./config/Configuracoes";
import Login from "./Login";
import MobileTabelas from "./ui/MobileTabelas";
import { API, lerToken } from "./lib";
import { ConfigProvider } from "./config";
import { Folha as IconeFolha, Etiqueta, Comparar, Cadeado, Engrenagem, Sol, Lua, Fechar } from "./ui/Icones";
import "./raiox/secreto.css";

const FERRAMENTAS = [
  { id: "folha", curto: "Folha", nome: "Folha de pagamento", Icone: IconeFolha, Tela: Folha, titulo: "Lançamentos da folha", desc: "Converta o Resumo Geral dos PDFs em lançamentos prontos para importar." },
  { id: "quinzena", curto: "Quinzena", nome: "Quinzena dos permissionários", Icone: Etiqueta, Tela: Quinzena, titulo: "Quinzena dos permissionários", desc: "Transforme o relatório de remuneração da quinzena em lançamentos por item." },
  { id: "comparador", curto: "Extrato", nome: "Extrato × DDATA", Icone: Comparar, Tela: Comparador, titulo: "Extrato × DDATA", desc: "Encontre os pagamentos do banco que ainda não foram lançados no DDATA Sol." },
];
const TAPA = { id: "raiox", curto: "Tapa Buraco", nome: "Projeto Tapa Buraco", Icone: Cadeado, Tela: RaioX, titulo: "Projeto Tapa Buraco", desc: "Auditoria do caixa: alertas, picos fora do padrão e parecer da IA." };
const CHAVE_SECRETO = "vagabs-secreto";

function Relogio() {
  const [h, setH] = useState("");
  useEffect(() => { const f = () => setH(new Date().toLocaleTimeString("pt-BR")); f(); const i = setInterval(f, 1000); return () => clearInterval(i); }, []);
  return <span>{h} BRT</span>;
}
const CONFIG = { id: "config", curto: "Ajustes", nome: "Configurações", Icone: Engrenagem, Tela: Configuracoes, titulo: "Configurações", desc: "Ajuste como o sistema se comporta para você." };

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
  // modo secreto: liberado pelos 3 cliques na logo de Configurações; dura enquanto a aba do navegador estiver aberta
  const [secreto, setSecreto] = useState(false);
  const [chegando, setChegando] = useState(false);
  useEffect(() => {
    try { if (sessionStorage.getItem(CHAVE_SECRETO) && sessionStorage.getItem("vagabs-raiox")) setSecreto(true); } catch {}
    const entra = () => { try { sessionStorage.setItem(CHAVE_SECRETO, "1"); } catch {} setSecreto(true); setChegando(true); setTimeout(() => setChegando(false), 2100); };
    const sai = () => sairSecreto();
    window.addEventListener("vagabs-secreto", entra); window.addEventListener("raiox-403", sai);
    return () => { window.removeEventListener("vagabs-secreto", entra); window.removeEventListener("raiox-403", sai); };
  }, []);
  function sairSecreto() {
    try { sessionStorage.removeItem(CHAVE_SECRETO); sessionStorage.removeItem("vagabs-raiox"); } catch {}
    setSecreto(false); setAtiva("config");
  }
  function alternarTema() {
    const novo = tema === "dark" ? "light" : "dark";
    setTema(novo); document.documentElement.dataset.theme = novo;
    try { localStorage.setItem("vagabs-tema", novo); } catch {}
  }
  const f = [...FERRAMENTAS, CONFIG].find((x) => x.id === ativa) || CONFIG;
  const Item = ({ t }) => (
    <li><button type="button" className={t.id === ativa ? "ativa" : ""} aria-current={t.id === ativa ? "page" : undefined} onClick={() => setAtiva(t.id)}><t.Icone /><span className="nome">{t.nome}</span><span className="curto">{t.curto}</span></button></li>
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
  if (secreto) {
    return (
      <ConfigProvider>
        <MobileTabelas />
        {chegando && (
          <div className="sec-acesso" aria-hidden="true"><div>
            <p>&gt; verificando credencial…</p><p>&gt; canal criptografado estabelecido</p><p>&gt; bureau secreto · terminal 07</p>
            <b>ACESSO CONCEDIDO</b>
          </div></div>)}
        <div className="app modo-secreto">
          <nav className="lateral" aria-label="Bureau Secreto">
            <div className="marca-app sec-cracha">
              <div className="sec-cracha-placa"><img src="/logo-secreto.png" alt="VAGABS — Vigilância Avançada e Gestão de Ameaças: Bureau Secreto" /></div>
              <small><span>Credencial</span><b>Nível 3</b></small>
            </div>
            <ul><li><button type="button" className="ativa" aria-current="page"><Cadeado /><span className="nome">{TAPA.nome}</span><span className="curto">{TAPA.curto}</span></button></li></ul>
            <ul className="lateral-fim"><li><button type="button" className="sec-sair" onClick={sairSecreto}><Fechar /><span className="nome">Encerrar sessão</span><span className="curto">Sair</span></button></li></ul>
          </nav>
          <div className="principal">
            <div className="sec-faixa" role="note"><span>Classificado · uso restrito</span><span>Operação <i>Tapa Buraco</i><span className="sec-cursor" /></span><Relogio /></div>
            <header className="topo"><div><h1>{TAPA.titulo}</h1><p>{TAPA.desc}</p></div></header>
            <main><RaioX /></main>
          </div>
        </div>
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
