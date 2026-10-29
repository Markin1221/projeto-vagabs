import Link from "next/link";

// Página "não encontrada". Também é o que aparece em /pagina-secreta para quem não passou pela senha.
export default function NaoEncontrada() {
  return (
    <main className="login">
      <div className="painel login-caixa" style={{ textAlign: "center" }}>
        <p className="mudo" style={{ fontSize: 13, letterSpacing: ".08em" }}>ERRO 404</p>
        <h1 style={{ fontSize: 22, fontWeight: 600 }}>Página não encontrada</h1>
        <p className="mudo">O endereço que você abriu não existe no sistema.</p>
        <Link href="/folha" className="btn primario">Voltar ao início</Link>
      </div>
    </main>
  );
}
