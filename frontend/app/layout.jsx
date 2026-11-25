import "./globals.css";
import "./tema.css";
import "./mobile.css";

export const viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };
export const metadata = { title: "VAGABS · Folha", description: "Ferramentas internas da Coopernorte" };

// Aplica o tema salvo antes de pintar a página (evita piscar claro→escuro)
const temaInicial = `try{if(location.pathname.indexOf("/pagina-secreta")!==0)document.documentElement.dataset.v="2"}catch(e){}try{var t=localStorage.getItem("vagabs-tema");if(!t)t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";document.documentElement.dataset.theme=t}catch(e){}`;

export default function Layout({ children }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;600&family=Saira+Condensed:wght@500;600;700&family=Saira+Stencil+One&display=swap" rel="stylesheet" />
        <script dangerouslySetInnerHTML={{ __html: temaInicial }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
