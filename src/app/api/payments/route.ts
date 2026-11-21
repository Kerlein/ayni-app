import { NextResponse } from "next/server";
import { authorize, requireRole, fail, dbError, HttpError } from "@/lib/server";
import {
  paymentReportSchema,
  bankConfirmPaymentSchema,
  bankReversePaymentSchema,
  bankReviewReportSchema,
} from "@/lib/validation";
import { bankAdapter } from "@/lib/bank-adapter";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const { db, profile } = await authorize(request);
    const body = (await request.json()) as { action?: string };

    if (body.action === "report") {
      requireRole(
        profile,
        ["cliente"],
        "Solo el cliente titular puede reportar pagos realizados por canales bancarios.",
      );
      const input = paymentReportSchema.parse(body);
      const { data, error } = await db.rpc("client_submit_payment_report", {
        p_credit_id: input.credit_id,
        p_installment_id: input.installment_id ?? null,
        p_reported_amount_minor: input.reported_amount_minor,
        p_payment_date: input.payment_date,
        p_reference_code: input.reference_code,
        p_notes: input.notes,
      });
      dbError(error);
      return NextResponse.json({ id: data }, { status: 201 });
    }

    if (body.action === "confirm_payment") {
      requireRole(
        profile,
        ["entidad_financiera"],
        "Solo la entidad financiera originadora puede confirmar pagos.",
      );
      const input = bankConfirmPaymentSchema.parse(body);
      const data = await bankAdapter.confirmPayment(db, {
        creditId: input.credit_id,
        externalEventId: input.external_event_id,
        amountMinor: input.amount_minor,
        operationDate: input.operation_date || new Date().toISOString(),
        allocations: input.allocations,
        linkedReportId: input.linked_report_id ?? null,
        notes: input.notes,
      });
      return NextResponse.json(data);
    }

    if (body.action === "reverse_payment") {
      requireRole(
        profile,
        ["entidad_financiera"],
        "Solo la entidad financiera originadora puede registrar reversos de pago.",
      );
      const input = bankReversePaymentSchema.parse(body);
      const data = await bankAdapter.reversePayment(db, {
        originalConfirmationId: input.original_confirmation_id,
        externalEventId: input.external_event_id,
        reason: input.reason,
      });
      return NextResponse.json(data);
    }

    if (body.action === "review_report") {
      requireRole(
        profile,
        ["entidad_financiera"],
        "Solo la entidad financiera puede observar o rechazar reportes de pago.",
      );
      const input = bankReviewReportSchema.parse(body);
      await bankAdapter.reviewPaymentReport(db, {
        reportId: input.report_id,
        status: input.status,
        reviewNotes: input.review_notes,
      });
      return NextResponse.json({ ok: true });
    }

    throw new HttpError(400, "Acción de seguimiento de pagos no válida.");
  } catch (e) {
    return fail(e);
  }
}