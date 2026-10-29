"use client";
import { useEffect } from "react";

// No celular as tabelas viram cartões (ver mobile.css). Cada célula precisa saber o nome da sua coluna;
// aqui copiamos o texto do cabeçalho para data-label. Roda sozinho em qualquer tabela .tabela, inclusive
// as que aparecem depois (listas que carregam do servidor, filtros, etc.).
function rotular(tabela) {
  const cab = [...tabela.querySelectorAll("thead th")].map((h) => h.textContent.trim());
  if (!cab.length) return;
  tabela.querySelectorAll("tbody tr").forEach((tr) => {
    let i = 0;
    for (const td of tr.children) {
      if (td.tagName !== "TD") continue;
      const nome = cab[i] || "";
      if (nome) { if (td.dataset.label !== nome) td.dataset.label = nome; }
      else if (td.dataset.label) delete td.dataset.label;
      i += td.colSpan || 1;
    }
  });
}

export default function MobileTabelas() {
  useEffect(() => {
    let pendente = 0;
    const rodar = () => { pendente = 0; document.querySelectorAll("table.tabela").forEach(rotular); };
    const agendar = () => { if (!pendente) pendente = requestAnimationFrame(rodar); };
    rodar();
    const obs = new MutationObserver(agendar); // só estrutura (linhas novas); mudar data-label não dispara de novo
    obs.observe(document.body, { childList: true, subtree: true });
    return () => { obs.disconnect(); if (pendente) cancelAnimationFrame(pendente); };
  }, []);
  return null;
}
