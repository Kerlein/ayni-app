import { NextResponse } from "next/server";
import { authorize, fail, dbError } from "@/lib/server";
import {
  createSupportCaseSchema,
  updateSupportCaseSchema,
} from "@/lib/validation";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { db } = await authorize(request);
    const { data, error } = await db
      .from("support_cases")
      .select("*")
      .order("created_at", { ascending: false });
    dbError(error);
    return NextResponse.json(
      { cases: data || [] },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return fail(e);
  }
}

export async function POST(request: Request) {
  try {
    const { db, user } = await authorize(request);
    const input = createSupportCaseSchema.parse(await request.json());
    const { data, error } = await db
      .from("support_cases")
      .insert({
        reporter_id: user.id,
        organization_id: input.organization_id ?? null,
        related_credit_id: input.related_credit_id ?? null,
        related_order_id: input.related_order_id ?? null,
        category: input.category,
        subject: input.subject,
        description: input.description,
      })
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
    const { db } = await authorize(request);
    const input = updateSupportCaseSchema.parse(await request.json());
    const { error } = await db
      .from("support_cases")
      .update({
        status: input.status,
        resolution_notes: input.resolution_notes,
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.id);
    dbError(error);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}