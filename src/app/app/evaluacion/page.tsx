"use client";
import { useCallback, useEffect, useState } from "react";
import {
  Banknote,
  Calendar,
  ChartNoAxesCombined,
  CheckCircle2,
  Eye,
  FileText,
  Lock,
  RefreshCw,
} from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { Modal } from "@/components/modal";
import { api } from "@/lib/supabase-browser";
import {
  formatMinor,
  toMinorUnits,
  type ApplicationStatus,
  type ComplianceSummary,
  type CreditStatus,
  type FinancingApplication,
  type LinkedCredit,
} from "@/lib/types";

const appBadge: Record<ApplicationStatus, { label: string; tone: string }> = {
  borrador: { label: "Borrador", tone: "gray" },
  enviada: { label: "Nueva solicitud", tone: "blue" },
  en_revision_bancaria: { label: "En revisión", tone: "amber" },
  requiere_informacion: { label: "Requiere info", tone: "amber" },
  oferta_emitida: { label: "Oferta emitida", tone: "green" },
  rechazada: { label: "Rechazada", tone: "red" },
  cancelada: { label: "Cancelada", tone: "gray" },
};

const creditBadge: Record<CreditStatus, { label: string; tone: string }> = {
  pendiente_formalizacion: { label: "Pendiente formalización", tone: "amber" },
  formalizado: { label: "Formalizado", tone: "blue" },
  desembolsado: { label: "Desembolsado", tone: "green" },
  cerrado: { label: "Cerrado", tone: "green" },
  cancelado: { label: "Cancelado", tone: "red" },
};

export default function EvaluacionBancariaPage() {
  const { profile } = useAuth();
  const [tab, setTab] = useState<"apps" | "credits">("apps");
  const [applications, setApplications] = useState<FinancingApplication[]>([]);
  const [credits, setCredits] = useState<LinkedCredit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");

  const [reviewApp, setReviewApp] = useState<FinancingApplication | null>(null);
  const [reviewAction, setReviewAction] = useState<
    "en_revision_bancaria" | "requiere_informacion" | "rechazada" | "emitir_oferta"
  >("emitir_oferta");

  const [complianceModal, setComplianceModal] = useState<{
    clientName: string;
    summary?: ComplianceSummary;
    errorMsg?: string;
  } | null>(null);

  const [formalizeCredit, setFormalizeCredit] = useState<LinkedCredit | null>(null);
  const [disburseCredit, setDisburseCredit] = useState<LinkedCredit | null>(null);
  const [scheduleCredit, setScheduleCredit] = useState<LinkedCredit | null>(null);

  const isBank = profile?.role === "entidad_financiera";
  const myBankOrg = profile?.memberships?.find(
    (m) => m.organization?.org_type === "entidad_financiera",
  )?.organization;

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [appsRes, creditsRes] = await Promise.all([
        api<{ applications: FinancingApplication[] }>("/api/applications"),
        api<{ credits: LinkedCredit[] }>("/api/credits"),
      ]);
      setApplications(appsRes.applications);
      setCredits(creditsRes.credits);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Error al cargar la bandeja bancaria.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (profile && isBank) void load();
  }, [profile, isBank, load]);

  if (!profile) return null;

  if (!isBank) {
    return (
      <div className="card">
        <h1>
          <Lock size={20} style={{ verticalAlign: "middle", marginRight: 8 }} />
          Acceso exclusivo para Entidades Financieras
        </h1>
        <p>
          La evaluación de solicitudes, emisión de ofertas, formalización y
          desembolso corresponden únicamente a empleados autorizados del banco.
          El administrador general de AYNI no toma decisiones de crédito.
        </p>
      </div>
    );
  }

  async function consultCompliance(app: FinancingApplication) {
    if (!myBankOrg) return;
    setComplianceModal({ clientName: app.client_name_snapshot });
    try {
      const res = await api<{ summary: ComplianceSummary }>(
        `/api/compliance?client_id=${app.client_id}&bank_org_id=${myBankOrg.id}`,
      );
      setComplianceModal({
        clientName: app.client_name_snapshot,
        summary: res.summary,
      });
    } catch (e) {
      setComplianceModal({
        clientName: app.client_name_snapshot,
        errorMsg:
          e instanceof Error
            ? e.message
            : "No se pudo consultar el cumplimiento autorizado.",
      });
    }
  }

  async function submitReview(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!reviewApp) return;
    setBusy(true);
    setFormError("");
    const f = new FormData(e.currentTarget);
    try {
      let offerPayload = null;
      if (reviewAction === "emitir_oferta") {
        const principalBob = Number(f.get("principal_bob"));
        const totalBob = Number(f.get("total_bob"));
        const instCount = Number(f.get("installment_count"));
        const ratePct = Number(f.get("annual_rate_pct") || 0);
        const expiresDays = Number(f.get("expires_days") || 7);

        if (
          !Number.isFinite(principalBob) ||
          !Number.isFinite(totalBob) ||
          totalBob < principalBob ||
          !Number.isInteger(instCount) ||
          instCount < 1
        ) {
          throw new Error(
            "Verifica capital, total a pagar (>= capital) y cantidad de cuotas.",
          );
        }

        const totalMinor = toMinorUnits(totalBob);
        offerPayload = {
          principal_minor: toMinorUnits(principalBob),
          total_payable_minor: totalMinor,
          installment_count: instCount,
          installment_amount_minor: Math.ceil(totalMinor / instCount),
          annual_rate_bps: Math.round(ratePct * 100),
          conditions_text: String(f.get("conditions_text") || ""),
          expires_days: expiresDays,
          is_demo: true,
        };
      }

      await api(`/api/applications/${reviewApp.id}/review`, {
        method: "POST",
        body: JSON.stringify({
          action: reviewAction,
          reason: String(f.get("reason") || ""),
          offer: offerPayload,
        }),
      });
      setReviewApp(null);
      setNotice("Evaluación bancaria registrada correctamente.");
      await load();
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "Error al registrar evaluación.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function submitFormalize(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!formalizeCredit) return;
    setBusy(true);
    setFormError("");
    const f = new FormData(e.currentTarget);
    try {
      await api("/api/credits", {
        method: "POST",
        body: JSON.stringify({
          action: "formalize",
          credit_id: formalizeCredit.id,
          external_credit_ref: String(f.get("external_credit_ref") || ""),
        }),
      });
      setFormalizeCredit(null);
      setNotice("Crédito formalizado con referencia bancaria oficial.");
      await load();
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "No se pudo formalizar el crédito.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function submitDisburse(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!disburseCredit) return;
    setBusy(true);
    setFormError("");
    const f = new FormData(e.currentTarget);
    try {
      const amountBob = Number(f.get("amount_bob"));
      const res = await api<{ duplicate?: boolean; commission_entry_id?: string | null }>(
        "/api/credits",
        {
          method: "POST",
          body: JSON.stringify({
            action: "disburse",
            credit_id: disburseCredit.id,
            external_event_id: String(f.get("external_event_id") || ""),
            amount_minor: toMinorUnits(amountBob),
            recipient_type: String(f.get("recipient_type") || "comercio"),
          }),
        },
      );
      setDisburseCredit(null);
      setNotice(
        res.duplicate
          ? "Evento ya procesado previamente (idempotencia respetada; sin duplicados)."
          : res.commission_entry_id
            ? "Desembolso confirmado. El comercio ya puede registrar la entrega y se devengó la comisión AYNI del convenio demo."
            : "Desembolso confirmado. El comercio ya puede registrar la entrega.",
      );
      await load();
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "No se pudo confirmar desembolso.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function submitSchedule(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!scheduleCredit) return;
    setBusy(true);
    setFormError("");
    const f = new FormData(e.currentTarget);
    try {
      const count = Number(f.get("count"));
      const firstDateStr = String(f.get("first_due_date"));
      const totalBob = Number(f.get("total_bob"));
      const sourceLabel = String(f.get("source_label") || "Cronograma bancario (demo)");

      if (!Number.isInteger(count) || count < 1 || count > 60) {
        throw new Error("Indica entre 1 y 60 cuotas.");
      }
      const totalMinor = toMinorUnits(totalBob);
      const baseInstallment = Math.floor(totalMinor / count);
      const remainder = totalMinor - baseInstallment * count;

      const baseDate = new Date(firstDateStr + "T12:00:00Z");
      if (Number.isNaN(baseDate.getTime())) {
        throw new Error("Fecha de primera cuota inválida.");
      }

      const installments = Array.from({ length: count }, (_, idx) => {
        const d = new Date(baseDate);
        d.setUTCMonth(d.getUTCMonth() + idx);
        const yyyy = d.getUTCFullYear();
        const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
        const dd = String(d.getUTCDate()).padStart(2, "0");
        return {
          installment_number: idx + 1,
          due_date: `${yyyy}-${mm}-${dd}`,
          amount_minor:
            idx === count - 1 ? baseInstallment + remainder : baseInstallment,
        };
      });

      await api("/api/credits", {
        method: "POST",
        body: JSON.stringify({
          action: "publish_schedule",
          credit_id: scheduleCredit.id,
          source_label: sourceLabel,
          installments,
        }),
      });
      setScheduleCredit(null);
      setNotice(
        "Nueva versión del cronograma bancario publicada (se conservan versiones anteriores).",
      );
      await load();
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "No se pudo publicar cronograma.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="section-stack">
      <div className="page-heading">
        <div>
          <span className="section-kicker">BANDEJA EXCLUSIVA DEL BANCO</span>
          <h1>Evaluación bancaria y créditos</h1>
          <p>
            Entidad activa: <strong>{myBankOrg?.name || "Sin asignar"}</strong> ·
            Solo ves solicitudes dirigidas a tu organización.
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

      <div className="demo-banner">
        <div>
          <strong>Adaptador bancario en modo simulación:</strong> Todas las
          decisiones de riesgo, ofertas, formalización, desembolsos y
          cronogramas se registran como fuente bancaria trazable.
        </div>
        <span className="pill-badge blue">Entorno Demo</span>
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

      <div className="tabs-bar">
        <button
          className={`tab-btn ${tab === "apps" ? "active" : ""}`}
          onClick={() => setTab("apps")}
        >
          <ChartNoAxesCombined size={16} /> Solicitudes recibidas (
          {applications.length})
        </button>
        <button
          className={`tab-btn ${tab === "credits" ? "active" : ""}`}
          onClick={() => setTab("credits")}
        >
          <Banknote size={16} /> Formalización, desembolso y cronogramas (
          {credits.length})
        </button>
      </div>

      {tab === "apps" ? (
        <section className="users-card">
          <div className="users-card-header">
            <div>
              <FileText size={20} />
              <h2>Solicitudes dirigidas a {myBankOrg?.name || "tu entidad"}</h2>
              <span className="count-badge">{applications.length}</span>
            </div>
          </div>
          {loading ? (
            <div className="empty-state">Cargando solicitudes…</div>
          ) : applications.length === 0 ? (
            <div className="empty-state">
              No hay solicitudes dirigidas a tu entidad todavía.
            </div>
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Solicitud</th>
                    <th>Cliente</th>
                    <th>Monto / Plazo</th>
                    <th>Estado</th>
                    <th>Ofertas</th>
                    <th className="right">Acciones bancarias</th>
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
                            Orden: {app.order_code}
                          </div>
                        </td>
                        <td>
                          <strong>{app.client_name_snapshot}</strong>
                          {app.client_notes && (
                            <div className="muted-text">{app.client_notes}</div>
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
                        <td>{(app.offers || []).length} emitida(s)</td>
                        <td className="right">
                          <div className="inline-actions" style={{ justifyContent: "flex-end" }}>
                            <button
                              className="button"
                              title="Consultar indicadores de cumplimiento con consentimiento"
                              onClick={() => void consultCompliance(app)}
                            >
                              <Eye size={15} /> Cumplimiento
                            </button>
                            {app.status !== "rechazada" &&
                              app.status !== "cancelada" && (
                                <button
                                  className="button primary"
                                  onClick={() => {
                                    setFormError("");
                                    setReviewAction("emitir_oferta");
                                    setReviewApp(app);
                                  }}
                                >
                                  Evaluar / Ofertar
                                </button>
                              )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : (
        <section className="users-card">
          <div className="users-card-header">
            <div>
              <Banknote size={20} />
              <h2>Créditos originados por {myBankOrg?.name || "tu entidad"}</h2>
              <span className="count-badge">{credits.length}</span>
            </div>
          </div>
          {loading ? (
            <div className="empty-state">Cargando créditos…</div>
          ) : credits.length === 0 ? (
            <div className="empty-state">
              Cuando un cliente acepte una oferta vigente, el crédito aparecerá
              aquí para formalización y desembolso.
            </div>
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Ref. externa / Orden</th>
                    <th>Cliente</th>
                    <th>Importes</th>
                    <th>Estado</th>
                    <th>Cronogramas</th>
                    <th className="right">Operación bancaria</th>
                  </tr>
                </thead>
                <tbody>
                  {credits.map((c) => {
                    const cs = creditBadge[c.status];
                    return (
                      <tr key={c.id}>
                        <td>
                          <strong className="mono">
                            {c.external_credit_ref || "Sin formalizar"}
                          </strong>
                          <div className="muted-text">Orden: {c.order_code}</div>
                        </td>
                        <td>{c.client_name || c.client_id.slice(0, 8)}</td>
                        <td>
                          <strong>
                            {formatMinor(c.principal_minor, c.currency)}
                          </strong>
                          <div className="muted-text">
                            Total: {formatMinor(c.total_payable_minor, c.currency)}
                          </div>
                        </td>
                        <td>
                          <span className={`pill-badge ${cs.tone}`}>
                            {cs.label}
                          </span>
                        </td>
                        <td>{(c.schedules || []).length} versión(es)</td>
                        <td className="right">
                          <div className="inline-actions" style={{ justifyContent: "flex-end" }}>
                            {c.status === "pendiente_formalizacion" && (
                              <button
                                className="button primary"
                                onClick={() => {
                                  setFormError("");
                                  setFormalizeCredit(c);
                                }}
                              >
                                <CheckCircle2 size={15} /> Formalizar
                              </button>
                            )}
                            {c.status === "formalizado" && (
                              <button
                                className="button primary"
                                onClick={() => {
                                  setFormError("");
                                  setDisburseCredit(c);
                                }}
                              >
                                <Banknote size={15} /> Confirmar desembolso
                              </button>
                            )}
                            {(c.status === "formalizado" ||
                              c.status === "desembolsado") && (
                              <button
                                className="button"
                                onClick={() => {
                                  setFormError("");
                                  setScheduleCredit(c);
                                }}
                              >
                                <Calendar size={15} /> Publicar cronograma
                              </button>
                            )}
                          </div>
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

      {reviewApp && (
        <Modal
          title={`Evaluar ${reviewApp.application_code}`}
          busy={busy}
          onClose={() => setReviewApp(null)}
        >
          <form onSubmit={submitReview} className="form-stack">
            <label>
              Decisión bancaria
              <select
                value={reviewAction}
                onChange={(e) =>
                  setReviewAction(e.target.value as typeof reviewAction)
                }
              >
                <option value="en_revision_bancaria">
                  Marcar en revisión bancaria
                </option>
                <option value="requiere_informacion">
                  Solicitar información adicional
                </option>
                <option value="emitir_oferta">Emitir oferta bancaria</option>
                <option value="rechazada">Rechazar solicitud</option>
              </select>
            </label>
            <label>
              Motivo / Observaciones del analista
              <input
                name="reason"
                placeholder="Detalle de la evaluación bancaria"
                maxLength={1000}
              />
            </label>

            {reviewAction === "emitir_oferta" && (
              <>
                <div className="form-grid">
                  <label>
                    Capital financiado (BOB)
                    <input
                      name="principal_bob"
                      type="number"
                      step="0.01"
                      defaultValue={(
                        reviewApp.requested_amount_minor / 100
                      ).toFixed(2)}
                      required
                    />
                  </label>
                  <label>
                    Total a pagar (BOB)
                    <input
                      name="total_bob"
                      type="number"
                      step="0.01"
                      defaultValue={(
                        (reviewApp.requested_amount_minor * 1.08) /
                        100
                      ).toFixed(2)}
                      required
                    />
                  </label>
                </div>
                <div className="form-grid">
                  <label>
                    Número de cuotas
                    <input
                      name="installment_count"
                      type="number"
                      min={1}
                      max={60}
                      defaultValue={reviewApp.requested_installments}
                      required
                    />
                  </label>
                  <label>
                    Tasa anual ref. (%)
                    <input
                      name="annual_rate_pct"
                      type="number"
                      step="0.1"
                      min={0}
                      defaultValue="12.0"
                    />
                  </label>
                </div>
                <div className="form-grid">
                  <label>
                    Vigencia de la oferta (días)
                    <input
                      name="expires_days"
                      type="number"
                      min={1}
                      max={60}
                      defaultValue={7}
                      required
                    />
                  </label>
                  <label>
                    Condiciones
                    <input
                      name="conditions_text"
                      defaultValue="Condiciones bancarias sujetas a formalización (parámetros ficticios demo)."
                    />
                  </label>
                </div>
              </>
            )}

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
                onClick={() => setReviewApp(null)}
              >
                Cancelar
              </button>
              <button className="button primary" disabled={busy}>
                {busy ? "Guardando…" : "Registrar decisión"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {formalizeCredit && (
        <Modal
          title="Formalizar crédito bancario"
          busy={busy}
          onClose={() => setFormalizeCredit(null)}
        >
          <form onSubmit={submitFormalize} className="form-stack">
            <label>
              Referencia externa del contrato / crédito en el banco
              <input
                name="external_credit_ref"
                defaultValue={`CRED-${formalizeCredit.order_code || "DEMO"}`}
                required
                minLength={3}
                maxLength={80}
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
                onClick={() => setFormalizeCredit(null)}
              >
                Cancelar
              </button>
              <button className="button primary" disabled={busy}>
                {busy ? "Guardando…" : "Confirmar formalización"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {disburseCredit && (
        <Modal
          title="Confirmar desembolso bancario"
          busy={busy}
          onClose={() => setDisburseCredit(null)}
        >
          <form onSubmit={submitDisburse} className="form-stack">
            <div className="notice">
              Confirmar el desembolso habilita la entrega en el comercio y
              devenga de forma idempotente la comisión AYNI del convenio activo
              (separada de las cuotas del cliente).
            </div>
            <label>
              ID externo único del desembolso (idempotencia)
              <input
                name="external_event_id"
                defaultValue={`DISB-${Date.now()}`}
                required
                minLength={3}
                maxLength={80}
              />
            </label>
            <div className="form-grid">
              <label>
                Monto desembolsado (BOB)
                <input
                  name="amount_bob"
                  type="number"
                  step="0.01"
                  defaultValue={(disburseCredit.principal_minor / 100).toFixed(2)}
                  required
                />
              </label>
              <label>
                Destinatario acordado
                <select name="recipient_type" defaultValue="comercio">
                  <option value="comercio">Comercio afiliado</option>
                  <option value="cliente">Cliente</option>
                  <option value="acordado">Destinatario contractual</option>
                </select>
              </label>
            </div>
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
                onClick={() => setDisburseCredit(null)}
              >
                Cancelar
              </button>
              <button className="button primary" disabled={busy}>
                {busy ? "Confirmando…" : "Confirmar desembolso"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {scheduleCredit && (
        <Modal
          title="Publicar versión de cronograma bancario"
          busy={busy}
          onClose={() => setScheduleCredit(null)}
        >
          <form onSubmit={submitSchedule} className="form-stack">
            <div className="notice">
              Se conservarán todas las versiones anteriores del cronograma junto
              con la fecha de última sincronización.
            </div>
            <label>
              Etiqueta de procedencia
              <input
                name="source_label"
                defaultValue="Cronograma bancario oficial (simulación demo)"
                required
              />
            </label>
            <div className="form-grid">
              <label>
                Total del cronograma (BOB)
                <input
                  name="total_bob"
                  type="number"
                  step="0.01"
                  defaultValue={(
                    scheduleCredit.total_payable_minor / 100
                  ).toFixed(2)}
                  required
                />
              </label>
              <label>
                Cantidad de cuotas
                <input
                  name="count"
                  type="number"
                  min={1}
                  max={60}
                  defaultValue={3}
                  required
                />
              </label>
            </div>
            <label>
              Fecha de vencimiento de la cuota 1
              <input
                name="first_due_date"
                type="date"
                defaultValue={new Date(Date.now() + 30 * 86400000)
                  .toISOString()
                  .slice(0, 10)}
                required
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
                onClick={() => setScheduleCredit(null)}
              >
                Cancelar
              </button>
              <button className="button primary" disabled={busy}>
                {busy ? "Publicando…" : "Publicar cronograma"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {complianceModal && (
        <Modal
          title={`Cumplimiento autorizado · ${complianceModal.clientName}`}
          onClose={() => setComplianceModal(null)}
        >
          {complianceModal.errorMsg ? (
            <div className="error-message" role="alert">
              {complianceModal.errorMsg}
            </div>
          ) : !complianceModal.summary ? (
            <p>Verificando consentimiento vigente…</p>
          ) : (
            <div className="form-stack">
              <div className="notice">{complianceModal.summary.disclaimer}</div>
              <dl className="detail-list">
                <dt>Cuotas con confirmación bancaria</dt>
                <dd>{complianceModal.summary.confirmed_installments}</dd>
                <dt>Cuotas pagadas dentro de plazo</dt>
                <dd>{complianceModal.summary.paid_on_time}</dd>
                <dt>Atrasos confirmados</dt>
                <dd>{complianceModal.summary.confirmed_delays}</dd>
                <dt>Cuotas con información pendiente</dt>
                <dd>{complianceModal.summary.pending_info_installments}</dd>
                <dt>Créditos completados / activos</dt>
                <dd>
                  {complianceModal.summary.completed_credits} completado(s) ·{" "}
                  {complianceModal.summary.active_credits} activo(s)
                </dd>
                <dt>Última actualización</dt>
                <dd>
                  {complianceModal.summary.last_synced_at
                    ? new Date(
                        complianceModal.summary.last_synced_at,
                      ).toLocaleString("es-BO")
                    : "Sin cronograma sincronizado"}
                </dd>
              </dl>
              <small className="muted-text">
                Esta consulta quedó registrada en la auditoría de acceso a datos
                del cliente.
              </small>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}