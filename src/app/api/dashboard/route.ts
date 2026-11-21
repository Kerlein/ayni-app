import { NextResponse } from "next/server";
import { authorize, fail, dbError } from "@/lib/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { db, profile } = await authorize(request);

    const [orgs, products, orders, apps, credits, commissions, cases] =
      await Promise.all([
        db.from("organizations").select("id", { count: "exact", head: true }),
        db.from("products").select("id", { count: "exact", head: true }),
        db.from("purchase_orders").select("id", { count: "exact", head: true }),
        db
          .from("financing_applications")
          .select("id", { count: "exact", head: true }),
        db.from("linked_credits").select("id", { count: "exact", head: true }),
        db
          .from("commission_entries")
          .select("commission_minor, status"),
        db
          .from("support_cases")
          .select("id", { count: "exact", head: true })
          .in("status", ["abierto", "en_proceso"]),
      ]);

    dbError(orgs.error);
    dbError(products.error);
    dbError(orders.error);
    dbError(apps.error);
    dbError(credits.error);
    dbError(commissions.error);
    dbError(cases.error);

    let compliance = null;
    if (profile.role === "cliente") {
      const { data, error } = await db.rpc("client_own_compliance");
      dbError(error);
      compliance = data;
    }

    const totalAccruedMinor = (commissions.data || [])
      .filter((c) => c.status === "devengada" || c.status === "liquidada")
      .reduce((acc, c) => acc + Number(c.commission_minor || 0), 0);

    return NextResponse.json(
      {
        role: profile.role,
        counts: {
          organizations: orgs.count || 0,
          products: products.count || 0,
          orders: orders.count || 0,
          applications: apps.count || 0,
          credits: credits.count || 0,
          openCases: cases.count || 0,
          totalAccruedMinor,
        },
        compliance,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return fail(e);
  }
}