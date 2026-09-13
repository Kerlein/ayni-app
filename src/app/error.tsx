"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="center-page">
      <h1>No pudimos cargar esta página</h1>
      <p>Intenta nuevamente. Si el problema continúa, revisa la conexión.</p>
      <button className="button primary" onClick={reset}>
        Reintentar
      </button>
    </main>
  );
}
