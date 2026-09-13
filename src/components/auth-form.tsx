"use client";
import Link from "next/link";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  ArrowLeft,
  Eye,
  EyeOff,
  ShieldCheck,
  Check,
  Mail,
} from "lucide-react";
import { Brand } from "./brand";
import { supabase, isConfigured } from "@/lib/supabase-browser";
import { useAuth } from "./auth-provider";
import { createUserSchema, passwordSchema } from "@/lib/validation";
type Mode = "login" | "registro" | "recuperar" | "nueva-contrasena";
const titles: Record<Mode, string> = {
  login: "Qué bueno verte de nuevo.",
  registro: "Tu próximo paso empieza aquí.",
  recuperar: "Recupera tu acceso.",
  "nueva-contrasena": "Una nueva contraseña.",
};
export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const { refresh, profile } = useAuth();
  const [busy, setBusy] = useState(false);
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [recoveryReady, setRecoveryReady] = useState(false);
  useEffect(() => {
    if (profile && mode === "login") router.replace("/app");
  }, [profile, mode, router]);
  useEffect(() => {
    if (mode !== "nueva-contrasena" || !isConfigured()) return;
    void supabase()
      .auth.getUser()
      .then(({ data }) => setRecoveryReady(!!data.user));
    const {
      data: { subscription },
    } = supabase().auth.onAuthStateChange((_e, s) => setRecoveryReady(!!s));
    return () => subscription.unsubscribe();
  }, [mode]);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setBusy(true);
    const f = new FormData(e.currentTarget);
    const email = String(f.get("email") || "").trim();
    const password = String(f.get("password") || "");
    try {
      const db = supabase();
      if (mode === "login") {
        const { error } = await db.auth.signInWithPassword({ email, password });
        if (error)
          throw new Error(
            error.code === "email_not_confirmed"
              ? "Confirma tu correo antes de ingresar."
              : "Correo o contraseña incorrectos.",
          );
        await refresh();
        router.replace("/app");
      }
      if (mode === "registro") {
        const parsed = createUserSchema.safeParse({
          email,
          password,
          full_name: String(f.get("full_name")),
          phone: String(f.get("phone") || ""),
        });
        if (!parsed.success) throw new Error(parsed.error.issues[0].message);
        if (password !== f.get("confirmation"))
          throw new Error("Las contraseñas no coinciden.");
        const { data, error } = await db.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: parsed.data.full_name,
              phone: parsed.data.phone,
            },
            emailRedirectTo: `${location.origin}/auth/callback`,
          },
        });
        if (error)
          throw new Error(
            error.code === "over_email_send_rate_limit"
              ? "Espera unos minutos antes de solicitar otro correo."
              : "No se pudo registrar la cuenta. Comprueba tus datos e intenta nuevamente.",
          );
        if (data.session) {
          await refresh();
          router.replace("/app");
        } else
          setSuccess(
            "Revisa tu correo para confirmar tu cuenta. Si ya tenías una, puedes iniciar sesión o recuperar tu contraseña.",
          );
      }
      if (mode === "recuperar") {
        const { error } = await db.auth.resetPasswordForEmail(email, {
          redirectTo: `${location.origin}/nueva-contrasena`,
        });
        if (error)
          throw new Error(
            "No se pudo solicitar el enlace. Espera unos minutos e intenta nuevamente.",
          );
        setSuccess(
          "Si el correo está registrado, recibirás un enlace para restablecer tu contraseña. Revisa también spam.",
        );
      }
      if (mode === "nueva-contrasena") {
        passwordSchema.parse(password);
        if (password !== f.get("confirmation"))
          throw new Error("Las contraseñas no coinciden.");
        const {
          data: { user },
          error: sessionError,
        } = await db.auth.getUser();
        if (sessionError || !user)
          throw new Error("El enlace venció. Solicita uno nuevo.");
        const { error } = await db.auth.updateUser({ password });
        if (error)
          throw new Error(
            "No se pudo cambiar la contraseña. Usa una diferente e intenta nuevamente.",
          );
        const { error: signoutError } = await db.auth.signOut({
          scope: "global",
        });
        if (signoutError)
          throw new Error(
            "Contraseña actualizada. No se pudieron cerrar todas las sesiones; vuelve a iniciar sesión.",
          );
        setSuccess("Contraseña actualizada. Ya puedes iniciar sesión.");
      }
    } catch (e) {
      setError(
        e instanceof Error
          ? e.name === "ZodError"
            ? "Usa entre 10 y 72 caracteres, con letras y números."
            : e.message
          : "Ocurrió un error.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-page">
      <section className="auth-story">
        <Link
          href="https://qipuy-web.vercel.app/"
          aria-label="Volver a la landing de AYNI"
        >
          <Brand light />
        </Link>
        <div className="story-body">
          <span className="eyebrow">
            <span /> UNA OPORTUNIDAD PARA AVANZAR
          </span>
          <h1>
            Lo quieres hoy.
            <br />
            Lo pagas
            <br />
            <em>a tu ritmo.</em>
          </h1>
          <p>
            Cada pequeño paso cuenta.
            <br />
            Construye tu historia con AYNI.
          </p>
          <div className="story-line" />
          <div className="story-note">
            <ShieldCheck size={26} />
            <span>
              Tu cuenta, tu espacio.
              <br />
              <strong>El comienzo de nuevas posibilidades.</strong>
            </span>
          </div>
        </div>
        <span className="story-footer">
          Hecho para avanzar juntos. · Bolivia
        </span>
      </section>
      <section className="auth-panel">
        <Link className="back-link" href="https://qipuy-web.vercel.app/">
          <ArrowLeft size={16} /> Volver al inicio
        </Link>
        <div className="auth-content">
          <div className="mobile-brand">
            <Brand />
          </div>
          <span className="section-kicker">MI ESPACIO AYNI</span>
          <h2>{titles[mode]}</h2>
          <p className="muted">
            {mode === "login"
              ? "Ingresa tus datos para continuar."
              : mode === "registro"
                ? "Crea tu cuenta y empieza como Cliente."
                : mode === "recuperar"
                  ? "Te enviaremos un enlace a tu correo electrónico."
                  : "Elige una contraseña segura para tu cuenta."}
          </p>
          {!isConfigured() && (
            <div className="notice">
              Conexión pendiente: configura las variables de Supabase en
              .env.local para habilitar las cuentas.{" "}
              <Link href="/vista-previa">Ver diseño de la aplicación</Link>
            </div>
          )}
          {success ? (
            <div className="success-message" role="status">
              <Check size={22} />
              <div>
                {success}
                <Link className="text-link block" href="/login">
                  Ir a iniciar sesión <ArrowRight size={16} />
                </Link>
              </div>
            </div>
          ) : (
            <form onSubmit={submit} className="form-stack">
              {mode === "registro" && (
                <>
                  <label>
                    Nombre completo
                    <input
                      name="full_name"
                      autoComplete="name"
                      placeholder="Ej. Daner Jimenez"
                      minLength={3}
                      maxLength={100}
                      required
                    />
                  </label>
                  <label>
                    Teléfono <span className="optional">(opcional)</span>
                    <input
                      name="phone"
                      autoComplete="tel"
                      placeholder="Ej. 71234567"
                      maxLength={20}
                    />
                  </label>
                </>
              )}
              {mode !== "nueva-contrasena" && (
                <label>
                  Correo electrónico
                  <input
                    name="email"
                    type="email"
                    autoComplete="email"
                    placeholder="tu@correo.com"
                    required
                    maxLength={254}
                  />
                </label>
              )}
              {mode !== "recuperar" && (
                <label>
                  Contraseña
                  <div className="password-input">
                    <input
                      name="password"
                      type={show ? "text" : "password"}
                      autoComplete={
                        mode === "login" ? "current-password" : "new-password"
                      }
                      placeholder={
                        mode === "login"
                          ? "Tu contraseña"
                          : "Mínimo 10 caracteres, letras y números"
                      }
                      required
                      minLength={mode === "login" ? 1 : 10}
                      maxLength={72}
                    />
                    <button
                      type="button"
                      onClick={() => setShow(!show)}
                      aria-label={
                        show ? "Ocultar contraseña" : "Mostrar contraseña"
                      }
                    >
                      {show ? <EyeOff size={19} /> : <Eye size={19} />}
                    </button>
                  </div>
                </label>
              )}
              {(mode === "registro" || mode === "nueva-contrasena") && (
                <label>
                  Confirmar contraseña
                  <input
                    name="confirmation"
                    type={show ? "text" : "password"}
                    autoComplete="new-password"
                    placeholder="Repite tu contraseña"
                    required
                    minLength={10}
                    maxLength={72}
                  />
                </label>
              )}
              {mode === "login" && (
                <Link className="forgot-link" href="/recuperar">
                  ¿Olvidaste tu contraseña?
                </Link>
              )}
              {error && (
                <div className="error-message" role="alert">
                  {error}
                </div>
              )}
              {mode === "nueva-contrasena" && !recoveryReady && (
                <div className="notice">
                  Abre el enlace de recuperación que recibiste por correo.{" "}
                  <Link href="/recuperar">Solicitar otro enlace</Link>
                </div>
              )}
              <button
                className="button primary auth-submit"
                disabled={
                  busy ||
                  !isConfigured() ||
                  (mode === "nueva-contrasena" && !recoveryReady)
                }
              >
                {busy
                  ? "Procesando…"
                  : mode === "login"
                    ? "Iniciar sesión"
                    : mode === "registro"
                      ? "Crear mi cuenta"
                      : mode === "recuperar"
                        ? "Enviar enlace"
                        : "Guardar contraseña"}
                {mode === "recuperar" ? (
                  <Mail size={18} />
                ) : (
                  <ArrowRight size={18} />
                )}
              </button>
            </form>
          )}
          <div className="auth-bottom">
            {mode === "login" ? (
              <>
                ¿Aún no tienes cuenta? <Link href="/registro">Regístrate</Link>
              </>
            ) : (
              <>
                ¿Ya tienes cuenta? <Link href="/login">Inicia sesión</Link>
              </>
            )}
          </div>
        </div>
        <div className="auth-footer">
          <span>AYNI © {new Date().getFullYear()}</span>
          <span>Lo hacemos posible, juntos.</span>
        </div>
      </section>
    </main>
  );
}
