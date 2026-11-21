"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  Building2,
  ChartNoAxesCombined,
  CreditCard,
  Landmark,
  ShieldCheck,
  ShoppingBag,
  Store,
} from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { api } from "@/lib/supabase-browser";
import {
  formatMinor,
  roleLabels,
  type ComplianceSummary,
  type Role,
} from "@/lib/types";

type DashboardData = {
  role: Role;
  counts: {
    organizations: number;
    products: number;
    orders: number;
    applications: number;
    credits: number;
    openCases: number;
    totalAccruedMinor: number;
  };
  compliance: ComplianceSummary | null;
};

export default function DashboardPage() {
  const { profile } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    api<DashboardData>("/api/dashboard")
      .then((res) => {
        if (active) setData(res);
      })
      .catch((e) => {
        if (active)
          setError(
            e instanceof Error ? e.message : "No se pudo cargar el resumen.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  if (!profile) return null;

  const memberships = profile.memberships || [];
  const activeOrg = memberships[0]?.organization;

  return (
    <div className="section-stack">
      <div className="page-heading">
        <div>
          <span className="section-kicker">RESUMEN OPERATIVO</span>
          <h1>Hola, {profile.full_name}</h1>
          <p>
            Rol activo: <strong>{roleLabels[profile.role]}</strong>
            {activeOrg ? ` · Organización: ${activeOrg.name}` : ""}
          </p>
        </div>
      </div>

      <div className="demo-banner">
        <div>
          <strong>Entorno de simulación académica:</strong> AYNI conecta
          clientes, comercios y entidades financieras. La entidad financiera
          evalúa y concede el crédito y recibe los pagos; AYNI no otorga
          préstamos ni recauda cuotas.
        </div>
        <span className="pill-badge green">
          <ShieldCheck size={14} /> RLS Activo
        </span>
      </div>

      {(profile.role === "comercio" || profile.role === "entidad_financiera") &&
        memberships.length === 0 && (
          <div className="error-message" role="alert">
            Tu cuenta tiene rol <strong>{roleLabels[profile.role]}</strong>,
            pero todavía no está vinculada a ninguna organización. Un
            administrador de AYNI debe asignarte en{" "}
            <strong>Comercios y catálogo</strong>.
          </div>
        )}

      {error && (
        <div className="error-message" role="alert">
          {error}
        </div>
      )}

      {loading ? (
        <div className="card">Cargando indicadores…</div>
      ) : data ? (
        <>
          <section className="kpi-grid">
            {profile.role === "administrador" && (
              <>
                <div className="kpi-card">
                  <small>Organizaciones registradas</small>
                  <strong>{data.counts.organizations}</strong>
                  <span>Comercios y bancos aislados</span>
                </div>
                <div className="kpi-card">
                  <small>Órdenes visibles</small>
                  <strong>{data.counts.orders}</strong>
                  <span>Compras registradas en la plataforma</span>
                </div>
                <div className="kpi-card">
                  <small>Comisiones AYNI (demo)</small>
                  <strong>{formatMinor(data.counts.totalAccruedMinor)}</strong>
                  <span>Devengadas/liquidadas por servicio propio</span>
                </div>
                <div className="kpi-card">
                  <small>Incidencias abiertas</small>
                  <strong>{data.counts.openCases}</strong>
                  <span>Casos de soporte activos</span>
                </div>
              </>
            )}

            {profile.role === "cliente" && (
              <>
                <div className="kpi-card">
                  <small>Mis órdenes de compra</small>
                  <strong>{data.counts.orders}</strong>
                  <span>Con precio congelado al crear</span>
                </div>
                <div className="kpi-card">
                  <small>Mis solicitudes</small>
                  <strong>{data.counts.applications}</strong>
                  <span>Enviadas a entidades identificadas</span>
                </div>
                <div className="kpi-card">
                  <small>Créditos vinculados</small>
                  <strong>{data.counts.credits}</strong>
                  <span>Emitidos y gestionados por el banco</span>
                </div>
                <div className="kpi-card">
                  <small>Cuotas confirmadas</small>
                  <strong>{data.compliance?.confirmed_installments ?? 0}</strong>
                  <span>
                    En plazo: {data.compliance?.paid_on_time ?? 0} · Atrasos:{" "}
                    {data.compliance?.confirmed_delays ?? 0}
                  </span>
                </div>
              </>
            )}

            {profile.role === "comercio" && (
              <>
                <div className="kpi-card">
                  <small>Productos publicados</small>
                  <strong>{data.counts.products}</strong>
                  <span>Catálogo visible para clientes</span>
                </div>
                <div className="kpi-card">
                  <small>Órdenes de mi comercio</small>
                  <strong>{data.counts.orders}</strong>
                  <span>Aisladas de otros comercios</span>
                </div>
                <div className="kpi-card">
                  <small>Incidencias activas</small>
                  <strong>{data.counts.openCases}</strong>
                  <span>Soporte y entregas comerciales</span>
                </div>
              </>
            )}

            {profile.role === "entidad_financiera" && (
              <>
                <div className="kpi-card">
                  <small>Solicitudes recibidas</small>
                  <strong>{data.counts.applications}</strong>
                  <span>Dirigidas exclusivamente a tu entidad</span>
                </div>
                <div className="kpi-card">
                  <small>Créditos vinculados</small>
                  <strong>{data.counts.credits}</strong>
                  <span>Formalización, desembolso y cronogramas</span>
                </div>
                <div className="kpi-card">
                  <small>Comisiones del convenio (demo)</small>
                  <strong>{formatMinor(data.counts.totalAccruedMinor)}</strong>
                  <span>Liquidación separada del pago de cuotas</span>
                </div>
                <div className="kpi-card">
                  <small>Casos de soporte</small>
                  <strong>{data.counts.openCases}</strong>
                  <span>Reclamos y consultas del banco</span>
                </div>
              </>
            )}
          </section>

          <section className="users-card">
            <div className="users-card-header">
              <div>
                <Building2 size={20} />
                <h2>Accesos directos de tu rol</h2>
              </div>
            </div>
            <div className="cards-grid">
              {profile.role === "cliente" && (
                <>
                  <div className="item-card">
                    <div>
                      <h3>1. Explorar y crear orden</h3>
                      <p>
                        Elige productos de comercios afiliados y crea tu orden
                        con precio congelado.
                      </p>
                    </div>
                    <Link className="button primary" href="/app/compras">
                      <ShoppingBag size={16} /> Ir a compras <ArrowRight size={15} />
                    </Link>
                  </div>
                  <div className="item-card">
                    <div>
                      <h3>2. Solicitar financiamiento</h3>
                      <p>
                        Envía tu solicitud a una entidad financiera y revisa
                        ofertas vigentes.
                      </p>
                    </div>
                    <Link className="button primary" href="/app/financiamiento">
                      <Landmark size={16} /> Ir a financiamiento{" "}
                      <ArrowRight size={15} />
                    </Link>
                  </div>
                  <div className="item-card">
                    <div>
                      <h3>3. Cuotas y cumplimiento</h3>
                      <p>
                        Consulta cronogramas bancarios, reporta pagos y gestiona
                        tus autorizaciones de datos.
                      </p>
                    </div>
                    <Link className="button" href="/app/pagos">
                      <CreditCard size={16} /> Ir a cuotas y pagos{" "}
                      <ArrowRight size={15} />
                    </Link>
                  </div>
                </>
              )}

              {profile.role === "comercio" && (
                <>
                  <div className="item-card">
                    <div>
                      <h3>Administrar catálogo</h3>
                      <p>
                        Publica productos, precios en BOB y disponibilidad de
                        stock de tu comercio.
                      </p>
                    </div>
                    <Link className="button primary" href="/app/comercios">
                      <Store size={16} /> Mi catálogo <ArrowRight size={15} />
                    </Link>
                  </div>
                  <div className="item-card">
                    <div>
                      <h3>Gestionar órdenes y entregas</h3>
                      <p>
                        Verifica desembolsos confirmados por el banco y registra
                        entregas o devoluciones.
                      </p>
                    </div>
                    <Link className="button primary" href="/app/compras">
                      <ShoppingBag size={16} /> Ver órdenes <ArrowRight size={15} />
                    </Link>
                  </div>
                </>
              )}

              {profile.role === "entidad_financiera" && (
                <>
                  <div className="item-card">
                    <div>
                      <h3>Bandeja de evaluación bancaria</h3>
                      <p>
                        Evalúa solicitudes dirigidas a tu entidad, emite ofertas
                        versionadas, formaliza y desembolsa.
                      </p>
                    </div>
                    <Link className="button primary" href="/app/evaluacion">
                      <ChartNoAxesCombined size={16} /> Ir a evaluación{" "}
                      <ArrowRight size={15} />
                    </Link>
                  </div>
                  <div className="item-card">
                    <div>
                      <h3>Confirmaciones, cronogramas y reversos</h3>
                      <p>
                        Publica versiones de cronograma, confirma pagos recibidos
                        y revisa reportes de clientes.
                      </p>
                    </div>
                    <Link className="button" href="/app/pagos">
                      <CreditCard size={16} /> Ir a pagos <ArrowRight size={15} />
                    </Link>
                  </div>
                </>
              )}

              {profile.role === "administrador" && (
                <>
                  <div className="item-card">
                    <div>
                      <h3>Organizaciones y membresías</h3>
                      <p>
                        Registra comercios y bancos aliados y vincula sus
                        empleados autorizados.
                      </p>
                    </div>
                    <Link className="button primary" href="/app/comercios">
                      <Store size={16} /> Gestionar organizaciones{" "}
                      <ArrowRight size={15} />
                    </Link>
                  </div>
                  <div className="item-card">
                    <div>
                      <h3>Comisiones AYNI y soporte</h3>
                      <p>
                        Configura convenios de comisión separados del flujo de
                        cuotas y supervisa incidencias.
                      </p>
                    </div>
                    <Link className="button" href="/app/pagos">
                      <CreditCard size={16} /> Comisiones y soporte{" "}
                      <ArrowRight size={15} />
                    </Link>
                  </div>
                </>
              )}
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}