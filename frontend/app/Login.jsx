"use client";
import { useState } from "react";
import { API, guardarToken } from "./lib";

export default function Login({ aoEntrar }) {
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);
  async function entrar(e) {
    e.preventDefault(); setEnviando(true); setErro("");
    try {
      const r = await fetch(API + "/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ senha }) });
      const c = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(r.status === 401 ? "Senha incorreta. Confira e tente de novo." : "Não consegui falar com o servidor.");
      guardarToken(c.token); aoEntrar();
    } catch (x) { setErro(x.message); }
    setEnviando(false);
  }
  return (
    <main className="login">
      <form className="painel login-caixa" onSubmit={entrar}>
        <img className="logo-img logo-claro" src="/logo-claro.png" alt="VAGABS — Versátil Assistente de Gestão Administrativa, Business e Serviços" />
        <img className="logo-img logo-escuro" src="/logo-escuro.png" alt="" aria-hidden="true" />
        <label>Senha de acesso<input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} autoFocus autoComplete="current-password" required /></label>
        {erro && <p className="msg ruim" role="alert">{erro}</p>}
        <button type="submit" className="btn primario grande" disabled={enviando || !senha}>{enviando ? "Entrando…" : "Entrar"}</button>
      </form>
    </main>
  );
}
