"use client";
// Casca do Bureau Secreto: tudo dentro de /pagina-secreta usa esta lateral e o visual de secreto.css.
// Sem o token da senha secreta nesta aba do navegador, a área responde como página inexistente.
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import "../raiox/secreto.css";
import MobileTabelas from "../ui/MobileTabelas";
import NaoEncontrada from "../ui/NaoEncontrada";
import { ConfigProvider } from "../config";
import { Cadeado, Fechar } from "../ui/Icones";
import { CENTRAL, CHAVE_CHEGADA, CHAVE_TOKEN, OPERACOES } from "./operacoes";
import AcessoCinematico from "./AcessoCinematico";

const Radar = () => <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden><circle cx="8" cy="8" r="6" /><circle cx="8" cy="8" r="2.6" /><path d="M8 1v3M8 12v3M1 8h3M12 8h3" /></svg>;

function Relogio() {
  const [h, setH] = useState("");
  useEffect(() => { const f = () => setH(new Date().toLocaleTimeString("pt-BR")); f(); const i = setInterval(f, 1000); return () => clearInterval(i); }, []);
  return <span>{h} BRT</span>;
}

export default function CascaSecreta({ children }) {
  const caminho = usePathname();
  const router = useRouter();
  const [estado, setEstado] = useState("verificando"); // verificando | ok | negado
  const [chegando, setChegando] = useState(false);

  function sair(destino = "/config") {
    try { sessionStorage.removeItem(CHAVE_TOKEN); } catch {}
    router.replace(destino);
  }
  useEffect(() => {
    let ok = false;
    try { ok = !!sessionStorage.getItem(CHAVE_TOKEN); } catch {}
    setEstado(ok ? "ok" : "negado");
    try { if (ok && sessionStorage.getItem(CHAVE_CHEGADA)) { sessionStorage.removeItem(CHAVE_CHEGADA); setChegando(true); } } catch {}
    const negado = () => sair();            // senha secreta expirou ou foi trocada no servidor
    const semLogin = () => sair("/folha");  // senha geral do sistema caiu: volta para o login normal
    window.addEventListener("raiox-403", negado); window.addEventListener("vagabs-401", semLogin);
    return () => { window.removeEventListener("raiox-403", negado); window.removeEventListener("vagabs-401", semLogin); };
  }, []);

  if (estado === "verificando") return null;
  if (estado === "negado") return <NaoEncontrada />;

  const atual = OPERACOES.find((o) => caminho?.startsWith(o.href)) || CENTRAL;
  const Item = ({ t, Icone }) => {
    const ativa = t.href === atual.href;
    return (
      <li><button type="button" className={ativa ? "ativa" : ""} aria-current={ativa ? "page" : undefined} onClick={() => router.push(t.href)}>
        <Icone /><span className="nome">{t.nome}</span><span className="curto">{t.curto}</span></button></li>
    );
  };
  return (
    <ConfigProvider>
      <MobileTabelas />
      {chegando && <AcessoCinematico aoTerminar={() => setChegando(false)} />}
      <div className="app modo-secreto">
        <nav className="lateral" aria-label="Bureau Secreto">
          <div className="marca-app sec-cracha">
            <div className="sec-cracha-placa"><img src="/logo-secreto.png" alt="VAGABS — Vigilância Avançada e Gestão de Ameaças: Bureau Secreto" /></div>
            <small><span>Credencial</span><b>Nível 3</b></small>
          </div>
          <ul>
            <Item t={CENTRAL} Icone={Radar} />
            {OPERACOES.map((o) => <Item key={o.href} t={o} Icone={Cadeado} />)}
          </ul>
          <ul className="lateral-fim"><li><button type="button" className="sec-sair" onClick={() => sair()}><Fechar /><span className="nome">Encerrar sessão</span><span className="curto">Sair</span></button></li></ul>
        </nav>
        <div className="principal">
          <div className="sec-faixa" role="note"><span>Classificado · uso restrito</span><span>{atual.codigo ? <>Operação <i>{atual.curto}</i></> : "Central"}<span className="sec-cursor" /></span><Relogio /></div>
          <header className="topo"><div><h1>{atual.titulo}</h1><p>{atual.desc}</p></div></header>
          <main key={atual.href}>{children}</main>
        </div>
      </div>
    </ConfigProvider>
  );
}
