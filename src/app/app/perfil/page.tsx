"use client";
import { useState } from "react";
import { UserRound, ShieldCheck, Save, Mail } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { api, supabase } from "@/lib/supabase-browser";
import { profileSchema } from "@/lib/validation";
import { roleLabels } from "@/lib/types";
export default function ProfilePage() {
  const { profile, refresh } = useAuth();
  const [busy, setBusy] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  if (!profile) return null;
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const f = new FormData(e.currentTarget);
      const data = profileSchema.parse({
        full_name: f.get("full_name"),
        phone: f.get("phone"),
      });
      await api("/api/me", { method: "PATCH", body: JSON.stringify(data) });
      await refresh();
      setMessage("Perfil actualizado correctamente.");
    } catch (e) {
      setError(
        e instanceof Error
          ? e.name === "ZodError"
            ? "Revisa el nombre y el teléfono."
            : e.message
          : "No se pudo guardar.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function reset() {
    setResetBusy(true);
    setMessage("");
    setError("");
    try {
      const { error } = await supabase().auth.resetPasswordForEmail(
        profile!.email,
        { redirectTo: `${location.origin}/nueva-contrasena` },
      );
      if (error)
        throw new Error(
          "No se pudo enviar el enlace. Espera unos minutos e intenta de nuevo.",
        );
      setMessage(
        "Te enviamos un enlace para cambiar la contraseña. Revisa tu correo.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al enviar.");
    } finally {
      setResetBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="section-kicker">TU CUENTA</span>
          <h1>Mi perfil</h1>
          <p>Mantén tu información al día.</p>
        </div>
      </div>
      {message && (
        <div className="success-message" role="status">
          {message}
        </div>
      )}
      {error && (
        <div className="error-message" role="alert">
          {error}
        </div>
      )}
      <div className="profile-layout">
        <aside className="card profile-summary">
          <div className="avatar large">
            {profile.full_name.slice(0, 2).toUpperCase()}
          </div>
          <h2>{profile.full_name}</h2>
          <p>{profile.email}</p>
          <span className={`role-badge ${profile.role}`}>
            {roleLabels[profile.role]}
          </span>
          <div className="menu-rule" />
          <span className="status-badge activo">
            <span />
            Cuenta activa
          </span>
          <small>
            Miembro desde{" "}
            {new Date(profile.created_at).toLocaleDateString("es-BO")}
          </small>
        </aside>
        <div className="profile-forms">
          <section className="card">
            <h2 className="section-title">
              <UserRound size={21} />
              Información personal
            </h2>
            <form
              className="form-stack"
              onSubmit={save}
              key={profile.updated_at}
            >
              <label>
                Nombre completo
                <input
                  name="full_name"
                  defaultValue={profile.full_name}
                  required
                  minLength={3}
                  maxLength={100}
                />
              </label>
              <div className="form-grid">
                <label>
                  Correo electrónico
                  <input type="email" value={profile.email} readOnly />
                </label>
                <label>
                  Teléfono
                  <input
                    name="phone"
                    defaultValue={profile.phone}
                    maxLength={20}
                  />
                </label>
              </div>
              <p className="field-hint">
                Tu rol es asignado por un administrador.
              </p>
              <button className="button primary" disabled={busy}>
                <Save size={17} />
                {busy ? "Guardando…" : "Guardar cambios"}
              </button>
            </form>
          </section>
          <section className="card" id="seguridad">
            <h2 className="section-title">
              <ShieldCheck size={21} />
              Seguridad
            </h2>
            <p>Recibe un enlace en tu correo para cambiar tu contraseña.</p>
            <button
              className="button"
              disabled={resetBusy}
              onClick={() => void reset()}
            >
              <Mail size={17} />
              {resetBusy ? "Enviando…" : "Cambiar contraseña"}
            </button>
          </section>
        </div>
      </div>
    </>
  );
}
