import { NextResponse } from "next/server";
import { z } from "zod";
import { authorize, requireRole, fail, HttpError } from "@/lib/server";
import { bankReviewSchema } from "@/lib/validation";
import { bankAdapter } from "@/lib/bank-adapter";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  try {
    const { db, profile } = await authorize(request);
    requireRole(
      profile,
      ["entidad_financiera"],
      "Solo una entidad financiera autorizada puede evaluar solicitudes o emitir ofertas.",
    );

    const id = z.uuid().parse((await context.params).id);
    const input = bankReviewSchema.parse(await request.json());

    let offerPayload = null;
    if (input.action === "emitir_oferta") {
      if (!input.offer) {
        throw new HttpError(400, "Debes incluir las condiciones de la oferta bancaria.");
      }
      const expiresAt = new Date(
        Date.now() + input.offer.expires_days * 24 * 60 * 60 * 1000,
      ).toISOString();

      offerPayload = {
        principal_minor: input.offer.principal_minor,
        total_payable_minor: input.offer.total_payable_minor,
        installment_count: input.offer.installment_count,
        installment_amount_minor: input.offer.installment_amount_minor,
        annual_rate_bps: input.offer.annual_rate_bps,
        conditions_text: input.offer.conditions_text,
        expires_at: expiresAt,
        is_demo: input.offer.is_demo,
      };
    }

    const result = await bankAdapter.reviewApplication(db, {
      applicationId: id,
      action: input.action,
      reason: input.reason,
      offer: offerPayload,
    });

    return NextResponse.json(result);
  } catch (e) {
    return fail(e);
  }
}