import { NextResponse } from "next/server";
import { authorize, requireRole, fail, dbError } from "@/lib/server";
import { submitApplicationSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { db } = await authorize(request);
    const { data: apps, error: aErr } = await db
      .from("financing_applications")
      .select("*, organizations(name), purchase_orders(order_code)")
      .order("submitted_at", { ascending: false });
    dbError(aErr);

    const appIds = (apps || []).map((a) => a.id);
    const offersByApp = new Map<string, unknown[]>();

    if (appIds.length > 0) {
      const { data: offers, error: oErr } = await db
        .from("financing_offers")
        .select("*")
        .in("application_id", appIds)
        .order("version_number", { ascending: false });
      dbError(oErr);

      for (const offer of offers || []) {
        const list = offersByApp.get(offer.application_id) || [];
        list.push(offer);
        offersByApp.set(offer.application_id, list);
      }
    }

    const applications = (apps || []).map((a) => {
      const org = Array.isArray(a.organizations)
        ? a.organizations[0]
        : a.organizations;
      const ord = Array.isArray(a.purchase_orders)
        ? a.purchase_orders[0]
        : a.purchase_orders;
      return {
        ...a,
        bank_name: org?.name ?? "",
        order_code: ord?.order_code ?? "",
        organizations: undefined,
        purchase_orders: undefined,
        offers: offersByApp.get(a.id) || [],
      };
    });

    return NextResponse.json(
      { applications },
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
      ["cliente"],
      "Solo un cliente activo puede presentar solicitudes de financiamiento.",
    );
    const input = submitApplicationSchema.parse(await request.json());

    const { data, error } = await db.rpc("submit_financing_application", {
      p_order_id: input.order_id,
      p_bank_org_id: input.bank_org_id,
      p_requested_installments: input.requested_installments,
      p_client_notes: input.client_notes,
      p_consent_version: "v1.0-demo",
    });
    dbError(error);
    return NextResponse.json({ id: data }, { status: 201 });
  } catch (e) {
    return fail(e);
  }
}