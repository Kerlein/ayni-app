import { NextResponse } from "next/server";
import { authorize, fail, dbError } from "@/lib/server";
import { profileSchema } from "@/lib/validation";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const { profile } = await authorize(request);
    return NextResponse.json(profile, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return fail(e);
  }
}
export async function PATCH(request: Request) {
  try {
    const { db, user } = await authorize(request);
    const input = profileSchema.parse(await request.json());
    const { error } = await db.from("profiles").update(input).eq("id", user.id);
    dbError(error);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
