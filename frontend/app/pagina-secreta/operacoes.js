// Operações da área secreta. Para criar uma nova: crie a pasta app/pagina-secreta/<nome>/page.jsx
// e acrescente uma linha aqui (ela aparece na lateral e na Central de operações).
export const OPERACOES = [
  {
    href: "/pagina-secreta/tapa-buraco", codigo: "OP-01", curto: "Tapa Buraco", nome: "Projeto Tapa Buraco",
    titulo: "Projeto Tapa Buraco", desc: "Auditoria do caixa: alertas, picos fora do padrão e parecer da IA.",
  },
  {
    href: "/pagina-secreta/resumos", codigo: "OP-02", curto: "Resumos", nome: "Resumos financeiros",
    titulo: "Resumos financeiros", desc: "Relatório bruto do sistema vira planilha/PDF tratado de cada mês + resumo de todos.",
  },
];
export const CENTRAL = { href: "/pagina-secreta", curto: "Central", nome: "Central de operações", titulo: "Central de operações", desc: "Operações em andamento do Bureau Secreto." };

// Chaves da sessão (somem ao fechar a aba do navegador)
export const CHAVE_TOKEN = "vagabs-raiox"; // token da senha secreta, conferido pelo backend
export const CHAVE_CHEGADA = "vagabs-secreto-chegada"; // mostra a animação de "acesso concedido" uma vez
