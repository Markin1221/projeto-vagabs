"use client";
import { useEffect, useState } from "react";
import Modal from "./Modal";
import { API, ORIGEM, fmt } from "../lib";

// Mostra o pedaço do PDF de onde saiu um valor. `alvo` = { titulo, valor, pdf_nome, pdf_origem, componentes? }
export default function Fonte({ alvo, arquivo, nomeArquivo, onClose }) {
  const comps = (alvo.componentes || []).filter((c) => c.pdf_nome);
  const [sel, setSel] = useState(alvo.pdf_nome ? alvo : comps.find((c) => c.valor) || comps[0] || null);
  const [img, setImg] = useState(null);
  const [estado, setEstado] = useState("carregando");

  useEffect(() => {
    if (!sel) { setEstado("vazio"); return; }
    let vivo = true, url = null;
    setEstado("carregando"); setImg(null);
    const fd = new FormData();
    fd.append("arquivo", arquivo); fd.append("nome", sel.pdf_nome); fd.append("origem", sel.pdf_origem || "resumo");
    if (sel.valor != null) fd.append("valor", String(sel.valor));
    fetch(API + "/folha/trecho", { method: "POST", body: fd })
      .then((r) => (r.ok ? r.blob() : Promise.reject()))
      .then((b) => { if (vivo) { url = URL.createObjectURL(b); setImg(url); setEstado("ok"); } })
      .catch(() => vivo && setEstado("erro"));
    return () => { vivo = false; url && URL.revokeObjectURL(url); };
  }, [sel, arquivo]);

  return (
    <Modal largo titulo={alvo.titulo} subtitulo={`${nomeArquivo} · valor ${fmt(alvo.valor)}`} onClose={onClose}>
      {comps.length > 0 && (
        <div className="partes">
          <p className="dica">Este valor é calculado. Escolha uma parcela para ver onde ela está no PDF.</p>
          <ul>{(alvo.componentes || []).map((c, i) => (
            <li key={i}>
              <button type="button" disabled={!c.pdf_nome} className={sel === c || sel?.pdf_nome === c.pdf_nome && sel?.valor === c.valor && sel?.pdf_origem === c.pdf_origem ? "ativo" : ""}
                onClick={() => setSel(c)}>
                <span>{c.nome}</span><i /><b>{fmt(c.valor)}</b>
              </button>
            </li>))}</ul>
        </div>
      )}
      {sel && <p className="origem">{sel.nome || sel.pdf_nome} <span>— {ORIGEM[sel.pdf_origem || "resumo"]}</span></p>}
      <div className="recorte">
        {estado === "carregando" && <div className="esqueleto" aria-label="Carregando" />}
        {estado === "ok" && <img src={img} alt={`Trecho do PDF com ${sel.pdf_nome} destacado`} />}
        {estado === "erro" && <p className="vazio">Não consegui localizar esse trecho no PDF.</p>}
        {estado === "vazio" && <p className="vazio">Este valor não aparece no PDF: o evento não está nele, então entra como 0,00.</p>}
      </div>
    </Modal>
  );
}
