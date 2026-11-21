"use client";
import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  CreditCard,
  LifeBuoy,
  Percent,
  Plus,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { Modal } from "@/components/modal";
import { api } from "@/lib/supabase-browser";
import {
  formatMinor,
  toMinorUnits,
  type BankPaymentConfirmation,
  type CommissionAgreement,
  type CommissionEntry,
  type ComplianceSummary,
  type Consent,
  type Installment,
  type InstallmentStatus,
  type LinkedCredit,
  type Organization,
  type PaymentReport,
  type PaymentReportStatus,
  type SupportCase,
} from "@/lib/types";

type AccessAuditRow = {
  id: number;
  client_id: string;
  accessed_by_profile_id: string;
  accessor_org_id: string | null;
  purpose: string;
  created_at: string;
};

const instBadge: Record<InstallmentStatus, { label: string; tone: string }> = {
  pendiente: { label: "Pendiente", tone: "gray" },
  parcial: { label: "Pago parcial", tone: "blue" },
  pagada: { label: "Confirmada pagada", tone: "green" },
  atrasada: { label: "Atraso confirmado", tone: "red" },
  pendiente_informacion: { label: "Información pendiente", tone: "amber" },
};

const repBadge: Record<PaymentReportStatus, { label: string; tone: string }> = {
  pendiente_verificacion: { label: "Pendiente verificación", tone: "amber" },
  vinculado_confirmacion: { label: "Vinculado a confirmación", tone: "green" },
  observado: { label: "Observado", tone: "amber" },
  rechazado: { label: "Rechazado", tone: "red" },
};

export default function PagosPage() {
  const { profile } = useAuth();
  const isClient = profile?.role === "cliente";
  const isBank = profile?.role === "entidad_financiera";
  const isAdmin = profile?.role === "administrador";
  const isMerchant = profile?.role === "comercio";

  const [tab, setTab] = useState<
    "cuotas" | "cumplimiento" | "comisiones" | "soporte"
  >(isMerchant ? "soporte" : "cuotas");

  const [credits, setCredits] = useState<LinkedCredit[]>([]);
  const [summary, setSummary] = useState<ComplianceSummary | null>(null);
  const [consents, setConsents] = useState<Consent[]>([]);
  const [accessAudit, setAccessAudit] = useState<AccessAuditRow[]>([]);
  const [banks, setBanks] = useState<Organization[]>([]);
  const [agreements, setAgreements] = useState<CommissionAgreement[]>([]);
  const [entries, setEntries] = useState<CommissionEntry[]>([]);
  const [cases, setCases] = useState<SupportCase[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");

  // Modales
  const [reportModal, setReportModal] = useState<{
    credit: LinkedCredit;
    installment?: Installment;
  } | null>(null);
  const [confirmPayModal, setConfirmPayModal] = useState<{
    credit: LinkedCredit;
    installment: Installment;
    report?: PaymentReport;
  } | null>(null);
  const [reverseModal, setReverseModal] =
    useState<BankPaymentConfirmation | null>(null);
  const [consentModal, setConsentModal] = useState(false);
  const [agreementModal, setAgreementModal] = useState(false);
  const [settleModal, setSettleModal] = useState<CommissionEntry | null>(null);
  const [caseModal, setCaseModal] = useState(false);
  const [resolveCaseModal, setResolveCaseModal] = useState<SupportCase | null>(
    null,
  );

  useEffect(() => {
    if (isMerchant) setTab("soporte");
  }, [isMerchant]);

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    setError("");
    try {
      const [
        creditsRes,
        compRes,
        banksRes,
        commRes,
        casesRes,
      ] = await Promise.all([
        !isMerchant
          ? api<{ credits: LinkedCredit[] }>("/api/credits")
          : Promise.resolve({ credits: [] }),
        isClient || isAdmin
          ? api<{
              summary: ComplianceSummary | null;
              consents: Consent[];
              accessAudit: AccessAuditRow[];
            }>("/api/compliance")
          : Promise.resolve({ summary: null, consents: [], accessAudit: [] }),
        isClient || isAdmin
          ? api<{ organizations: Organization[] }>(
              "/api/organizations?org_type=entidad_financiera",
            )
          : Promise.resolve({ organizations: [] }),
        isAdmin || isBank
          ? api<{
              agreements: CommissionAgreement[];
              entries: CommissionEntry[];
            }>("/api/commissions")
          : Promise.resolve({ agreements: [], entries: [] }),
        api<{ cases: SupportCase[] }>("/api/support"),
      ]);

      setCredits(creditsRes.credits);
      setSummary(compRes.summary);
      setConsents(compRes.consents);
      setAccessAudit(compRes.accessAudit);
      setBanks(banksRes.organizations);
      setAgreements(commRes.agreements);
      setEntries(commRes.entries);
      setCases(casesRes.cases);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Error al cargar seguimiento y registros.",
      );
    } finally {
      setLoading(false);
    }
  }, [profile, isMerchant, isClient, isAdmin, isBank]);

  useEffect(() => {
    if (profile) void load();
  }, [profile, load]);

  if (!profile) return null;

  async function submitClientReport(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!reportModal) return;
    setBusy(true);
    setFormError("");
    const f = new FormData(e.currentTarget);
    try {
      const amountBob = Number(f.get("amount_bob"));
      await api("/api/payments", {
        method: "POST",
        body: JSON.stringify({
          action: "report",
          credit_id: reportModal.credit.id,
          installment_id: reportModal.installment?.id ?? null,
          reported_amount_minor: toMinorUnits(amountBob),
          payment_date: String(f.get("payment_date")),
          reference_code: String(f.get("reference_code") || ""),
          notes: String(f.get("notes") || ""),
        }),
      });
      setReportModal(null);
      setNotice(
        "Reporte de pago enviado. La cuota permanecerá pendiente hasta que la entidad financiera confirme la recepción.",
      );
      await load();
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "No se pudo enviar el reporte.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function submitBankConfirmation(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!confirmPayModal) return;
    setBusy(true);
    setFormError("");
    const f = new FormData(e.currentTarget);
    try {
      const amountBob = Number(f.get("amount_bob"));
      const amountMinor = toMinorUnits(amountBob);
      const res = await api<{ duplicate?: boolean }>("/api/payments", {
        method: "POST",
        body: JSON.stringify({
          action: "confirm_payment",
          credit_id: confirmPayModal.credit.id,
          external_event_id: String(f.get("external_event_id") || ""),
          amount_minor: amountMinor,
          operation_date: new Date(
            String(f.get("operation_date")) + "T12:00:00Z",
          ).toISOString(),
          allocations: [
            {
              installment_id: confirmPayModal.installment.id,
              amount_minor: amountMinor,
            },
          ],
          linked_report_id: confirmPayModal.report?.id ?? null,
          notes: String(f.get("notes") || ""),
        }),
      });
      setConfirmPayModal(null);
      setNotice(
        res.duplicate
          ? "Evento externo ya procesado previamente (sin duplicación de pago)."
          : "Confirmación bancaria aplicada a la cuota y registrada en auditoría.",
      );
      await load();
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "No se pudo confirmar el pago.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function submitReverse(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!reverseModal) return;
    setBusy(true);
    setFormError("");
    const f = new FormData(e.currentTarget);
    try {
      await api("/api/payments", {
        method: "POST",
        body: JSON.stringify({
          action: "reverse_payment",
          original_confirmation_id: reverseModal.id,
          external_event_id: String(f.get("external_event_id") || ""),
          reason: String(f.get("reason") || ""),
        }),
      });
      setReverseModal(null);
      setNotice(
        "Reverso registrado como nuevo evento trazable. Se conservó la confirmación original y se actualizó el saldo de la cuota.",
      );
      await load();
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "No se pudo registrar el reverso.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function reviewReport(reportId: string, status: "observado" | "rechazado") {
    setBusy(true);
    setError("");
    try {
      await api("/api/payments", {
        method: "POST",
        body: JSON.stringify({
          action: "review_report",
          report_id: reportId,
          status,
          review_notes:
            status === "observado"
              ? "Comprobante requiere verificación adicional en canal bancario."
              : "Pago no localizado en conciliación bancaria.",
        }),
      });
      setNotice(`Reporte marcado como ${status}.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al actualizar reporte.");
    } finally {
      setBusy(false);
    }
  }

  async function grantConsent(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setFormError("");
    const f = new FormData(e.currentTarget);
    try {
      await api("/api/compliance", {
        method: "POST",
        body: JSON.stringify({
          target_org_id: String(f.get("target_org_id")),
          purpose: "consulta_cumplimiento_nueva_oportunidad",
          days_valid: Number(f.get("days_valid") || 30),
        }),
      });
      setConsentModal(false);
      setNotice("Autorización otorgada para compartir indicadores de cumplimiento.");
      await load();
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "No se pudo registrar autorización.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function revokeConsent(c: Consent) {
    setBusy(true);
    setError("");
    try {
      await api("/api/compliance", {
        method: "POST",
        body: JSON.stringify({
          target_org_id: c.target_org_id,
          purpose: c.purpose,
          days_valid: 1,
          revoke_consent_id: c.id,
        }),
      });
      setNotice("Autorización revocada. Se detienen nuevos accesos.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo revocar.");
    } finally {
      setBusy(false);
    }
  }

  async function createAgreement(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setFormError("");
    const f = new FormData(e.currentTarget);
    try {
      const calcType = String(f.get("calc_type")) as "fija" | "porcentaje";
      const fixedBob = Number(f.get("fixed_bob") || 0);
      const ratePct = Number(f.get("rate_pct") || 0);
      await api("/api/commissions", {
        method: "POST",
        body: JSON.stringify({
          organization_id: String(f.get("organization_id")),
          version_label: String(f.get("version_label") || "v1-demo"),
          calc_type: calcType,
          fixed_minor: calcType === "fija" ? toMinorUnits(fixedBob) : 0,
          rate_bps: calcType === "porcentaje" ? Math.round(ratePct * 100) : 0,
          service_description: String(f.get("service_description") || ""),
          is_demo: true,
        }),
      });
      setAgreementModal(false);
      setNotice("Convenio de comisión demo registrado.");
      await load();
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "No se pudo guardar el convenio.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function updateCommission(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!settleModal) return;
    setBusy(true);
    setFormError("");
    const f = new FormData(e.currentTarget);
    try {
      await api("/api/commissions", {
        method: "PATCH",
        body: JSON.stringify({
          entry_id: settleModal.id,
          status: String(f.get("status")),
          settlement_ref: String(f.get("settlement_ref") || ""),
          notes: String(f.get("notes") || ""),
        }),
      });
      setSettleModal(null);
      setNotice("Estado de comisión AYNI actualizado.");
      await load();
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "No se pudo actualizar comisión.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function createCase(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setFormError("");
    const f = new FormData(e.currentTarget);
    try {
      await api("/api/support", {
        method: "POST",
        body: JSON.stringify({
          category: String(f.get("category")),
          subject: String(f.get("subject")),
          description: String(f.get("description")),
        }),
      });
      setCaseModal(false);
      setNotice("Caso de soporte registrado correctamente.");
      await load();
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "No se pudo abrir la incidencia.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function updateCase(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!resolveCaseModal) return;
    setBusy(true);
    setFormError("");
    const f = new FormData(e.currentTarget);
    try {
      await api("/api/support", {
        method: "PATCH",
        body: JSON.stringify({
          id: resolveCaseModal.id,
          status: String(f.get("status")),
          resolution_notes: String(f.get("resolution_notes") || ""),
        }),
      });
      setResolveCaseModal(null);
      setNotice("Incidencia actualizada.");
      await load();
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "No se pudo actualizar el caso.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="section-stack">
      <div className="page-heading">
        <div>
          <span className="section-kicker">SEGUIMIENTO, CUMPLIMIENTO Y COMISIONES</span>
          <h1>Cuotas, pagos, consentimientos y soporte</h1>
          <p>
            AYNI no recauda cuotas ni procesa dinero de préstamos: el cliente
            paga por canales bancarios y la entidad financiera confirma cada
            operación.
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

      <div className="tabs-bar">
        {!isMerchant && (
          <button
            className={`tab-btn ${tab === "cuotas" ? "active" : ""}`}
            onClick={() => setTab("cuotas")}
          >
            <CreditCard size={16} /> Cronogramas y confirmaciones ({credits.length})
          </button>
        )}
        {(isClient || isAdmin) && (
          <button
            className={`tab-btn ${tab === "cumplimiento" ? "active" : ""}`}
            onClick={() => setTab("cumplimiento")}
          >
            <ShieldCheck size={16} /> Cumplimiento y consentimientos
          </button>
        )}
        {(isAdmin || isBank) && (
          <button
            className={`tab-btn ${tab === "comisiones" ? "active" : ""}`}
            onClick={() => setTab("comisiones")}
          >
            <Percent size={16} /> Comisiones AYNI (demo)
          </button>
        )}
        <button
          className={`tab-btn ${tab === "soporte" ? "active" : ""}`}
          onClick={() => setTab("soporte")}
        >
          <LifeBuoy size={16} /> Soporte e incidencias ({cases.length})
        </button>
      </div>

      {/* TAB 1: CRONOGRAMAS, REPORTES Y CONFIRMACIONES */}
      {tab === "cuotas" && !isMerchant && (
        <div className="section-stack">
          {loading ? (
            <div className="card">Cargando créditos y cronogramas…</div>
          ) : credits.length === 0 ? (
            <div className="card">
              <h3>No hay créditos con seguimiento activo</h3>
              <p>
                Los cronogramas aparecen aquí una vez que la entidad financiera
                formalice el crédito y publique su cronograma.
              </p>
            </div>
          ) : (
            credits.map((credit) => {
              const currentSchedule = (credit.schedules || []).find(
                (s) => s.is_current,
              );
              const previousVersions = Math.max(
                0,
                (credit.schedules || []).length - 1,
              );
              const reversedIds = new Set(
                (credit.confirmations || [])
                  .filter((x) => x.event_type === "reverso" && x.reversal_of_id)
                  .map((x) => x.reversal_of_id!),
              );

              return (
                <section key={credit.id} className="users-card">
                  <div className="users-card-header">
                    <div>
                      <CreditCard size={20} />
                      <h2>
                        Crédito {credit.external_credit_ref || credit.order_code}{" "}
                        · {credit.bank_name}
                      </h2>
                      <span className="pill-badge blue">{credit.status}</span>
                    </div>
                    <div className="muted-text">
                      {currentSchedule
                        ? `Cronograma v${currentSchedule.version_number} (${previousVersions} previa/s) · Última actualización: ${new Date(currentSchedule.last_synced_at).toLocaleString("es-BO")}`
                        : "Sin cronograma publicado por el banco"}
                    </div>
                  </div>

                  {currentSchedule && (currentSchedule.installments || []).length > 0 ? (
                    <div className="table-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>Cuota</th>
                            <th>Vencimiento</th>
                            <th>Monto</th>
                            <th>Confirmado</th>
                            <th>Estado bancario</th>
                            <th className="right">Acción</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(currentSchedule.installments || []).map((inst) => {
                            const ib = instBadge[inst.status];
                            return (
                              <tr key={inst.id}>
                                <td>#{inst.installment_number}</td>
                                <td className="date-cell">{inst.due_date}</td>
                                <td>
                                  <strong>
                                    {formatMinor(inst.amount_minor, inst.currency)}
                                  </strong>
                                </td>
                                <td>
                                  {formatMinor(inst.paid_minor, inst.currency)}
                                </td>
                                <td>
                                  <span className={`pill-badge ${ib.tone}`}>
                                    {ib.label}
                                  </span>
                                </td>
                                <td className="right">
                                  {isClient && inst.status !== "pagada" && (
                                    <button
                                      className="button"
                                      onClick={() => {
                                        setFormError("");
                                        setReportModal({
                                          credit,
                                          installment: inst,
                                        });
                                      }}
                                    >
                                      Reportar pago
                                    </button>
                                  )}
                                  {isBank && inst.status !== "pagada" && (
                                    <button
                                      className="button primary"
                                      onClick={() => {
                                        setFormError("");
                                        setConfirmPayModal({
                                          credit,
                                          installment: inst,
                                        });
                                      }}
                                    >
                                      <CheckCircle2 size={15} /> Confirmar pago
                                    </button>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="empty-state">
                      El banco aún no ha cargado el cronograma de este crédito.
                    </div>
                  )}

                  {/* Reportes del cliente vs Confirmaciones del banco */}
                  <div className="cards-grid">
                    <div className="item-card">
                      <div>
                        <h3>
                          Reportes del cliente ({(credit.reports || []).length})
                        </h3>
                        <p>
                          Declaración de pago por canal bancario. No reduce
                          deuda ni marca cuotas como pagadas por sí sola.
                        </p>
                      </div>
                      {(credit.reports || []).length === 0 ? (
                        <small className="muted-text">Sin reportes</small>
                      ) : (
                        <div className="section-stack" style={{ gap: "0.5rem" }}>
                          {(credit.reports || []).map((rep) => {
                            const rb = repBadge[rep.status];
                            const targetInst =
                              currentSchedule?.installments?.find(
                                (i) => i.id === rep.installment_id,
                              ) || currentSchedule?.installments?.[0];
                            return (
                              <div
                                key={rep.id}
                                style={{
                                  borderTop: "1px solid #eef2f6",
                                  paddingTop: "0.5rem",
                                }}
                              >
                                <div className="split-row">
                                  <strong>
                                    {formatMinor(
                                      rep.reported_amount_minor,
                                      rep.currency,
                                    )}
                                  </strong>
                                  <span className={`pill-badge ${rb.tone}`}>
                                    {rb.label}
                                  </span>
                                </div>
                                <div className="muted-text">
                                  Fecha: {rep.payment_date} · Ref:{" "}
                                  {rep.reference_code || "Sin ref."}
                                </div>
                                {rep.review_notes && (
                                  <div className="muted-text">
                                    Banco: {rep.review_notes}
                                  </div>
                                )}
                                {isBank &&
                                  rep.status === "pendiente_verificacion" && (
                                    <div
                                      className="inline-actions"
                                      style={{ marginTop: "0.4rem" }}
                                    >
                                      {targetInst && (
                                        <button
                                          className="button primary"
                                          onClick={() => {
                                            setFormError("");
                                            setConfirmPayModal({
                                              credit,
                                              installment: targetInst,
                                              report: rep,
                                            });
                                          }}
                                        >
                                          Vincular y confirmar
                                        </button>
                                      )}
                                      <button
                                        className="button"
                                        disabled={busy}
                                        onClick={() =>
                                          void reviewReport(rep.id, "observado")
                                        }
                                      >
                                        Observar
                                      </button>
                                      <button
                                        className="button danger-text"
                                        disabled={busy}
                                        onClick={() =>
                                          void reviewReport(rep.id, "rechazado")
                                        }
                                      >
                                        Rechazar
                                      </button>
                                    </div>
                                  )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    <div className="item-card">
                      <div>
                        <h3>
                          Confirmaciones y reversos bancarios (
                          {(credit.confirmations || []).length})
                        </h3>
                        <p>
                          Eventos verificados e idempotentes emitidos por la
                          entidad financiera.
                        </p>
                      </div>
                      {(credit.confirmations || []).length === 0 ? (
                        <small className="muted-text">
                          Sin confirmaciones registradas
                        </small>
                      ) : (
                        <div className="section-stack" style={{ gap: "0.5rem" }}>
                          {(credit.confirmations || []).map((cf) => {
                            const isReversal = cf.event_type === "reverso";
                            const alreadyReversed = reversedIds.has(cf.id);
                            return (
                              <div
                                key={cf.id}
                                style={{
                                  borderTop: "1px solid #eef2f6",
                                  paddingTop: "0.5rem",
                                }}
                              >
                                <div className="split-row">
                                  <strong>
                                    {isReversal ? "Reverso" : "Confirmación"} ·{" "}
                                    {formatMinor(cf.amount_minor, cf.currency)}
                                  </strong>
                                  <span
                                    className={`pill-badge ${isReversal ? "red" : "green"}`}
                                  >
                                    {cf.external_event_id}
                                  </span>
                                </div>
                                <div className="muted-text">
                                  {new Date(cf.operation_date).toLocaleString(
                                    "es-BO",
                                  )}{" "}
                                  · {cf.notes || cf.source_channel}
                                </div>
                                {isBank && !isReversal && !alreadyReversed && (
                                  <button
                                    className="button"
                                    style={{ marginTop: "0.4rem" }}
                                    onClick={() => {
                                      setFormError("");
                                      setReverseModal(cf);
                                    }}
                                  >
                                    <RotateCcw size={14} /> Registrar reverso
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </section>
              );
            })
          )}
        </div>
      )}

      {/* TAB 2: CUMPLIMIENTO Y CONSENTIMIENTOS */}
      {tab === "cumplimiento" && (isClient || isAdmin) && (
        <div className="section-stack">
          {isClient && summary && (
            <>
              <div className="demo-banner">
                <div>
                  <strong>Indicadores descriptivos (no scoring):</strong>{" "}
                  {summary.disclaimer}
                </div>
                <span className="muted-text">
                  Actualizado:{" "}
                  {summary.last_synced_at
                    ? new Date(summary.last_synced_at).toLocaleString("es-BO")
                    : "Sin confirmaciones aún"}
                </span>
              </div>
              <section className="kpi-grid">
                <div className="kpi-card">
                  <small>Cuotas confirmadas</small>
                  <strong>{summary.confirmed_installments}</strong>
                  <span>Verificadas por entidad financiera</span>
                </div>
                <div className="kpi-card">
                  <small>Pagadas dentro de plazo</small>
                  <strong>{summary.paid_on_time}</strong>
                  <span>
                    Atrasos confirmados: {summary.confirmed_delays}
                  </span>
                </div>
                <div className="kpi-card">
                  <small>Información pendiente</small>
                  <strong>{summary.pending_info_installments}</strong>
                  <span>Nunca asumidas como mora automática</span>
                </div>
                <div className="kpi-card">
                  <small>Operaciones completadas</small>
                  <strong>{summary.completed_credits}</strong>
                  <span>Créditos activos: {summary.active_credits}</span>
                </div>
              </section>
            </>
          )}

          <section className="users-card">
            <div className="users-card-header">
              <div>
                <ShieldCheck size={20} />
                <h2>Autorizaciones para compartir información</h2>
                <span className="count-badge">{consents.length}</span>
              </div>
              {isClient && (
                <button
                  className="button primary"
                  onClick={() => {
                    setFormError("");
                    setConsentModal(true);
                  }}
                >
                  <Plus size={16} /> Autorizar nueva entidad
                </button>
              )}
            </div>
            {consents.length === 0 ? (
              <div className="empty-state">
                No existen autorizaciones registradas todavía.
              </div>
            ) : (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Entidad destinataria</th>
                      <th>Finalidad</th>
                      <th>Versión / Vigencia</th>
                      <th>Estado</th>
                      {isClient && <th className="right">Acción</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {consents.map((c) => (
                      <tr key={c.id}>
                        <td>
                          <strong>{c.target_org_name || c.target_org_id}</strong>
                        </td>
                        <td>
                          {c.purpose === "evaluacion_solicitud"
                            ? "Evaluación de solicitud"
                            : "Consulta de cumplimiento para nueva oportunidad"}
                        </td>
                        <td className="muted-text">
                          {c.text_version} · Hasta{" "}
                          {new Date(c.expires_at).toLocaleDateString("es-BO")}
                        </td>
                        <td>
                          <span
                            className={`pill-badge ${c.status === "vigente" ? "green" : "gray"}`}
                          >
                            {c.status}
                          </span>
                        </td>
                        {isClient && (
                          <td className="right">
                            {c.status === "vigente" && (
                              <button
                                className="button danger-text"
                                disabled={busy}
                                onClick={() => void revokeConsent(c)}
                              >
                                Revocar
                              </button>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="users-card">
            <div className="users-card-header">
              <div>
                <AlertTriangle size={19} />
                <h2>Auditoría de accesos a datos sensibles</h2>
                <span className="count-badge">{accessAudit.length}</span>
              </div>
            </div>
            {accessAudit.length === 0 ? (
              <div className="empty-state">
                Ninguna entidad ha consultado tu historial autorizado todavía.
              </div>
            ) : (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Finalidad</th>
                      <th>Organización</th>
                    </tr>
                  </thead>
                  <tbody>
                    {accessAudit.map((a) => (
                      <tr key={a.id}>
                        <td className="date-cell">
                          {new Date(a.created_at).toLocaleString("es-BO")}
                        </td>
                        <td>{a.purpose}</td>
                        <td className="mono">{a.accessor_org_id || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}

      {/* TAB 3: COMISIONES AYNI SEPARADAS */}
      {tab === "comisiones" && (isAdmin || isBank) && (
        <div className="section-stack">
          <div className="demo-banner">
            <div>
              <strong>Liquidación independiente (parámetros ficticios demo):</strong>{" "}
              AYNI factura su servicio tecnológico al banco por financiamiento
              concretado (evento: desembolso confirmado). Nunca se descuenta de
              las cuotas del cliente.
            </div>
            {isAdmin && (
              <button
                className="button primary"
                onClick={() => {
                  setFormError("");
                  setAgreementModal(true);
                }}
              >
                <Plus size={16} /> Configurar convenio demo
              </button>
            )}
          </div>

          <section className="users-card">
            <div className="users-card-header">
              <div>
                <Percent size={20} />
                <h2>Convenios de comisión registrados</h2>
                <span className="count-badge">{agreements.length}</span>
              </div>
            </div>
            {agreements.length === 0 ? (
              <div className="empty-state">
                No hay convenios de comisión configurados todavía.
              </div>
            ) : (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Entidad</th>
                      <th>Versión / Evento</th>
                      <th>Cálculo (ficticio demo)</th>
                      <th>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {agreements.map((ag) => (
                      <tr key={ag.id}>
                        <td>
                          <strong>{ag.organization_name}</strong>
                          <div className="muted-text">
                            {ag.service_description}
                          </div>
                        </td>
                        <td>
                          {ag.version_label} · {ag.trigger_event}
                        </td>
                        <td>
                          <strong>
                            {ag.calc_type === "fija"
                              ? formatMinor(ag.fixed_minor, ag.currency)
                              : `${(ag.rate_bps / 100).toFixed(2)}%`}
                          </strong>
                        </td>
                        <td>
                          <span
                            className={`pill-badge ${ag.status === "activo" ? "green" : "gray"}`}
                          >
                            {ag.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="users-card">
            <div className="users-card-header">
              <div>
                <Percent size={20} />
                <h2>Comisiones devengadas y liquidaciones</h2>
                <span className="count-badge">{entries.length}</span>
              </div>
            </div>
            {entries.length === 0 ? (
              <div className="empty-state">
                Se generan automáticamente cuando el banco confirma un
                desembolso bajo un convenio activo.
              </div>
            ) : (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Entidad</th>
                      <th>Base desembolso</th>
                      <th>Comisión AYNI</th>
                      <th>Estado</th>
                      <th>Liquidación</th>
                      {isAdmin && <th className="right">Acción</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((en) => (
                      <tr key={en.id}>
                        <td>{en.organization_name}</td>
                        <td>{formatMinor(en.base_amount_minor, en.currency)}</td>
                        <td>
                          <strong>
                            {formatMinor(en.commission_minor, en.currency)}
                          </strong>
                        </td>
                        <td>
                          <span
                            className={`pill-badge ${
                              en.status === "liquidada"
                                ? "green"
                                : en.status === "anulada"
                                  ? "red"
                                  : "blue"
                            }`}
                          >
                            {en.status}
                          </span>
                        </td>
                        <td className="muted-text">
                          {en.settlement_ref || "Pendiente"}
                        </td>
                        {isAdmin && (
                          <td className="right">
                            {en.status === "devengada" && (
                              <button
                                className="button"
                                onClick={() => {
                                  setFormError("");
                                  setSettleModal(en);
                                }}
                              >
                                Liquidar / Anular
                              </button>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}

      {/* TAB 4: SOPORTE E INCIDENCIAS */}
      {tab === "soporte" && (
        <section className="users-card">
          <div className="users-card-header">
            <div>
              <LifeBuoy size={20} />
              <h2>Soporte técnico e incidencias</h2>
              <span className="count-badge">{cases.length}</span>
            </div>
            <button
              className="button primary"
              onClick={() => {
                setFormError("");
                setCaseModal(true);
              }}
            >
              <Plus size={16} /> Abrir incidencia
            </button>
          </div>
          {cases.length === 0 ? (
            <div className="empty-state">
              No hay casos de soporte registrados.
            </div>
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Categoría</th>
                    <th>Asunto y detalle</th>
                    <th>Estado</th>
                    <th>Resolución</th>
                    {isAdmin && <th className="right">Gestionar</th>}
                  </tr>
                </thead>
                <tbody>
                  {cases.map((cs) => (
                    <tr key={cs.id}>
                      <td>
                        <span className="pill-badge gray">{cs.category}</span>
                      </td>
                      <td>
                        <strong>{cs.subject}</strong>
                        <div className="muted-text">{cs.description}</div>
                      </td>
                      <td>
                        <span
                          className={`pill-badge ${
                            cs.status === "resuelto" || cs.status === "cerrado"
                              ? "green"
                              : "amber"
                          }`}
                        >
                          {cs.status}
                        </span>
                      </td>
                      <td className="muted-text">
                        {cs.resolution_notes || "Pendiente"}
                      </td>
                      {isAdmin && (
                        <td className="right">
                          <button
                            className="button"
                            onClick={() => {
                              setFormError("");
                              setResolveCaseModal(cs);
                            }}
                          >
                            Actualizar
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* MODALES */}
      {reportModal && (
        <Modal
          title="Reportar pago realizado al banco"
          busy={busy}
          onClose={() => setReportModal(null)}
        >
          <form onSubmit={submitClientReport} className="form-stack">
            <div className="notice">
              Este reporte notifica tu comprobante al banco, pero{" "}
              <strong>no marca la cuota como pagada</strong> hasta que la
              entidad financiera confirme el abono.
            </div>
            <div className="form-grid">
              <label>
                Monto pagado (BOB)
                <input
                  name="amount_bob"
                  type="number"
                  step="0.01"
                  defaultValue={
                    reportModal.installment
                      ? (reportModal.installment.amount_minor / 100).toFixed(2)
                      : ""
                  }
                  required
                />
              </label>
              <label>
                Fecha de pago
                <input
                  name="payment_date"
                  type="date"
                  defaultValue={new Date().toISOString().slice(0, 10)}
                  required
                />
              </label>
            </div>
            <label>
              Código / número de comprobante bancario
              <input
                name="reference_code"
                placeholder="Ej. QR-884921"
                maxLength={80}
              />
            </label>
            <label>
              Notas adicionales
              <input
                name="notes"
                placeholder="Ej. Pagado en ventanilla / transferencia QR"
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
                onClick={() => setReportModal(null)}
              >
                Cancelar
              </button>
              <button className="button primary" disabled={busy}>
                {busy ? "Enviando…" : "Enviar reporte"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {confirmPayModal && (
        <Modal
          title={`Confirmar pago bancario · Cuota #${confirmPayModal.installment.installment_number}`}
          busy={busy}
          onClose={() => setConfirmPayModal(null)}
        >
          <form onSubmit={submitBankConfirmation} className="form-stack">
            <label>
              ID externo único del evento bancario (idempotencia)
              <input
                name="external_event_id"
                defaultValue={`PAY-${Date.now()}`}
                required
                minLength={3}
                maxLength={80}
              />
            </label>
            <div className="form-grid">
              <label>
                Monto confirmado (BOB)
                <input
                  name="amount_bob"
                  type="number"
                  step="0.01"
                  defaultValue={(
                    (confirmPayModal.report?.reported_amount_minor ??
                      confirmPayModal.installment.amount_minor -
                        confirmPayModal.installment.paid_minor) /
                    100
                  ).toFixed(2)}
                  required
                />
              </label>
              <label>
                Fecha de operación
                <input
                  name="operation_date"
                  type="date"
                  defaultValue={
                    confirmPayModal.report?.payment_date ||
                    new Date().toISOString().slice(0, 10)
                  }
                  required
                />
              </label>
            </div>
            <label>
              Nota de conciliación bancaria
              <input
                name="notes"
                defaultValue="Pago recibido y aplicado por canal bancario."
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
                onClick={() => setConfirmPayModal(null)}
              >
                Cancelar
              </button>
              <button className="button primary" disabled={busy}>
                {busy ? "Confirmando…" : "Confirmar pago"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {reverseModal && (
        <Modal
          title={`Registrar reverso · ${reverseModal.external_event_id}`}
          busy={busy}
          onClose={() => setReverseModal(null)}
        >
          <form onSubmit={submitReverse} className="form-stack">
            <div className="notice">
              El reverso se registra como un evento nuevo sin borrar la
              confirmación original y revierte el importe aplicado a las cuotas.
            </div>
            <label>
              ID externo único del reverso
              <input
                name="external_event_id"
                defaultValue={`REV-${Date.now()}`}
                required
              />
            </label>
            <label>
              Motivo del reverso bancario
              <input
                name="reason"
                defaultValue="Ajuste por conciliación bancaria"
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
                onClick={() => setReverseModal(null)}
              >
                Cancelar
              </button>
              <button className="button danger" disabled={busy}>
                {busy ? "Procesando…" : "Confirmar reverso"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {consentModal && (
        <Modal
          title="Autorizar consulta de cumplimiento"
          busy={busy}
          onClose={() => setConsentModal(false)}
        >
          <form onSubmit={grantConsent} className="form-stack">
            <div className="notice">
              Solo la entidad que autorices podrá consultar tus indicadores
              descriptivos de cumplimiento durante el periodo elegido. Puedes
              revocar esta autorización en cualquier momento.
            </div>
            <label>
              Entidad financiera destinataria
              <select name="target_org_id" required>
                <option value="">Selecciona una entidad…</option>
                {banks.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Vigencia (días)
              <input
                name="days_valid"
                type="number"
                min={1}
                max={180}
                defaultValue={30}
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
                onClick={() => setConsentModal(false)}
              >
                Cancelar
              </button>
              <button className="button primary" disabled={busy}>
                {busy ? "Guardando…" : "Otorgar autorización"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {agreementModal && (
        <Modal
          title="Configurar convenio de comisión AYNI (Demo)"
          busy={busy}
          onClose={() => setAgreementModal(false)}
        >
          <form onSubmit={createAgreement} className="form-stack">
            <div className="notice">
              Parámetros exclusivamente ficticios para demostración académica.
              El devengo ocurre solo ante desembolso confirmado por el banco.
            </div>
            <label>
              Entidad financiera
              <select name="organization_id" required>
                <option value="">Selecciona una entidad…</option>
                {banks.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="form-grid">
              <label>
                Tipo de tarifa
                <select name="calc_type" defaultValue="porcentaje">
                  <option value="porcentaje">Porcentaje sobre desembolso</option>
                  <option value="fija">Tarifa fija por operación</option>
                </select>
              </label>
              <label>
                Versión
                <input name="version_label" defaultValue="v1-demo" required />
              </label>
            </div>
            <div className="form-grid">
              <label>
                Porcentaje demo (%)
                <input
                  name="rate_pct"
                  type="number"
                  step="0.1"
                  defaultValue="2.5"
                />
              </label>
              <label>
                Tarifa fija demo (BOB)
                <input name="fixed_bob" type="number" step="0.01" defaultValue="0" />
              </label>
            </div>
            <label>
              Descripción del servicio remunerado
              <input
                name="service_description"
                defaultValue="Servicio tecnológico y captación por financiamiento concretado (parámetro ficticio demo)"
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
                onClick={() => setAgreementModal(false)}
              >
                Cancelar
              </button>
              <button className="button primary" disabled={busy}>
                {busy ? "Guardando…" : "Guardar convenio"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {settleModal && (
        <Modal
          title="Liquidar o anular comisión AYNI"
          busy={busy}
          onClose={() => setSettleModal(null)}
        >
          <form onSubmit={updateCommission} className="form-stack">
            <label>
              Nuevo estado
              <select name="status" defaultValue="liquidada">
                <option value="liquidada">Liquidada (factura/pago separado)</option>
                <option value="anulada">Anulada</option>
              </select>
            </label>
            <label>
              Referencia de liquidación / factura
              <input
                name="settlement_ref"
                placeholder="Ej. LIQ-DEMO-2026-01"
                maxLength={80}
              />
            </label>
            <label>
              Notas
              <input name="notes" maxLength={500} />
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
                onClick={() => setSettleModal(null)}
              >
                Cancelar
              </button>
              <button className="button primary" disabled={busy}>
                {busy ? "Guardando…" : "Guardar"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {caseModal && (
        <Modal
          title="Abrir incidencia o reclamo"
          busy={busy}
          onClose={() => setCaseModal(false)}
        >
          <form onSubmit={createCase} className="form-stack">
            <label>
              Categoría
              <select name="category" defaultValue="tecnico">
                <option value="tecnico">Soporte técnico de plataforma AYNI</option>
                <option value="entrega_comercial">
                  Entrega o devolución comercial
                </option>
                <option value="credito_pagos">
                  Reclamo sobre crédito o pagos (derivación bancaria)
                </option>
                <option value="datos_consentimiento">
                  Corrección de datos o consentimientos
                </option>
              </select>
            </label>
            <label>
              Asunto
              <input name="subject" required minLength={3} maxLength={140} />
            </label>
            <label>
              Descripción
              <input
                name="description"
                required
                minLength={5}
                maxLength={1500}
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
                onClick={() => setCaseModal(false)}
              >
                Cancelar
              </button>
              <button className="button primary" disabled={busy}>
                {busy ? "Enviando…" : "Crear caso"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {resolveCaseModal && (
        <Modal
          title="Actualizar incidencia"
          busy={busy}
          onClose={() => setResolveCaseModal(null)}
        >
          <form onSubmit={updateCase} className="form-stack">
            <label>
              Estado
              <select name="status" defaultValue="resuelto">
                <option value="en_proceso">En proceso</option>
                <option value="resuelto">Resuelto</option>
                <option value="cerrado">Cerrado</option>
              </select>
            </label>
            <label>
              Notas de resolución
              <input
                name="resolution_notes"
                defaultValue={resolveCaseModal.resolution_notes}
                maxLength={1000}
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
                onClick={() => setResolveCaseModal(null)}
              >
                Cancelar
              </button>
              <button className="button primary" disabled={busy}>
                {busy ? "Guardando…" : "Actualizar"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}