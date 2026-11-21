import { NextResponse } from "next/server";
import { authorize, fail, dbError } from "@/lib/server";
import { profileSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { db, user, profile } = await authorize(request);
    const { data: rawMemberships, error } = await db
      .from("organization_members")
      .select(
        "id, organization_id, profile_id, member_role, status, organizations(id, name, org_type, status, is_demo)",
      )
      .eq("profile_id", user.id)
      .eq("status", "activa");
    dbError(error);

    const memberships = (rawMemberships || []).map((m) => {
      const org = Array.isArray(m.organizations)
        ? m.organizations[0]
        : m.organizations;
      return {
        id: m.id,
        organization_id: m.organization_id,
        profile_id: m.profile_id,
        member_role: m.member_role,
        status: m.status,
        organization: org ?? null,
      };
    });

    return NextResponse.json(
      { ...profile, memberships },
      { headers: { "Cache-Control": "no-store" } },
    );
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