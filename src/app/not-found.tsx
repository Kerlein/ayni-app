import Link from "next/link";
export default function NotFound() {
  return (
    <main className="center-page">
      <h1>Página no encontrada</h1>
      <p>Esta dirección no forma parte de tu espacio AYNI.</p>
      <Link className="button primary" href="/app">
        Volver al inicio
      </Link>
    </main>
  );
}
