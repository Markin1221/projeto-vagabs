import "./globals.css";
import "./mobile.css";

export const viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };
export const metadata = { title: "VAGABS · Folha", description: "Ferramentas internas da Coopernorte" };

// Aplica o tema salvo antes de pintar a página (evita piscar claro→escuro)
const temaInicial = `try{var t=localStorage.getItem("vagabs-tema");if(!t)t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";document.documentElement.dataset.theme=t}catch(e){}`;

export default function Layout({ children }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;600&family=Saira+Stencil+One&display=swap" rel="stylesheet" />
        <script dangerouslySetInnerHTML={{ __html: temaInicial }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
