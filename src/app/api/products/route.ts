import { NextResponse } from "next/server";
import { authorize, requireRole, fail, dbError } from "@/lib/server";
import { createProductSchema, updateProductSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { db } = await authorize(request);
    const params = new URL(request.url).searchParams;
    const merchantId = params.get("merchant_org_id");
    const onlyAvailable = params.get("available") === "true";

    let query = db
      .from("products")
      .select("*, organizations(name)")
      .order("created_at", { ascending: false });

    if (merchantId) query = query.eq("merchant_org_id", merchantId);
    if (onlyAvailable) query = query.eq("is_available", true).gt("stock", 0);

    const { data, error } = await query;
    dbError(error);

    const products = (data || []).map((p) => {
      const org = Array.isArray(p.organizations)
        ? p.organizations[0]
        : p.organizations;
      return {
        ...p,
        merchant_name: org?.name ?? "",
        organizations: undefined,
      };
    });

    return NextResponse.json(
      { products },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return fail(e);
  }
}

export async function POST(request: Request) {
  try {
    const { db, profile } = await authorize(request);
    requireRole(profile, ["comercio"], "Solo un comercio activo puede publicar productos.");
    const input = createProductSchema.parse(await request.json());

    const { data, error } = await db
      .from("products")
      .insert(input)
      .select("id")
      .single();
    dbError(error);
    return NextResponse.json({ id: data?.id }, { status: 201 });
  } catch (e) {
    return fail(e);
  }
}

export async function PATCH(request: Request) {
  try {
    const { db, profile } = await authorize(request);
    requireRole(profile, ["comercio"], "Solo el comercio propietario puede editar sus productos.");
    const { id, ...fields } = updateProductSchema.parse(await request.json());

    const { error } = await db
      .from("products")
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq("id", id);
    dbError(error);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}