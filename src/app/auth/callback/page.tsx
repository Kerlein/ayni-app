"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase-browser";
export default function Callback() {
  const [error, setError] = useState("");
  useEffect(() => {
    async function verify() {
      try {
        const params = new URLSearchParams(location.hash.slice(1));
        if (params.get("error_description"))
          throw new Error("El enlace no es válido o ha vencido.");
        const {
          data: { session },
          error,
        } = await supabase().auth.getSession();
        if (error || !session)
          throw new Error(
            "No se pudo confirmar el acceso. Solicita un nuevo enlace o inicia sesión.",
          );
        location.replace("/app");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Enlace inválido.");
      }
    }
    void verify();
  }, []);
  return (
    <main className="center-page">
      <div className="card">
        <h1>{error ? "Revisa tu enlace" : "Confirmando tu cuenta…"}</h1>
        <p role="status">
          {error || "Un momento, estamos verificando tu acceso."}
        </p>
        <Link href="/login" className="text-link">
          Ir a iniciar sesión
        </Link>
      </div>
    </main>
  );
}
