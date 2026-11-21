import { NextResponse } from "next/server";
import { authorize, fail, dbError } from "@/lib/server";
import {
  createCommissionAgreementSchema,
  updateCommissionEntrySchema,
} from "@/lib/validation";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { db } = await authorize(request);
    const [{ data: agreements, error: aErr }, { data: entries, error: eErr }] =
      await Promise.all([
        db
          .from("commission_agreements")
          .select("*, organizations(name)")
          .order("created_at", { ascending: false }),
        db
          .from("commission_entries")
          .select("*, organizations(name)")
          .order("accrued_at", { ascending: false }),
      ]);
    dbError(aErr);
    dbError(eErr);

    const mapOrg = <T extends { organizations?: unknown }>(rows: T[] | null) =>
      (rows || []).map((r) => {
        const org = Array.isArray(r.organizations)
          ? (r.organizations[0] as { name?: string } | undefined)
          : (r.organizations as { name?: string } | null | undefined);
        return {
          ...r,
          organization_name: org?.name ?? "",
          organizations: undefined,
        };
      });

    return NextResponse.json(
      { agreements: mapOrg(agreements), entries: mapOrg(entries) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return fail(e);
  }
}

export async function POST(request: Request) {
  try {
    const { db } = await authorize(request, true);
    const input = createCommissionAgreementSchema.parse(await request.json());

    const { data, error } = await db.rpc("admin_upsert_commission_agreement", {
      p_org_id: input.organization_id,
      p_version_label: input.version_label,
      p_calc_type: input.calc_type,
      p_fixed_minor: input.fixed_minor,
      p_rate_bps: input.rate_bps,
      p_service_description: input.service_description,
      p_is_demo: input.is_demo,
    });
    dbError(error);
    return NextResponse.json({ id: data }, { status: 201 });
  } catch (e) {
    return fail(e);
  }
}

export async function PATCH(request: Request) {
  try {
    const { db } = await authorize(request, true);
    const input = updateCommissionEntrySchema.parse(await request.json());

    const { error } = await db.rpc("admin_update_commission_entry", {
      p_entry_id: input.entry_id,
      p_status: input.status,
      p_settlement_ref: input.settlement_ref,
      p_notes: input.notes,
    });
    dbError(error);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}