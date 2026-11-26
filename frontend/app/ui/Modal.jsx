"use client";
import { useEffect, useRef } from "react";
import { Fechar } from "./Icones";

export default function Modal({ titulo, subtitulo, onClose, largo, children, rodape }) {
  const ref = useRef(null);
  // onClose chega como função nova a cada render (ex.: () => setEdit(null)). Se ele fosse dependência do efeito,
  // cada tecla digitada rodaria o efeito de novo e o foco pularia para a caixa do modal. Por isso fica num ref.
  const fechar = useRef(onClose);
  fechar.current = onClose;
  useEffect(() => {
    const anterior = document.activeElement;
    if (!ref.current?.contains(document.activeElement)) ref.current?.focus();
    const tecla = (e) => e.key === "Escape" && fechar.current();
    document.addEventListener("keydown", tecla);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", tecla); document.body.style.overflow = ""; anterior?.focus?.(); };
  }, []);
  return (
    <div className="modal-fundo" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={"modal" + (largo ? " largo" : "")} role="dialog" aria-modal="true" aria-label={titulo} tabIndex={-1} ref={ref}>
        <header className="modal-topo">
          <div><h2>{titulo}</h2>{subtitulo && <p>{subtitulo}</p>}</div>
          <button type="button" className="icone" onClick={onClose} aria-label="Fechar"><Fechar /></button>
        </header>
        <div className="modal-corpo">{children}</div>
        {rodape && <footer className="modal-rodape">{rodape}</footer>}
      </div>
    </div>
  );
}
