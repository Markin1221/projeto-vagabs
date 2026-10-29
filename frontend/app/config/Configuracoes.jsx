"use client";
import { useRef, useState } from "react";
import { useConfig } from "../config";
import Modal from "../ui/Modal";
import { API, autFetch } from "../lib";

// Três cliques seguidos na logo abrem a senha do Bureau Secreto (modo escondido do Tapa Buraco).
function LogoOculta() {
  const cliques = useRef([]);
  const [aberto, setAberto] = useState(false);
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);
  function clicar() {
    const agora = Date.now();
    cliques.current = [...cliques.current.filter((t) => agora - t < 700), agora];
    if (cliques.current.length >= 3) { cliques.current = []; setSenha(""); setErro(""); setAberto(true); }
  }
  async function entrar(e) {
    e.preventDefault(); setEnviando(true); setErro("");
    try {
      const r = await autFetch(API + "/raiox/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ senha }) });
      const c = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(r.status === 403 ? "Acesso negado." : "Não consegui falar com o servidor.");
      try { sessionStorage.setItem("vagabs-raiox", c.token); } catch {}
      setAberto(false);
      window.dispatchEvent(new Event("vagabs-secreto"));
    } catch (x) { setErro(x.message); setSenha(""); }
    setEnviando(false);
  }
  return (
    <>
      <div className="logo-oculta">
        <button type="button" onClick={clicar} aria-label="VAGABS">
          <img className="logo-img logo-claro" src="/logo-claro.png" alt="" draggable="false" />
          <img className="logo-img logo-escuro" src="/logo-escuro.png" alt="" draggable="false" />
        </button>
      </div>
      {aberto && (
        <Modal titulo="Identificação" subtitulo="Digite a senha de acesso." onClose={() => setAberto(false)}>
          <form className={"senha-secreta" + (erro ? " erro" : "")} onSubmit={entrar} key={erro}>
            <label>Senha<input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} autoFocus autoComplete="off" required /></label>
            {erro && <p className="msg ruim" role="alert">{erro}</p>}
            <button type="submit" className="btn primario" disabled={enviando || !senha}>{enviando ? "Verificando…" : "Entrar"}</button>
          </form>
        </Modal>)}
    </>
  );
}

export default function Configuracoes() {
  const { dicas, setDicas } = useConfig();
  return (
    <>
      <section className="painel">
        <div className="painel-cab"><h2>Preferências</h2><p>Valem para você neste computador e ficam salvas: da próxima vez que abrir o sistema, continuam como você deixou.</p></div>
        <label className="interruptor">
          <input type="checkbox" role="switch" checked={dicas} onChange={(e) => setDicas(e.target.checked)} />
          <span className="trilho" aria-hidden />
          <span><b>Mostrar dicas passo a passo</b><small>Cada ferramenta exibe um guia curto de como usar. Desligue quando já souber o caminho.</small></span>
        </label>
      </section>
      <LogoOculta />
    </>
  );
}
