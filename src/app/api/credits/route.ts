import { NextResponse } from "next/server";
import { authorize, requireRole, fail, dbError, HttpError } from "@/lib/server";
import {
  formalizeCreditSchema,
  disburseCreditSchema,
  publishScheduleSchema,
} from "@/lib/validation";
import { bankAdapter } from "@/lib/bank-adapter";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { db } = await authorize(request);
    const { data: credits, error: cErr } = await db
      .from("linked_credits")
      .select(
        "*, organizations(name), purchase_orders(order_code, client_name_snapshot)",
      )
      .order("created_at", { ascending: false });
    dbError(cErr);

    const creditIds = (credits || []).map((c) => c.id);
    const schedulesByCredit = new Map<string, Array<Record<string, unknown>>>();
    const reportsByCredit = new Map<string, unknown[]>();
    const confsByCredit = new Map<string, unknown[]>();

    if (creditIds.length > 0) {
      const [
        { data: schedules, error: sErr },
        { data: installments, error: iErr },
        { data: reports, error: rErr },
        { data: confs, error: cfErr },
      ] = await Promise.all([
        db
          .from("schedule_versions")
          .select("*")
          .in("credit_id", creditIds)
          .order("version_number", { ascending: false }),
        db
          .from("installments")
          .select("*")
          .in("credit_id", creditIds)
          .order("installment_number", { ascending: true }),
        db
          .from("payment_reports")
          .select("*")
          .in("credit_id", creditIds)
          .order("created_at", { ascending: false }),
        db
          .from("bank_payment_confirmations")
          .select("*")
          .in("credit_id", creditIds)
          .order("received_at", { ascending: false }),
      ]);
      dbError(sErr);
      dbError(iErr);
      dbError(rErr);
      dbError(cfErr);

      const instBySched = new Map<string, unknown[]>();
      for (const inst of installments || []) {
        const list = instBySched.get(inst.schedule_version_id) || [];
        list.push(inst);
        instBySched.set(inst.schedule_version_id, list);
      }

      for (const sch of schedules || []) {
        const list = schedulesByCredit.get(sch.credit_id) || [];
        list.push({ ...sch, installments: instBySched.get(sch.id) || [] });
        schedulesByCredit.set(sch.credit_id, list);
      }

      for (const rep of reports || []) {
        const list = reportsByCredit.get(rep.credit_id) || [];
        list.push(rep);
        reportsByCredit.set(rep.credit_id, list);
      }

      for (const cf of confs || []) {
        const list = confsByCredit.get(cf.credit_id) || [];
        list.push(cf);
        confsByCredit.set(cf.credit_id, list);
      }
    }

    const result = (credits || []).map((c) => {
      const org = Array.isArray(c.organizations)
        ? c.organizations[0]
        : c.organizations;
      const ord = Array.isArray(c.purchase_orders)
        ? c.purchase_orders[0]
        : c.purchase_orders;
      return {
        ...c,
        bank_name: org?.name ?? "",
        order_code: ord?.order_code ?? "",
        client_name: ord?.client_name_snapshot ?? "",
        organizations: undefined,
        purchase_orders: undefined,
        schedules: schedulesByCredit.get(c.id) || [],
        reports: reportsByCredit.get(c.id) || [],
        confirmations: confsByCredit.get(c.id) || [],
      };
    });

    return NextResponse.json(
      { credits: result, adapterMode: bankAdapter.mode },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return fail(e);
  }
}

export async function POST(request: Request) {
  try {
    const { db, profile } = await authorize(request);
    requireRole(
      profile,
      ["entidad_financiera"],
      "Solo la entidad financiera originadora puede formalizar créditos, desembolsar o publicar cronogramas.",
    );

    const body = (await request.json()) as { action?: string };

    if (body.action === "formalize") {
      const input = formalizeCreditSchema.parse(body);
      await bankAdapter.formalizeCredit(db, {
        creditId: input.credit_id,
        externalCreditRef: input.external_credit_ref,
      });
      return NextResponse.json({ ok: true });
    }

    if (body.action === "disburse") {
      const input = disburseCreditSchema.parse(body);
      const data = await bankAdapter.confirmDisbursement(db, {
        creditId: input.credit_id,
        externalEventId: input.external_event_id,
        amountMinor: input.amount_minor,
        recipientType: input.recipient_type,
        disbursedAt: input.disbursed_at || new Date().toISOString(),
      });
      return NextResponse.json(data);
    }

    if (body.action === "publish_schedule") {
      const input = publishScheduleSchema.parse(body);
      const id = await bankAdapter.publishSchedule(db, {
        creditId: input.credit_id,
        sourceLabel: input.source_label,
        installments: input.installments,
      });
      return NextResponse.json({ id }, { status: 201 });
    }

    throw new HttpError(400, "Acción no reconocida para créditos.");
  } catch (e) {
    return fail(e);
  }
}