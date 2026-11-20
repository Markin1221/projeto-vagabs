"use client";
import { useState } from "react";
import { Pdf, Ok } from "./Icones";
import { emMemoria } from "../lib";

// Área de envio de arquivo (clique ou arraste). `arquivo` é o File atual (para uma só), `rotulo` o texto vazio.
export default function Soltar({ rotulo, aceita = ".xlsx", multiplo = false, arquivo, aoEscolher }) {
  const [sobre, setSobre] = useState(false);
  const pega = async (lista) => {
    const l = await emMemoria(Array.from(lista).filter((f) => f.name.toLowerCase().endsWith(aceita)));
    if (l.length) aoEscolher(multiplo ? l : l[0]);
  };
  const tipo = aceita.replace(".", "").toUpperCase();
  return (
    <label className={"soltar" + (sobre ? " sobre" : "") + (arquivo ? " cheio" : "")}
      onDragOver={(e) => { e.preventDefault(); setSobre(true); }} onDragLeave={() => setSobre(false)}
      onDrop={(e) => { e.preventDefault(); setSobre(false); pega(e.dataTransfer.files); }}>
      <input type="file" accept={aceita} multiple={multiplo} onChange={(e) => { pega(e.target.files); e.target.value = ""; }} />
      <span className="soltar-icone">{arquivo ? <Ok /> : <Pdf />}</span>
      <span className="soltar-txt">
        {arquivo
          ? <><b>{arquivo.name}</b><small>Clique para trocar o arquivo</small></>
          : <><span><b>{rotulo}</b> ou arraste até aqui</span><small>{multiplo ? `Um ou mais arquivos ${tipo}` : `Arquivo ${tipo}`}</small></>}
      </span>
    </label>
  );
}
