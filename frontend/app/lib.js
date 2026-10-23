export const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
export const SECOES = ["adicional", "desconto", "total", "gps", "pis", "fgts", "calculado"];
export const VAZIO = { codigo_pdf: "", nome_pdf: "", descricao: "", secao: "adicional", tipo_lancamento: "DEBITO", centro_custo_fixo: "", item_despesa: "", gera_lancamento: true, calculo: "", grupo: "folha", observacao: "", ativo: true };

export async function api(caminho, opcoes) {
  const r = await fetch(API + caminho, { headers: { "Content-Type": "application/json" }, ...opcoes });
  const corpo = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(typeof corpo.detail === "string" ? corpo.detail : JSON.stringify(corpo.detail || corpo));
  return corpo;
}

export const fmt = (v) => (v ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const data = (iso) => (iso ? iso.split("-").reverse().join("/") : "");
export const ORIGEM = {
  resumo: "Resumo Geral · adicionais e descontos",
  gps: "Quadro GPS",
  fgts: "Quadro FGTS",
  darf: "Quadro DARF e PIS",
};
