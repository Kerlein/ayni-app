import { NextResponse } from "next/server";
import { authorize, authAdmin, fail, dbError, HttpError } from "@/lib/server";
import { createUserSchema } from "@/lib/validation";
import { roles } from "@/lib/types";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const { db } = await authorize(request, true);
    const p = new URL(request.url).searchParams;
    const page = Math.max(1, Math.min(10000, Number(p.get("page")) || 1));
    const q = (p.get("q") || "")
      .replace(/[^\p{L}\p{N} @.'-]/gu, "")
      .slice(0, 100);
    let query = db
      .from("profiles")
      .select("*", { count: "exact" })
      .neq("status", "eliminado")
      .order("created_at", { ascending: false });
    if (q) query = query.ilike("full_name", `%${q}%`);
    const role = p.get("role");
    if (role && roles.includes(role as (typeof roles)[number]))
      query = query.eq("role", role);
    const status = p.get("status");
    if (status === "activo" || status === "inactivo")
      query = query.eq("status", status);
    const { data, error, count } = await query.range(
      (page - 1) * 10,
      page * 10 - 1,
    );
    dbError(error);
    return NextResponse.json(
      { users: data, total: count, page },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return fail(e);
  }
}
export async function POST(request: Request) {
  try {
    await authorize(request, true);
    const input = createUserSchema.parse(await request.json());
    const admin = authAdmin();
    const { data, error } = await admin.auth.admin.createUser({
      email: input.email,
      password: input.password,
      email_confirm: true,
      user_metadata: { full_name: input.full_name, phone: input.phone },
    });
    if (error)
      throw new HttpError(
        400,
        error.code === "email_exists"
          ? "Este correo ya está registrado."
          : "No se pudo crear la cuenta. Revisa el correo y la contraseña.",
      );
    return NextResponse.json({ id: data.user.id }, { status: 201 });
  } catch (e) {
    return fail(e);
  }
}
