"use client";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { api } from "@/lib/supabase-browser";
import type { Audit } from "@/lib/types";
const actions: Record<string, string> = {
  cuenta_creada: "Cuenta creada",
  rol_modificado: "Cambio de rol",
  estado_modificado: "Cambio de estado",
  perfil_actualizado: "Perfil actualizado",
  usuario_dado_de_baja: "Usuario dado de baja",
};
export default function Activity() {
  const { profile } = useAuth();
  const [items, setItems] = useState<Audit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (profile?.role !== "administrador") return;
    setLoading(true);
    setError("");
    const controller = new AbortController();
    api<Audit[]>("/api/audit", { signal: controller.signal })
      .then(setItems)
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [profile?.role, retry]);
  if (profile?.role !== "administrador")
    return (
      <div className="card">
        <h1>Acceso restringido</h1>
        <p>Solo los administradores pueden consultar la actividad.</p>
      </div>
    );
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="section-kicker">CONTROL DE ACCESOS</span>
          <h1>Registro de actividad</h1>
          <p>Últimos 50 cambios de cuentas, perfiles, roles y estados.</p>
        </div>
        <button
          className="button"
          disabled={loading}
          onClick={() => setRetry(retry + 1)}
        >
          Actualizar
        </button>
      </div>
      <section className="users-card">
        {error ? (
          <div className="error-message" role="alert">
            {error}
          </div>
        ) : loading ? (
          <div className="empty-state">Cargando actividad…</div>
        ) : !items.length ? (
          <div className="empty-state">
            Todavía no hay actividad registrada.
          </div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Acción</th>
                  <th>Usuario afectado</th>
                  <th>Realizado por</th>
                  <th>Fecha</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <strong>{actions[item.action] || item.action}</strong>
                      {item.action === "rol_modificado" && (
                        <small className="block">
                          {String(item.details.rol_anterior)} →{" "}
                          {String(item.details.rol_nuevo)}
                        </small>
                      )}
                    </td>
                    <td className="mono" title={item.target_id}>
                      {item.target_id}
                    </td>
                    <td className="mono">
                      {item.actor_id || "Registro / sistema"}
                    </td>
                    <td>{new Date(item.created_at).toLocaleString("es-BO")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
