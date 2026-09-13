"use client";
import { useCallback, useEffect, useState } from "react";
import {
  Plus,
  Search,
  Pencil,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Users,
  Eye,
  RefreshCw,
} from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { Modal } from "@/components/modal";
import { api } from "@/lib/supabase-browser";
import { roleLabels, roles, type Profile } from "@/lib/types";
type List = { users: Profile[]; total: number; page: number };
export default function UsersPage() {
  const { profile } = useAuth();
  const [data, setData] = useState<List>({ users: [], total: 0, page: 1 });
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [role, setRole] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const [modal, setModal] = useState<
    "create" | "edit" | "delete" | "view" | null
  >(null);
  const [selected, setSelected] = useState<Profile | null>(null);
  const load = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setError("");
      try {
        const result = await api<List>(
          "/api/users?" +
            new URLSearchParams({ q: query, role, status, page: String(page) }),
          { signal },
        );
        if (!signal?.aborted) setData(result);
      } catch (e) {
        if (!signal?.aborted)
          setError(
            e instanceof Error ? e.message : "Error al cargar usuarios.",
          );
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [query, role, status, page],
  );
  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(q);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [q]);
  useEffect(() => {
    if (profile?.role !== "administrador") return;
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load, profile?.role]);
  if (profile?.role !== "administrador")
    return (
      <div className="card">
        <h1>Acceso restringido</h1>
        <p>La gestión de usuarios está disponible para administradores.</p>
      </div>
    );
  function open(kind: typeof modal, user: Profile | null = null) {
    setSelected(user);
    setFormError("");
    setModal(kind);
  }
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setFormError("");
    const f = new FormData(e.currentTarget);
    try {
      if (modal === "delete") {
        await api("/api/users/" + selected!.id, { method: "DELETE" });
        setNotice("Usuario dado de baja. Su historial se conserva.");
      } else {
        const payload =
          modal === "create"
            ? {
                full_name: f.get("full_name"),
                email: f.get("email"),
                phone: f.get("phone"),
                password: f.get("password"),
              }
            : {
                full_name: f.get("full_name"),
                phone: f.get("phone"),
                role: f.get("role") || selected!.role,
                status: f.get("status") || selected!.status,
              };
        await api(
          modal === "create" ? "/api/users" : "/api/users/" + selected!.id,
          {
            method: modal === "create" ? "POST" : "PATCH",
            body: JSON.stringify(payload),
          },
        );
        setNotice(
          modal === "create"
            ? "Cuenta creada como Cliente. Puedes cambiar su rol desde Editar usuario."
            : "Usuario actualizado correctamente.",
        );
      }
      setModal(null);
      if (modal === "delete" && data.users.length === 1 && page > 1)
        setPage(page - 1);
      else await load();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="section-kicker">PERSONAS Y ACCESOS</span>
          <h1>Gestión de usuarios</h1>
          <p>Administra las cuentas, sus roles y su acceso a AYNI.</p>
        </div>
        <button className="button primary" onClick={() => open("create")}>
          <Plus size={18} />
          Nuevo usuario
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
      <section className="users-card">
        <div className="users-card-header">
          <div>
            <Users size={21} />
            <h2>Todos los usuarios</h2>
            <span className="count-badge">{loading ? "…" : data.total}</span>
          </div>
          <button
            className="icon-button"
            title="Actualizar listado"
            onClick={() => void load()}
            disabled={loading}
          >
            <RefreshCw size={18} />
          </button>
        </div>
        <div className="table-filters">
          <div className="search-input">
            <Search size={18} />
            <input
              aria-label="Buscar por nombre"
              placeholder="Buscar por nombre…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <select
            aria-label="Filtrar por rol"
            value={role}
            onChange={(e) => {
              setRole(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Todos los roles</option>
            {roles.map((r) => (
              <option key={r} value={r}>
                {roleLabels[r]}
              </option>
            ))}
          </select>
          <select
            aria-label="Filtrar por estado"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Todos los estados</option>
            <option value="activo">Activo</option>
            <option value="inactivo">Inactivo</option>
          </select>
        </div>
        {error ? (
          <div className="empty-state" role="alert">
            <p>{error}</p>
            <button className="button" onClick={() => void load()}>
              Reintentar
            </button>
          </div>
        ) : loading ? (
          <div className="empty-state" role="status">
            Cargando usuarios…
          </div>
        ) : data.users.length === 0 ? (
          <div className="empty-state">
            <Users size={34} />
            <h3>No encontramos usuarios</h3>
            <p>Cambia los filtros o crea una nueva cuenta.</p>
          </div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Usuario</th>
                  <th>Rol</th>
                  <th>Estado</th>
                  <th>Registro</th>
                  <th className="right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {data.users.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <div className="user-cell">
                        <span className="avatar small">
                          {u.full_name.slice(0, 2).toUpperCase()}
                        </span>
                        <div>
                          <strong>
                            {u.full_name}
                            {u.id === profile.id && (
                              <span className="you-tag">Tú</span>
                            )}
                          </strong>
                          <small>{u.email}</small>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className={`role-badge ${u.role}`}>
                        {roleLabels[u.role]}
                      </span>
                    </td>
                    <td>
                      <span className={`status-badge ${u.status}`}>
                        <span />
                        {u.status === "activo" ? "Activo" : "Inactivo"}
                      </span>
                    </td>
                    <td className="date-cell">
                      {new Date(u.created_at).toLocaleDateString("es-BO")}
                    </td>
                    <td>
                      <div className="table-actions">
                        <button
                          className="icon-button"
                          aria-label={"Ver " + u.full_name}
                          title="Ver detalle"
                          onClick={() => open("view", u)}
                        >
                          <Eye size={17} />
                        </button>
                        <button
                          className="icon-button"
                          aria-label={"Editar " + u.full_name}
                          title="Editar usuario y rol"
                          onClick={() => open("edit", u)}
                        >
                          <Pencil size={17} />
                        </button>
                        <button
                          className="icon-button danger-text"
                          aria-label={"Dar de baja a " + u.full_name}
                          title="Dar de baja"
                          disabled={u.id === profile.id}
                          onClick={() => open("delete", u)}
                        >
                          <Trash2 size={17} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="table-pagination">
          <span>
            {data.total} resultado{data.total === 1 ? "" : "s"} · Página {page}{" "}
            de {Math.max(1, Math.ceil(data.total / 10))}
          </span>
          <div>
            <button
              className="icon-button"
              disabled={page <= 1 || loading}
              aria-label="Página anterior"
              onClick={() => setPage(page - 1)}
            >
              <ChevronLeft size={18} />
            </button>
            <button
              className="icon-button"
              disabled={page * 10 >= data.total || loading}
              aria-label="Página siguiente"
              onClick={() => setPage(page + 1)}
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      </section>
      <p className="permission-note">
        Los registros nuevos comienzan como Clientes. Solo los administradores
        pueden asignar otro rol.
      </p>
      {modal && (
        <Modal
          title={
            modal === "create"
              ? "Crear usuario"
              : modal === "edit"
                ? "Editar usuario"
                : modal === "view"
                  ? "Detalle del usuario"
                  : "Dar de baja al usuario"
          }
          busy={busy}
          onClose={() => setModal(null)}
        >
          {modal === "view" ? (
            <>
              <dl className="detail-list">
                <dt>Nombre</dt>
                <dd>{selected!.full_name}</dd>
                <dt>Correo</dt>
                <dd>{selected!.email}</dd>
                <dt>Teléfono</dt>
                <dd>{selected!.phone || "No registrado"}</dd>
                <dt>Rol</dt>
                <dd>{roleLabels[selected!.role]}</dd>
                <dt>Estado</dt>
                <dd>{selected!.status}</dd>
                <dt>Identificador</dt>
                <dd className="mono">{selected!.id}</dd>
              </dl>
              <button className="button" onClick={() => setModal(null)}>
                Cerrar
              </button>
            </>
          ) : (
            <form onSubmit={save} className="form-stack">
              {modal === "delete" ? (
                <p>
                  ¿Dar de baja a <strong>{selected!.full_name}</strong>? Perderá
                  el acceso a la aplicación. Se conservarán sus datos y el
                  historial de actividad.
                </p>
              ) : (
                <>
                  <label>
                    Nombre completo
                    <input
                      name="full_name"
                      defaultValue={selected?.full_name}
                      required
                      minLength={3}
                      maxLength={100}
                    />
                  </label>
                  {modal === "create" ? (
                    <label>
                      Correo electrónico
                      <input
                        name="email"
                        type="email"
                        required
                        maxLength={254}
                      />
                    </label>
                  ) : (
                    <label>
                      Correo electrónico
                      <input value={selected!.email} readOnly />
                      <small className="field-hint">
                        El correo de acceso se conserva.
                      </small>
                    </label>
                  )}
                  <label>
                    Teléfono
                    <input
                      name="phone"
                      defaultValue={selected?.phone || ""}
                      maxLength={20}
                    />
                  </label>
                  {modal === "create" ? (
                    <>
                      <label>
                        Contraseña inicial
                        <input
                          name="password"
                          type="password"
                          required
                          minLength={10}
                          maxLength={72}
                          autoComplete="new-password"
                        />
                        <small className="field-hint">
                          10 a 72 caracteres, con letras y números.
                        </small>
                      </label>
                      <div className="notice">
                        La cuenta se crea como Cliente y con correo confirmado
                        por el administrador. Su titular podrá cambiar la
                        contraseña desde Seguridad.
                      </div>
                    </>
                  ) : (
                    <div className="form-grid">
                      <label>
                        Rol
                        <select
                          name="role"
                          defaultValue={selected!.role}
                          disabled={selected!.id === profile.id}
                        >
                          {roles.map((r) => (
                            <option key={r} value={r}>
                              {roleLabels[r]}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Estado
                        <select
                          name="status"
                          defaultValue={selected!.status}
                          disabled={selected!.id === profile.id}
                        >
                          <option value="activo">Activo</option>
                          <option value="inactivo">Inactivo</option>
                        </select>
                      </label>
                    </div>
                  )}
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
                  onClick={() => setModal(null)}
                >
                  Cancelar
                </button>
                <button
                  className={`button ${modal === "delete" ? "danger" : "primary"}`}
                  disabled={busy}
                >
                  {busy
                    ? "Guardando…"
                    : modal === "delete"
                      ? "Confirmar baja"
                      : modal === "create"
                        ? "Crear usuario"
                        : "Guardar cambios"}
                </button>
              </div>
            </form>
          )}
        </Modal>
      )}
    </>
  );
}
