import "server-only";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import type { Profile } from "./types";
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function publicEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key || url.includes("TU-PROYECTO"))
    throw new HttpError(503, "Falta configurar la conexión con Supabase.");
  return { url, key };
}
export async function authorize(request: Request, admin = false) {
  const { url, key } = publicEnv();
  const token = request.headers
    .get("authorization")
    ?.match(/^Bearer (.+)$/)?.[1];
  if (!token) throw new HttpError(401, "Debes iniciar sesión.");
  const db = createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const {
    data: { user },
    error,
  } = await db.auth.getUser(token);
  if (error || !user)
    throw new HttpError(401, "Sesión inválida. Inicia sesión nuevamente.");
  const { data: profile, error: profileError } = await db
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();
  if (profileError || !profile)
    throw new HttpError(
      403,
      "Perfil no disponible. Contacta al administrador.",
    );
  if (profile.status !== "activo")
    throw new HttpError(
      403,
      "Tu cuenta está desactivada. Contacta al administrador.",
    );
  if (admin && profile.role !== "administrador")
    throw new HttpError(
      403,
      "Solo un administrador puede realizar esta acción.",
    );
  return { db, user, profile: profile as Profile };
}
export function authAdmin() {
  const { url } = publicEnv();
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key || key.includes("TU-CLAVE"))
    throw new HttpError(
      503,
      "El servidor necesita SUPABASE_SECRET_KEY para crear cuentas.",
    );
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
export function fail(error: unknown) {
  if (error instanceof HttpError)
    return NextResponse.json(
      { error: error.message },
      { status: error.status },
    );
  if (error instanceof ZodError)
    return NextResponse.json(
      { error: error.issues[0]?.message || "Datos inválidos." },
      { status: 400 },
    );
  if (error instanceof SyntaxError)
    return NextResponse.json(
      { error: "La solicitud no contiene JSON válido." },
      { status: 400 },
    );
  console.error(
    "AYNI: operación fallida",
    error instanceof Error ? error.message : "error interno",
  );
  return NextResponse.json(
    {
      error:
        "No se pudo completar la operación. Revisa la configuración e intenta nuevamente.",
    },
    { status: 500 },
  );
}
export function dbError(error: { message: string; code?: string } | null) {
  if (error)
    throw new HttpError(error.code === "42501" ? 403 : 400, error.message);
}
