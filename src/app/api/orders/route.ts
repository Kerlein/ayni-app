import { NextResponse } from "next/server";
import { authorize, requireRole, fail, dbError } from "@/lib/server";
import { createOrderSchema, updateOrderStatusSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { db } = await authorize(request);
    const { data: orders, error: oErr } = await db
      .from("purchase_orders")
      .select("*, organizations(name)")
      .order("created_at", { ascending: false });
    dbError(oErr);

    const orderIds = (orders || []).map((o) => o.id);
    let itemsByOrder = new Map<string, unknown[]>();
    let disbByOrder = new Map<string, unknown>();

    if (orderIds.length > 0) {
      const [{ data: items, error: iErr }, { data: disbs, error: dErr }] =
        await Promise.all([
          db.from("purchase_order_items").select("*").in("order_id", orderIds),
          db
            .from("disbursement_confirmations")
            .select("*")
            .in("order_id", orderIds),
        ]);
      dbError(iErr);
      dbError(dErr);

      for (const item of items || []) {
        const list = itemsByOrder.get(item.order_id) || [];
        list.push(item);
        itemsByOrder.set(item.order_id, list);
      }
      for (const d of disbs || []) {
        disbByOrder.set(d.order_id, d);
      }
    }

    const result = (orders || []).map((o) => {
      const org = Array.isArray(o.organizations)
        ? o.organizations[0]
        : o.organizations;
      return {
        ...o,
        merchant_name: org?.name ?? "",
        organizations: undefined,
        items: itemsByOrder.get(o.id) || [],
        disbursement: disbByOrder.get(o.id) || null,
      };
    });

    return NextResponse.json(
      { orders: result },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return fail(e);
  }
}

export async function POST(request: Request) {
  try {
    const { db, profile } = await authorize(request);
    requireRole(profile, ["cliente"], "Solo un cliente activo puede crear órdenes de compra.");
    const input = createOrderSchema.parse(await request.json());

    const { data, error } = await db.rpc("create_purchase_order", {
      p_merchant_org_id: input.merchant_org_id,
      p_items: input.items,
    });
    dbError(error);
    return NextResponse.json({ id: data }, { status: 201 });
  } catch (e) {
    return fail(e);
  }
}

export async function PATCH(request: Request) {
  try {
    const { db, profile } = await authorize(request);
    requireRole(profile, ["comercio"], "Solo un comercio puede actualizar entregas o devoluciones.");
    const input = updateOrderStatusSchema.parse(await request.json());

    const { error } = await db.rpc("merchant_update_order_status", {
      p_order_id: input.order_id,
      p_new_status: input.status,
      p_note: input.note,
    });
    dbError(error);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}