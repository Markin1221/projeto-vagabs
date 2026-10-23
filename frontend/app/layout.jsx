import "./globals.css";

export const metadata = { title: "VAGABS" };

export default function Layout({ children }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
