import { NextResponse } from "next/server";
import { z } from "zod";
import { authorize, requireRole, fail, dbError } from "@/lib/server";
import { respondOfferSchema } from "@/lib/validation";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  try {
    const { db, profile } = await authorize(request);
    requireRole(
      profile,
      ["cliente"],
      "Solo el cliente titular puede responder a una oferta bancaria.",
    );

    const id = z.uuid().parse((await context.params).id);
    const input = respondOfferSchema.parse(await request.json());

    const { data, error } = await db.rpc("client_respond_offer", {
      p_offer_id: id,
      p_accept: input.accept,
      p_acceptance_note: input.acceptance_note,
    });
    dbError(error);
    return NextResponse.json(data);
  } catch (e) {
    return fail(e);
  }
}