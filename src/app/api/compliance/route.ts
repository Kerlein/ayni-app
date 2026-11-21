import { NextResponse } from "next/server";
import { z } from "zod";
import { authorize, requireRole, fail, dbError } from "@/lib/server";
import { manageConsentSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { db, profile } = await authorize(request);
    const params = new URL(request.url).searchParams;
    const clientIdParam = params.get("client_id");
    const bankOrgIdParam = params.get("bank_org_id");

    // Consulta autorizada por entidad financiera para un cliente específico
    if (profile.role === "entidad_financiera" && clientIdParam && bankOrgIdParam) {
      const clientId = z.uuid().parse(clientIdParam);
      const bankOrgId = z.uuid().parse(bankOrgIdParam);
      const { data: summary, error } = await db.rpc(
        "bank_read_authorized_compliance",
        {
          p_client_id: clientId,
          p_bank_org_id: bankOrgId,
        },
      );
      dbError(error);
      return NextResponse.json(
        { summary },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    let summary = null;
    if (profile.role === "cliente") {
      const { data, error } = await db.rpc("client_own_compliance");
      dbError(error);
      summary = data;
    }

    const [{ data: rawConsents, error: cErr }, { data: accessAudit, error: aErr }] =
      await Promise.all([
        db
          .from("consents")
          .select("*, organizations(name)")
          .order("granted_at", { ascending: false }),
        db
          .from("data_access_audit")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(30),
      ]);
    dbError(cErr);
    dbError(aErr);

    const consents = (rawConsents || []).map((c) => {
      const org = Array.isArray(c.organizations)
        ? c.organizations[0]
        : c.organizations;
      return {
        ...c,
        target_org_name: org?.name ?? "",
        organizations: undefined,
      };
    });

    return NextResponse.json(
      { summary, consents, accessAudit: accessAudit || [] },
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
      "Solo el cliente puede otorgar o revocar autorizaciones de datos.",
    );
    const input = manageConsentSchema.parse(await request.json());

    const { data, error } = await db.rpc("client_manage_consent", {
      p_target_org_id: input.target_org_id,
      p_purpose: input.purpose,
      p_days_valid: input.days_valid,
      p_revoke_consent_id: input.revoke_consent_id ?? null,
    });
    dbError(error);
    return NextResponse.json({ id: data });
  } catch (e) {
    return fail(e);
  }
}