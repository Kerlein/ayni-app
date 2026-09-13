"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useRef } from "react";
import {
  House,
  Users,
  ChartNoAxesCombined,
  ShoppingBag,
  CreditCard,
  Store,
  Landmark,
  ChevronDown,
  ChevronRight,
  Menu,
  X,
  LogOut,
  UserRound,
  ShieldCheck,
  ArrowUpRight,
  PanelLeftClose,
  PanelLeftOpen,
  Clock3,
} from "lucide-react";
import { Brand } from "./brand";
import { useAuth } from "./auth-provider";
import { roleLabels } from "@/lib/types";
import { isConfigured } from "@/lib/supabase-browser";
const modules = [
  {
    slug: "evaluacion",
    name: "Evaluación crediticia",
    icon: ChartNoAxesCombined,
  },
  { slug: "compras", name: "Gestión de compras", icon: ShoppingBag },
  { slug: "pagos", name: "Gestión de pagos", icon: CreditCard },
  { slug: "comercios", name: "Gestión de comercios", icon: Store },
  { slug: "financiamiento", name: "Gestión de financiamiento", icon: Landmark },
];
export function Shell({
  children,
  preview = false,
}: {
  children: React.ReactNode;
  preview?: boolean;
}) {
  const { profile, session, loading, error, logout, refresh } = useAuth();
  const path = usePathname();
  const router = useRouter();
  const [mobile, setMobile] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [open, setOpen] = useState(false);
  const [usersOpen, setUsersOpen] = useState(true);
  const [logoutError, setLogoutError] = useState("");
  const dropdown = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!preview && !loading && !session && isConfigured())
      router.replace("/login");
  }, [loading, session, preview, router]);
  useEffect(() => {
    setMobile(false);
    setOpen(false);
  }, [path]);
  useEffect(() => {
    function outside(e: PointerEvent) {
      if (!dropdown.current?.contains(e.target as Node)) setOpen(false);
    }
    function key(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        setMobile(false);
      }
    }
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", key);
    };
  }, []);
  if (!preview && (loading || (!session && isConfigured())))
    return (
      <main className="center-page">
        <div className="loading-dot" />
        <p>Cargando tu espacio…</p>
      </main>
    );
  if (!preview && (!isConfigured() || !profile))
    return (
      <main className="center-page">
        <div className="card access-card">
          <Brand />
          <h1>
            {!isConfigured()
              ? "Conectemos tu espacio"
              : "No pudimos abrir tu espacio"}
          </h1>
          <p>
            {!isConfigured()
              ? "Configura Supabase siguiendo la guía incluida en el proyecto."
              : error || "Tu perfil no está disponible."}
          </p>
          <div className="actions">
            <Link className="button primary" href="/login">
              Volver al acceso
            </Link>
            {session && (
              <button className="button" onClick={() => void refresh()}>
                Reintentar
              </button>
            )}
          </div>
          {session && (
            <button
              className="text-button"
              onClick={() =>
                void logout().catch((e) => setLogoutError(e.message))
              }
            >
              Cerrar sesión
            </button>
          )}
          {logoutError && <p role="alert">{logoutError}</p>}
        </div>
      </main>
    );
  const admin = preview || profile?.role === "administrador";
  const name = preview ? "Vista previa" : profile!.full_name;
  const initials = preview
    ? "AY"
    : name
        .split(" ")
        .filter(Boolean)
        .slice(0, 2)
        .map((x) => x[0])
        .join("");
  const role = preview ? "Sin sesión iniciada" : roleLabels[profile!.role];
  const userPage = path.includes("/usuarios");
  const auditPage = path.includes("/actividad");
  const profilePage = path.includes("/perfil");
  const module = modules.find((m) => path.includes("/" + m.slug));
  const title = userPage
    ? "Gestión de usuarios"
    : auditPage
      ? "Registro de actividad"
      : profilePage
        ? "Mi perfil"
        : module?.name || "Inicio";
  const destination = (href: string) => (preview ? "/login" : href);
  return (
    <div className={`app-shell ${collapsed ? "collapsed" : ""}`}>
      <a className="skip-link" href="#main-content">
        Saltar al contenido
      </a>
      {mobile && (
        <button
          className="sidebar-backdrop"
          aria-label="Cerrar navegación"
          onClick={() => setMobile(false)}
        />
      )}
      <aside className={`sidebar ${mobile ? "mobile-open" : ""}`}>
        <Link
          className="sidebar-brand"
          href={preview ? "/vista-previa" : "/app"}
        >
          <Brand />
        </Link>
        <button
          className="mobile-close icon-button"
          aria-label="Cerrar menú"
          onClick={() => setMobile(false)}
        >
          <X />
        </button>
        <div className="workspace-label">
          <span className="workspace-icon">
            <Landmark size={18} />
          </span>
          <div>
            <strong>Mi espacio AYNI</strong>
            <small>Plataforma de gestión</small>
          </div>
        </div>
        <p className="nav-label">PRINCIPAL</p>
        <nav aria-label="Navegación principal">
          <Link
            className={`nav-item ${title === "Inicio" ? "active" : ""}`}
            href={preview ? "/vista-previa" : "/app"}
            title="Inicio"
          >
            <House size={20} />
            <span>Inicio</span>
          </Link>
          <button
            className={`nav-item ${userPage || auditPage || profilePage ? "selected" : ""}`}
            onClick={() => setUsersOpen(!usersOpen)}
            aria-expanded={usersOpen}
            title="Gestión de usuarios"
          >
            <Users size={20} />
            <span>Gestión de usuarios</span>
            <ChevronDown size={15} className={usersOpen ? "rotate" : ""} />
          </button>
          {usersOpen && !collapsed && (
            <div className="subnav">
              {admin && (
                <Link
                  className={userPage ? "current" : ""}
                  href={destination("/app/usuarios")}
                >
                  Listado de usuarios
                </Link>
              )}
              <Link
                className={profilePage ? "current" : ""}
                href={destination("/app/perfil")}
              >
                Mi perfil
              </Link>
              {admin && (
                <Link
                  className={auditPage ? "current" : ""}
                  href={destination("/app/actividad")}
                >
                  Registro de actividad
                </Link>
              )}
            </div>
          )}
          <p className="nav-label">MÓDULOS</p>
          {modules.map((m) => (
            <Link
              key={m.slug}
              className={`nav-item ${module?.slug === m.slug ? "active" : ""}`}
              href={destination("/app/" + m.slug)}
              title={m.name}
            >
              <m.icon size={20} />
              <span>{m.name}</span>
              <ChevronRight size={14} />
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="phase-note">
            <span className="phase-icon">
              <ShieldCheck size={21} />
            </span>
            <div>
              <strong>Tu espacio seguro</strong>
              <small>El acceso depende de tu rol.</small>
            </div>
          </div>
          <button
            className="collapse-control"
            onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? "Expandir menú" : "Contraer menú"}
          >
            {collapsed ? (
              <PanelLeftOpen size={20} />
            ) : (
              <>
                <PanelLeftClose size={20} />
                <span>Contraer menú</span>
              </>
            )}
          </button>
        </div>
      </aside>
      <div className="app-body">
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="mobile-toggle icon-button"
              onClick={() => setMobile(true)}
              aria-label="Abrir menú"
            >
              <Menu />
            </button>
            <span className="topbar-location">Mi espacio</span>
            <ChevronRight size={14} />
            <strong>{title}</strong>
          </div>
          <div className="topbar-right">
            <Link
              className="landing-link"
              href="https://qipuy-web.vercel.app/"
              target="_blank"
              rel="noreferrer"
            >
              Ir a AYNI <ArrowUpRight size={15} />
            </Link>
            <span className="header-divider" />
            <div
              ref={dropdown}
              className="profile-dropdown"
              onMouseEnter={() => setOpen(true)}
              onMouseLeave={() => setOpen(false)}
            >
              <button
                className="profile-trigger"
                aria-expanded={open}
                aria-controls="profile-menu"
                onClick={() => setOpen(!open)}
              >
                <span className="avatar">{initials}</span>
                <span className="profile-name">
                  <strong>{name}</strong>
                  <small>{role}</small>
                </span>
                <ChevronDown size={16} />
              </button>
              {open && (
                <div className="profile-menu" id="profile-menu">
                  <p>MI CUENTA</p>
                  <Link href={destination("/app/perfil")}>
                    <UserRound size={17} />
                    Mi perfil
                  </Link>
                  <Link href={destination("/app/perfil#seguridad")}>
                    <ShieldCheck size={17} />
                    Seguridad
                  </Link>
                  <div className="menu-rule" />
                  {preview ? (
                    <Link href="/login">
                      <LogOut size={17} />
                      Iniciar sesión
                    </Link>
                  ) : (
                    <button
                      className="danger-text"
                      onClick={() =>
                        void logout().catch((e) => setLogoutError(e.message))
                      }
                    >
                      <LogOut size={17} />
                      Cerrar sesión
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </header>
        {preview && (
          <div className="preview-banner">
            Vista previa del diseño · Sin sesión ni datos reales.{" "}
            <Link href="/login">Ir al acceso</Link>
          </div>
        )}
        {logoutError && (
          <div className="error-message" role="alert">
            {logoutError}
          </div>
        )}
        <main id="main-content" className="workspace-main">
          {children}
        </main>
        <footer className="app-footer">
          <span>AYNI © {new Date().getFullYear()} · Juntos, paso a paso.</span>
          <span>
            <Clock3 size={13} /> Primera etapa · Gestión de usuarios
          </span>
        </footer>
      </div>
    </div>
  );
}
