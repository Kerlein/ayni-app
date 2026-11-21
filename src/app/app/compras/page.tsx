"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  Landmark,
  RefreshCw,
  ShoppingBag,
  ShoppingCart,
  Truck,
} from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { Modal } from "@/components/modal";
import { api } from "@/lib/supabase-browser";
import {
  formatMinor,
  type OrderStatus,
  type Product,
  type PurchaseOrder,
} from "@/lib/types";

const statusBadge: Record<OrderStatus, { label: string; tone: string }> = {
  creada: { label: "Creada", tone: "gray" },
  pendiente_financiamiento: { label: "Pendiente financiamiento", tone: "amber" },
  financiada: { label: "Financiada", tone: "blue" },
  pendiente_entrega: { label: "Desembolsada · Por entregar", tone: "blue" },
  entregada: { label: "Entregada", tone: "green" },
  cancelada: { label: "Cancelada", tone: "red" },
  devolucion_en_proceso: { label: "Devolución en proceso", tone: "amber" },
  devuelta: { label: "Devuelta (comercial)", tone: "red" },
};

export default function ComprasPage() {
  const { profile } = useAuth();
  const [tab, setTab] = useState<"catalog" | "orders">("orders");
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const [deliveryOrder, setDeliveryOrder] = useState<PurchaseOrder | null>(
    null,
  );

  const isClient = profile?.role === "cliente";
  const isMerchant = profile?.role === "comercio";

  useEffect(() => {
    if (isClient) setTab("catalog");
  }, [isClient]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [ordersRes, productsRes] = await Promise.all([
        api<{ orders: PurchaseOrder[] }>("/api/orders"),
        isClient
          ? api<{ products: Product[] }>("/api/products?available=true")
          : Promise.resolve({ products: [] }),
      ]);
      setOrders(ordersRes.orders);
      setProducts(productsRes.products);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar compras.");
    } finally {
      setLoading(false);
    }
  }, [isClient]);

  useEffect(() => {
    if (profile) void load();
  }, [profile, load]);

  if (!profile) return null;

  async function createOrderForProduct(product: Product) {
    const qty = Math.max(1, quantities[product.id] || 1);
    setBusy(true);
    setError("");
    try {
      await api("/api/orders", {
        method: "POST",
        body: JSON.stringify({
          merchant_org_id: product.merchant_org_id,
          items: [{ product_id: product.id, quantity: qty }],
        }),
      });
      setNotice(
        `Orden creada por ${qty} × ${product.name} (${formatMinor(product.price_minor * qty, product.currency)}). El precio quedó congelado; ahora puedes solicitar financiamiento.`,
      );
      setTab("orders");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo crear la orden.");
    } finally {
      setBusy(false);
    }
  }

  async function updateDelivery(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!deliveryOrder) return;
    setBusy(true);
    setFormError("");
    const f = new FormData(e.currentTarget);
    try {
      await api("/api/orders", {
        method: "PATCH",
        body: JSON.stringify({
          order_id: deliveryOrder.id,
          status: String(f.get("status")),
          note: String(f.get("note") || ""),
        }),
      });
      setDeliveryOrder(null);
      setNotice("Estado comercial de la orden actualizado correctamente.");
      await load();
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "No se pudo actualizar la orden.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="section-stack">
      <div className="page-heading">
        <div>
          <span className="section-kicker">COMPRAS FINANCIADAS</span>
          <h1>{isMerchant ? "Órdenes y entregas del comercio" : "Compras y órdenes"}</h1>
          <p>
            {isMerchant
              ? "Consulta desembolsos confirmados por el banco y registra entregas o devoluciones comerciales."
              : "Selecciona productos de comercios afiliados, crea tu orden y solicita financiamiento bancario."}
          </p>
        </div>
        <button
          className="icon-button"
          onClick={() => void load()}
          disabled={loading}
          title="Actualizar"
        >
          <RefreshCw size={18} />
        </button>
      </div>

      {notice && (
        <div className="success-message" role="status">
          {notice}
          <button className="text-button" onClick={() => setNotice("")}>
            Cerrar
          </button>
        </div>
      )}

      {error && (
        <div className="error-message" role="alert">
          {error}
        </div>
      )}

      {isClient && (
        <div className="tabs-bar">
          <button
            className={`tab-btn ${tab === "catalog" ? "active" : ""}`}
            onClick={() => setTab("catalog")}
          >
            <ShoppingCart size={16} /> Catálogo disponible ({products.length})
          </button>
          <button
            className={`tab-btn ${tab === "orders" ? "active" : ""}`}
            onClick={() => setTab("orders")}
          >
            <ShoppingBag size={16} /> Mis órdenes ({orders.length})
          </button>
        </div>
      )}

      {isClient && tab === "catalog" ? (
        <section className="users-card">
          <div className="users-card-header">
            <div>
              <ShoppingCart size={20} />
              <h2>Productos disponibles para compra financiada</h2>
            </div>
          </div>
          {loading ? (
            <div className="empty-state">Cargando catálogo…</div>
          ) : products.length === 0 ? (
            <div className="empty-state">
              <ShoppingCart size={32} />
              <h3>Aún no hay productos con stock</h3>
              <p>
                Un comercio afiliado debe publicar productos en{" "}
                <strong>Comercios y catálogo</strong>.
              </p>
            </div>
          ) : (
            <div className="cards-grid">
              {products.map((p) => {
                const qty = quantities[p.id] || 1;
                return (
                  <article key={p.id} className="item-card">
                    <div>
                      <div className="split-row">
                        <span className="pill-badge green">{p.category}</span>
                        <small className="muted-text">Stock: {p.stock}</small>
                      </div>
                      <h3 style={{ marginTop: "0.5rem" }}>{p.name}</h3>
                      <p>{p.description || "Producto de comercio afiliado."}</p>
                      <small className="muted-text">
                        Comercio: <strong>{p.merchant_name}</strong>
                      </small>
                    </div>
                    <div className="section-stack" style={{ gap: "0.6rem" }}>
                      <div className="split-row">
                        <strong style={{ fontSize: "1.1rem" }}>
                          {formatMinor(p.price_minor, p.currency)}
                        </strong>
                        <input
                          type="number"
                          min={1}
                          max={p.stock}
                          value={qty}
                          aria-label={`Cantidad para ${p.name}`}
                          onChange={(e) =>
                            setQuantities((prev) => ({
                              ...prev,
                              [p.id]: Math.max(
                                1,
                                Math.min(p.stock, Number(e.target.value) || 1),
                              ),
                            }))
                          }
                          style={{ width: "74px" }}
                        />
                      </div>
                      <button
                        className="button primary"
                        disabled={busy}
                        onClick={() => void createOrderForProduct(p)}
                      >
                        Crear orden ({formatMinor(p.price_minor * qty, p.currency)})
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      ) : (
        <section className="users-card">
          <div className="users-card-header">
            <div>
              <ShoppingBag size={20} />
              <h2>{isMerchant ? "Órdenes recibidas" : "Listado de órdenes"}</h2>
              <span className="count-badge">{orders.length}</span>
            </div>
          </div>
          {loading ? (
            <div className="empty-state">Cargando órdenes…</div>
          ) : orders.length === 0 ? (
            <div className="empty-state">
              <ShoppingBag size={32} />
              <h3>No hay órdenes registradas</h3>
              <p>
                {isClient
                  ? "Selecciona un producto del catálogo para crear tu primera orden."
                  : "Las órdenes creadas para tu comercio aparecerán aquí."}
              </p>
            </div>
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Código</th>
                    <th>Cliente / Comercio</th>
                    <th>Detalle (precio congelado)</th>
                    <th>Total</th>
                    <th>Desembolso banco</th>
                    <th>Estado</th>
                    <th className="right">Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => {
                    const st = statusBadge[o.status];
                    return (
                      <tr key={o.id}>
                        <td className="mono">{o.order_code}</td>
                        <td>
                          <strong>{o.client_name_snapshot}</strong>
                          <div>
                            <small className="muted-text">
                              {o.merchant_name || "Comercio"}
                            </small>
                          </div>
                        </td>
                        <td>
                          {(o.items || []).map((it) => (
                            <div key={it.id} className="muted-text">
                              {it.quantity} × {it.product_name_snapshot} (
                              {formatMinor(it.unit_price_minor, o.currency)})
                            </div>
                          ))}
                        </td>
                        <td>
                          <strong>{formatMinor(o.total_minor, o.currency)}</strong>
                        </td>
                        <td>
                          {o.disbursement ? (
                            <span className="pill-badge green">
                              <CheckCircle2 size={13} /> Confirmado (
                              {o.disbursement.external_event_id})
                            </span>
                          ) : (
                            <span className="pill-badge gray">Pendiente</span>
                          )}
                        </td>
                        <td>
                          <span className={`pill-badge ${st.tone}`}>
                            {st.label}
                          </span>
                          {o.delivery_notes && (
                            <div className="muted-text">{o.delivery_notes}</div>
                          )}
                        </td>
                        <td className="right">
                          {isClient && o.status === "creada" && (
                            <Link
                              className="button primary"
                              href={`/app/financiamiento?order_id=${o.id}`}
                            >
                              <Landmark size={15} /> Solicitar financiamiento
                            </Link>
                          )}
                          {isMerchant && (
                            <button
                              className="button"
                              onClick={() => {
                                setFormError("");
                                setDeliveryOrder(o);
                              }}
                            >
                              <Truck size={15} /> Gestionar entrega
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {deliveryOrder && (
        <Modal
          title={`Gestión comercial · ${deliveryOrder.order_code}`}
          busy={busy}
          onClose={() => setDeliveryOrder(null)}
        >
          <form onSubmit={updateDelivery} className="form-stack">
            <div className="notice">
              La entrega requiere confirmación previa de desembolso bancario.
              Registrar una <strong>devolución comercial</strong> no cancela
              automáticamente la deuda bancaria del cliente.
            </div>
            <label>
              Nuevo estado comercial
              <select
                name="status"
                defaultValue={
                  deliveryOrder.disbursement
                    ? "entregada"
                    : "pendiente_entrega"
                }
              >
                <option value="pendiente_entrega">Pendiente de entrega</option>
                <option value="entregada">Entregada al cliente</option>
                <option value="devolucion_en_proceso">
                  Devolución en proceso
                </option>
                <option value="devuelta">Devuelta (comercial)</option>
                <option value="cancelada">Cancelada (antes de desembolso)</option>
              </select>
            </label>
            <label>
              Nota de entrega / acta / motivo
              <input
                name="note"
                defaultValue={deliveryOrder.delivery_notes}
                placeholder="Ej. Entregado con factura y conformidad firmada"
                maxLength={500}
              />
            </label>
            {formError && (
              <div className="error-message" role="alert">
                {formError}
              </div>
            )}
            <div className="modal-actions">
              <button
                type="button"
                className="button"
                disabled={busy}
                onClick={() => setDeliveryOrder(null)}
              >
                Cancelar
              </button>
              <button className="button primary" disabled={busy}>
                {busy ? "Guardando…" : "Actualizar estado"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}