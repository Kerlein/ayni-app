import { NextResponse } from "next/server";
import { authorize, fail, dbError } from "@/lib/server";
import {
  upsertOrganizationSchema,
  assignOrgMemberSchema,
} from "@/lib/validation";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { db, profile } = await authorize(request);
    const orgType = new URL(request.url).searchParams.get("org_type");

    let orgQuery = db
      .from("organizations")
      .select("*")
      .order("created_at", { ascending: false });
    if (orgType === "comercio" || orgType === "entidad_financiera") {
      orgQuery = orgQuery.eq("org_type", orgType);
    }

    const { data: organizations, error: orgError } = await orgQuery;
    dbError(orgError);

    const { data: members, error: memError } = await db
      .from("organization_members")
      .select("id, organization_id, profile_id, member_role, status, created_at")
      .order("created_at", { ascending: false });
    dbError(memError);

    let assignableUsers: Array<{
      id: string;
      full_name: string;
      email: string;
      role: string;
    }> = [];

    if (profile.role === "administrador") {
      const { data: users, error: uErr } = await db
        .from("profiles")
        .select("id, full_name, email, role")
        .in("role", ["comercio", "entidad_financiera"])
        .eq("status", "activo")
        .order("full_name");
      dbError(uErr);
      assignableUsers = users || [];
    }

    return NextResponse.json(
      { organizations: organizations || [], members: members || [], assignableUsers },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return fail(e);
  }
}

export async function POST(request: Request) {
  try {
    const { db } = await authorize(request, true);
    const input = upsertOrganizationSchema.parse(await request.json());
    const { data, error } = await db.rpc("admin_upsert_organization", {
      p_id: input.id ?? null,
      p_org_type: input.org_type,
      p_name: input.name,
      p_tax_id: input.tax_id,
      p_contact_email: input.contact_email,
      p_contact_phone: input.contact_phone,
      p_status: input.status,
      p_is_demo: input.is_demo,
    });
    dbError(error);
    return NextResponse.json({ id: data }, { status: input.id ? 200 : 201 });
  } catch (e) {
    return fail(e);
  }
}

export async function PUT(request: Request) {
  try {
    const { db } = await authorize(request, true);
    const input = assignOrgMemberSchema.parse(await request.json());
    const { data, error } = await db.rpc("admin_set_org_member", {
      p_org_id: input.organization_id,
      p_profile_id: input.profile_id,
      p_member_role: input.member_role,
      p_status: input.status,
    });
    dbError(error);
    return NextResponse.json({ id: data });
  } catch (e) {
    return fail(e);
  }
}