"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  Landmark,
  Plus,
  RefreshCw,
  Send,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { Modal } from "@/components/modal";
import { api } from "@/lib/supabase-browser";
import {
  formatMinor,
  type ApplicationStatus,
  type CreditStatus,
  type FinancingApplication,
  type FinancingOffer,
  type LinkedCredit,
  type OfferStatus,
  type Organization,
  type PurchaseOrder,
} from "@/lib/types";

const appBadge: Record<ApplicationStatus, { label: string; tone: string }> = {
  borrador: { label: "Borrador", tone: "gray" },
  enviada: { label: "Enviada al banco", tone: "blue" },
  en_revision_bancaria: { label: "En revisión bancaria", tone: "amber" },
  requiere_informacion: { label: "Requiere información", tone: "amber" },
  oferta_emitida: { label: "Oferta emitida", tone: "green" },
  rechazada: { label: "Rechazada por el banco", tone: "red" },
  cancelada: { label: "Cancelada", tone: "gray" },
};

const offerBadge: Record<OfferStatus, { label: string; tone: string }> = {
  vigente: { label: "Vigente", tone: "green" },
  aceptada: { label: "Aceptada", tone: "blue" },
  rechazada_por_cliente: { label: "Rechazada", tone: "red" },
  vencida: { label: "Vencida", tone: "gray" },
  sustituida: { label: "Sustituida", tone: "gray" },
};

const creditBadge: Record<CreditStatus, { label: string; tone: string }> = {
  pendiente_formalizacion: { label: "Pendiente formalización bancaria", tone: "amber" },
  formalizado: { label: "Formalizado", tone: "blue" },
  desembolsado: { label: "Desembolsado", tone: "green" },
  cerrado: { label: "Cerrado / Pagado", tone: "green" },
  cancelado: { label: "Cancelado", tone: "red" },
};

export default function FinanciamientoPage() {
  const { profile } = useAuth();
  const [applications, setApplications] = useState<FinancingApplication[]>([]);
  const [credits, setCredits] = useState<LinkedCredit[]>([]);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [banks, setBanks] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");

  const [newModal, setNewModal] = useState(false);
  const [preselectedOrderId, setPreselectedOrderId] = useState("");
  const [respondOffer, setRespondOffer] = useState<{
    offer: FinancingOffer;
    accept: boolean;
  } | null>(null);

  const isClient = profile?.role === "cliente";
  const isAdmin = profile?.role === "administrador";

  useEffect(() => {
    const orderParam = new URLSearchParams(window.location.search).get("order_id");
    if (orderParam) {
      setPreselectedOrderId(orderParam);
      setNewModal(true);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [appsRes, creditsRes, ordersRes, banksRes] = await Promise.all([
        api<{ applications: FinancingApplication[] }>("/api/applications"),
        api<{ credits: LinkedCredit[] }>("/api/credits"),
        isClient
          ? api<{ orders: PurchaseOrder[] }>("/api/orders")
          : Promise.resolve({ orders: [] }),
        isClient
          ? api<{ organizations: Organization[] }>(
              "/api/organizations?org_type=entidad_financiera",
            )
          : Promise.resolve({ organizations: [] }),
      ]);
      setApplications(appsRes.applications);
      setCredits(creditsRes.credits);
      setOrders(ordersRes.orders);
      setBanks(banksRes.organizations.filter((b) => b.status === "activa"));
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Error al cargar financiamiento.",
      );
    } finally {
      setLoading(false);
    }
  }, [isClient]);

  useEffect(() => {
    if (profile) void load();
  }, [profile, load]);

  if (!profile) return null;

  if (!isClient && !isAdmin) {
    return (
      <div className="card">
        <h1>Módulo de solicitudes del cliente</h1>
        <p>
          {profile.role === "entidad_financiera"
            ? "Como entidad financiera, gestiona las solicitudes recibidas desde Evaluación bancaria."
            : "Los comercios no acceden a solicitudes ni ofertas financieras del cliente."}
        </p>
        {profile.role === "entidad_financiera" && (
          <Link className="button primary" href="/app/evaluacion">
            Ir a Evaluación bancaria
          </Link>
        )}
      </div>
    );
  }

  const eligibleOrders = orders.filter((o) => o.status === "creada");

  async function submitApplication(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setFormError("");
    const f = new FormData(e.currentTarget);
    try {
      const consent = f.get("consent_accepted") === "on";
      if (!consent) {
        throw new Error(
          "Debes marcar la autorización para enviar tu solicitud a la entidad financiera.",
        );
      }
      await api("/api/applications", {
        method: "POST",
        body: JSON.stringify({
          order_id: String(f.get("order_id")),
          bank_org_id: String(f.get("bank_org_id")),
          requested_installments: Number(f.get("requested_installments")),
          client_notes: String(f.get("client_notes") || ""),
          consent_accepted: true,
        }),
      });
      setNewModal(false);
      setPreselectedOrderId("");
      setNotice(
        "Solicitud enviada a la entidad financiera junto con tu autorización registrada. La evaluación corresponde exclusivamente al banco.",
      );
      await load();
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "No se pudo enviar la solicitud.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function confirmOfferResponse(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!respondOffer) return;
    setBusy(true);
    setFormError("");
    const f = new FormData(e.currentTarget);
    try {
      await api(`/api/offers/${respondOffer.offer.id}/respond`, {
        method: "POST",
        body: JSON.stringify({
          accept: respondOffer.accept,
          acceptance_note: String(f.get("acceptance_note") || ""),
        }),
      });
      setRespondOffer(null);
      setNotice(
        respondOffer.accept
          ? "Evidencia de aceptación registrada. El crédito quedó pendiente de formalización según el procedimiento de la entidad financiera."
          : "Oferta rechazada correctamente.",
      );
      await load();
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "No se pudo registrar la respuesta.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="section-stack">
      <div className="page-heading">
        <div>
          <span className="section-kicker">SOLICITUDES Y OFERTAS BANCARIAS</span>
          <h1>Gestión de financiamiento</h1>
          <p>
            Presenta solicitudes a una entidad financiera identificada, revisa
            sus ofertas y sigue la formalización del crédito.
          </p>
        </div>
        <div className="inline-actions">
          {isClient && (
            <button
              className="button primary"
              onClick={() => {
                setFormError("");
                setNewModal(true);
              }}
            >
              <Plus size={18} /> Nueva solicitud
            </button>
          )}
          <button
            className="icon-button"
            onClick={() => void load()}
            disabled={loading}
            title="Actualizar"
          >
            <RefreshCw size={18} />
          </button>
        </div>
      </div>

      {isAdmin && (
        <div className="demo-banner">
          <div>
            <strong>Supervisión técnica AYNI:</strong> Puedes revisar el flujo
            operativo, pero la evaluación, aprobación, emisión de ofertas y
            formalización corresponden exclusivamente a la entidad financiera.
          </div>
          <span className="pill-badge blue">Solo lectura</span>
        </div>
      )}

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

      <section className="users-card">
        <div className="users-card-header">
          <div>
            <Landmark size={20} />
            <h2>Solicitudes de financiamiento y ofertas</h2>
            <span className="count-badge">{applications.length}</span>
          </div>
        </div>
        {loading ? (
          <div className="empty-state">Cargando solicitudes…</div>
        ) : applications.length === 0 ? (
          <div className="empty-state">
            <Landmark size={32} />
            <h3>No hay solicitudes registradas</h3>
            <p>
              {isClient
                ? "Crea primero una orden en Compras y luego solicita financiamiento a una entidad financiera."
                : "Las solicitudes enviadas por los clientes aparecerán aquí."}
            </p>
          </div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Solicitud / Orden</th>
                  <th>Entidad financiera</th>
                  <th>Monto / Plazo</th>
                  <th>Estado</th>
                  <th>Ofertas bancarias</th>
                </tr>
              </thead>
              <tbody>
                {applications.map((app) => {
                  const st = appBadge[app.status];
                  return (
                    <tr key={app.id}>
                      <td>
                        <strong className="mono">{app.application_code}</strong>
                        <div className="muted-text">
                          Orden: {app.order_code || app.order_id.slice(0, 8)}
                        </div>
                        {isAdmin && (
                          <div className="muted-text">
                            Cliente: {app.client_name_snapshot}
                          </div>
                        )}
                      </td>
                      <td>
                        <strong>{app.bank_name || "Entidad financiera"}</strong>
                        {app.bank_notes && (
                          <div className="muted-text">
                            Nota banco: {app.bank_notes}
                          </div>
                        )}
                      </td>
                      <td>
                        <strong>
                          {formatMinor(app.requested_amount_minor, app.currency)}
                        </strong>
                        <div className="muted-text">
                          {app.requested_installments} cuotas solicitadas
                        </div>
                      </td>
                      <td>
                        <span className={`pill-badge ${st.tone}`}>
                          {st.label}
                        </span>
                      </td>
                      <td>
                        {!app.offers || app.offers.length === 0 ? (
                          <span className="muted-text">Sin oferta emitida</span>
                        ) : (
                          <div className="section-stack" style={{ gap: "0.5rem" }}>
                            {app.offers.map((offer) => {
                              const expired =
                                new Date(offer.expires_at).getTime() <=
                                Date.now();
                              const effStatus: OfferStatus =
                                offer.status === "vigente" && expired
                                  ? "vencida"
                                  : offer.status;
                              const ob = offerBadge[effStatus];
                              return (
                                <div
                                  key={offer.id}
                                  className="item-card"
                                  style={{ padding: "0.7rem" }}
                                >
                                  <div className="split-row">
                                    <strong>
                                      Oferta v{offer.version_number} ·{" "}
                                      {offer.installment_count} cuotas de{" "}
                                      {formatMinor(
                                        offer.installment_amount_minor,
                                        offer.currency,
                                      )}
                                    </strong>
                                    <span className={`pill-badge ${ob.tone}`}>
                                      {ob.label}
                                    </span>
                                  </div>
                                  <div className="muted-text">
                                    Capital:{" "}
                                    {formatMinor(
                                      offer.principal_minor,
                                      offer.currency,
                                    )}{" "}
                                    · Total a pagar:{" "}
                                    {formatMinor(
                                      offer.total_payable_minor,
                                      offer.currency,
                                    )}{" "}
                                    · Tasa ref.:{" "}
                                    {(offer.annual_rate_bps / 100).toFixed(2)}%
                                    {offer.is_demo ? " (Demo)" : ""}
                                  </div>
                                  <div className="muted-text">
                                    Vigente hasta:{" "}
                                    {new Date(offer.expires_at).toLocaleString(
                                      "es-BO",
                                    )}
                                  </div>
                                  {offer.conditions_text && (
                                    <div className="muted-text">
                                      {offer.conditions_text}
                                    </div>
                                  )}
                                  {isClient &&
                                    offer.status === "vigente" &&
                                    !expired && (
                                      <div className="inline-actions">
                                        <button
                                          className="button primary"
                                          onClick={() => {
                                            setFormError("");
                                            setRespondOffer({
                                              offer,
                                              accept: true,
                                            });
                                          }}
                                        >
                                          <CheckCircle2 size={15} /> Aceptar oferta
                                        </button>
                                        <button
                                          className="button"
                                          onClick={() => {
                                            setFormError("");
                                            setRespondOffer({
                                              offer,
                                              accept: false,
                                            });
                                          }}
                                        >
                                          <XCircle size={15} /> Rechazar
                                        </button>
                                      </div>
                                    )}
                                </div>
                              );
                            })}
                          </div>
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

      <section className="users-card">
        <div className="users-card-header">
          <div>
            <ShieldCheck size={20} />
            <h2>Créditos vinculados</h2>
            <span className="count-badge">{credits.length}</span>
          </div>
          <Link className="button" href="/app/pagos">
            Ver cronogramas y cuotas
          </Link>
        </div>
        {credits.length === 0 ? (
          <div className="empty-state">
            Todavía no tienes créditos vinculados. Al aceptar una oferta vigente
            aparecerá aquí.
          </div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Referencia banco</th>
                  <th>Orden / Banco</th>
                  <th>Capital / Total</th>
                  <th>Estado</th>
                  <th>Actualización</th>
                </tr>
              </thead>
              <tbody>
                {credits.map((c) => {
                  const cs = creditBadge[c.status];
                  return (
                    <tr key={c.id}>
                      <td className="mono">
                        {c.external_credit_ref || "Pendiente asignación bancaria"}
                      </td>
                      <td>
                        <strong>{c.order_code}</strong>
                        <div className="muted-text">{c.bank_name}</div>
                      </td>
                      <td>
                        <strong>{formatMinor(c.principal_minor, c.currency)}</strong>
                        <div className="muted-text">
                          Total: {formatMinor(c.total_payable_minor, c.currency)}
                        </div>
                      </td>
                      <td>
                        <span className={`pill-badge ${cs.tone}`}>
                          {cs.label}
                        </span>
                      </td>
                      <td className="date-cell">
                        {new Date(c.created_at).toLocaleDateString("es-BO")}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {newModal && (
        <Modal
          title="Solicitar financiamiento bancario"
          busy={busy}
          onClose={() => setNewModal(false)}
        >
          <form onSubmit={submitApplication} className="form-stack">
            <div className="notice">
              AYNI envía tu solicitud a la entidad financiera que selecciones.
              La evaluación, aprobación y condiciones dependen exclusivamente
              del banco; AYNI no garantiza aprobación.
            </div>
            <label>
              Orden de compra (estado Creada)
              <select
                name="order_id"
                defaultValue={preselectedOrderId}
                required
              >
                <option value="">Selecciona una orden…</option>
                {eligibleOrders.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.order_code} · {o.merchant_name} ·{" "}
                    {formatMinor(o.total_minor, o.currency)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Entidad financiera destinataria
              <select name="bank_org_id" required>
                <option value="">Selecciona un banco…</option>
                {banks.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} {b.is_demo ? "(Simulación demo)" : ""}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Plazo deseado (número de cuotas)
              <input
                name="requested_installments"
                type="number"
                min={1}
                max={36}
                defaultValue={3}
                required
              />
            </label>
            <label>
              Información complementaria para la evaluación
              <input
                name="client_notes"
                placeholder="Ej. Actividad laboral o aclaraciones para el analista"
                maxLength={1000}
              />
            </label>
            <label
              style={{
                flexDirection: "row",
                alignItems: "flex-start",
                gap: "0.5rem",
              }}
            >
              <input
                type="checkbox"
                name="consent_accepted"
                required
                style={{ width: "auto", marginTop: "0.2rem" }}
              />
              <span>
                Autorizo a AYNI a compartir los datos de esta orden y solicitud
                con la entidad financiera elegida únicamente para su evaluación
                (versión v1.0-demo).
              </span>
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
                onClick={() => setNewModal(false)}
              >
                Cancelar
              </button>
              <button className="button primary" disabled={busy}>
                <Send size={15} /> {busy ? "Enviando…" : "Enviar solicitud"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {respondOffer && (
        <Modal
          title={
            respondOffer.accept
              ? `Aceptar oferta v${respondOffer.offer.version_number}`
              : `Rechazar oferta v${respondOffer.offer.version_number}`
          }
          busy={busy}
          onClose={() => setRespondOffer(null)}
        >
          <form onSubmit={confirmOfferResponse} className="form-stack">
            {respondOffer.accept ? (
              <div className="notice">
                Registrar tu aceptación en pantalla deja constancia de tu
                conformidad y genera un crédito en estado{" "}
                <strong>pendiente de formalización</strong>. El perfeccionamiento
                del contrato y el desembolso dependen del procedimiento del
                banco.
              </div>
            ) : (
              <p>
                ¿Deseas rechazar esta oferta bancaria? Podrás recibir otra
                oferta o iniciar una nueva solicitud.
              </p>
            )}
            <label>
              Nota opcional
              <input
                name="acceptance_note"
                placeholder={
                  respondOffer.accept
                    ? "Ej. Conforme con cuotas y condiciones para formalizar"
                    : "Ej. Prefiero otro plazo"
                }
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
                onClick={() => setRespondOffer(null)}
              >
                Cancelar
              </button>
              <button
                className={`button ${respondOffer.accept ? "primary" : "danger"}`}
                disabled={busy}
              >
                {busy
                  ? "Procesando…"
                  : respondOffer.accept
                    ? "Confirmar aceptación"
                    : "Confirmar rechazo"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}