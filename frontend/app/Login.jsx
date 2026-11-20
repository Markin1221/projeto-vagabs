"use client";
import { useState } from "react";
import { API, guardarToken } from "./lib";
import Entrada from "./ui/Entrada";

export default function Login({ aoEntrar }) {
  const [senha, setSenha] = useState("");
  const [ver, setVer] = useState(false);
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
    <Entrada>
      <form className="entrada-form" onSubmit={entrar}>
        <div>
          <h1>Entrar</h1>
          <p className="mudo">Use a senha de acesso da equipe.</p>
        </div>
        <label>Senha de acesso
          <span className="campo-senha">
            <input type={ver ? "text" : "password"} value={senha} onChange={(e) => setSenha(e.target.value)}
              autoFocus autoComplete="current-password" required aria-invalid={!!erro} aria-describedby={erro ? "erro-login" : undefined} />
            <button type="button" className="btn leve" onClick={() => setVer(!ver)} aria-pressed={ver}>{ver ? "Ocultar" : "Mostrar"}</button>
          </span>
        </label>
        {erro && <p id="erro-login" className="msg ruim" role="alert">{erro}</p>}
        <button type="submit" className="btn primario grande" disabled={enviando || !senha}>{enviando ? "Entrando…" : "Entrar"}</button>
      </form>
    </Entrada>
  );
}
