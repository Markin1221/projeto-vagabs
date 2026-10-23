export const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
export const SECOES = ["adicional", "desconto", "total", "gps", "pis", "fgts", "calculado"];
export const VAZIO = { codigo_pdf: "", nome_pdf: "", descricao: "", secao: "adicional", tipo_lancamento: "DEBITO", centro_custo_fixo: "", item_despesa: "", gera_lancamento: true, calculo: "", grupo: "folha", observacao: "", ativo: true };

const CHAVE_TOKEN = "vagabs-token";
export const lerToken = () => { try { return localStorage.getItem(CHAVE_TOKEN) || ""; } catch { return ""; } };
export const guardarToken = (t) => { try { t ? localStorage.setItem(CHAVE_TOKEN, t) : localStorage.removeItem(CHAVE_TOKEN); } catch {} };

// fetch que leva a senha de acesso; se a API responder 401, avisa a tela para pedir a senha de novo
export async function autFetch(url, opcoes = {}) {
  const t = lerToken();
  const r = await fetch(url, { ...opcoes, headers: { ...(opcoes.headers || {}), ...(t ? { Authorization: `Bearer ${t}` } : {}) } });
  if (r.status === 401 && typeof window !== "undefined") { guardarToken(""); window.dispatchEvent(new Event("vagabs-401")); }
  return r;
}

export async function api(caminho, opcoes) {
  const r = await autFetch(API + caminho, { ...opcoes, headers: { "Content-Type": "application/json" } });
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
