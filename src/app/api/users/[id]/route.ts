import { NextResponse } from "next/server";
import { z } from "zod";
import { authorize, fail, dbError } from "@/lib/server";
import { updateUserSchema } from "@/lib/validation";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function PATCH(request: Request, context: Context) {
  try {
    const { db } = await authorize(request, true);
    const id = z.uuid().parse((await context.params).id);
    const input = updateUserSchema.parse(await request.json());
    const { error } = await db.rpc("admin_update_user", {
      target: id,
      p_name: input.full_name,
      p_phone: input.phone,
      p_role: input.role,
      p_status: input.status,
      p_delete: false,
    });
    dbError(error);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
export async function DELETE(request: Request, context: Context) {
  try {
    const { db } = await authorize(request, true);
    const id = z.uuid().parse((await context.params).id);
    const { error } = await db.rpc("admin_update_user", {
      target: id,
      p_name: null,
      p_phone: null,
      p_role: null,
      p_status: null,
      p_delete: true,
    });
    dbError(error);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
