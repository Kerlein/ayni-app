import { createClient, type SupabaseClient } from "@supabase/supabase-js";
let client: SupabaseClient | undefined;
export function isConfigured() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  return (
    !!url && !!key && !url.includes("TU-PROYECTO") && !key.includes("TU-CLAVE")
  );
}
export function supabase() {
  if (!isConfigured())
    throw new Error("Configura Supabase en .env.local y reinicia el servidor.");
  return (client ??= createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    },
  ));
}
export async function api<T = unknown>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const {
    data: { session },
  } = await supabase().auth.getSession();
  if (!session) throw new Error("Tu sesión terminó. Vuelve a iniciar sesión.");
  const response = await fetch(path, {
    ...options,
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
      ...options.headers,
    },
  });
  const body = await response.json();
  if (!response.ok)
    throw new Error(body.error || "No se pudo completar la operación.");
  return body as T;
}
