import { NextResponse } from "next/server";
import { authorize, fail, dbError } from "@/lib/server";
export async function GET(request: Request) {
  try {
    const { db } = await authorize(request, true);
    const { data, error } = await db
      .from("user_audit")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    dbError(error);
    return NextResponse.json(data, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return fail(e);
  }
}
