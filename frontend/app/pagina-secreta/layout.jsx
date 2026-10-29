import CascaSecreta from "./CascaSecreta";

// Fora do índice de buscadores; o título não entrega o que é.
export const metadata = { title: "VAGABS", robots: { index: false, follow: false } };

export default function LayoutSecreto({ children }) {
  return <CascaSecreta>{children}</CascaSecreta>;
}
