"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  Building2,
  Package,
  Pencil,
  Plus,
  RefreshCw,
  Store,
  UserPlus,
} from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { Modal } from "@/components/modal";
import { api } from "@/lib/supabase-browser";
import {
  formatMinor,
  toMinorUnits,
  type Organization,
  type OrgMemberRole,
  type Product,
} from "@/lib/types";

type MemberRow = {
  id: string;
  organization_id: string;
  profile_id: string;
  member_role: OrgMemberRole;
  status: "activa" | "inactiva";
  created_at: string;
};

type AssignableUser = {
  id: string;
  full_name: string;
  email: string;
  role: string;
};

export default function ComerciosPage() {
  const { profile, refresh } = useAuth();
  const [tab, setTab] = useState<"orgs" | "catalog">("orgs");
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [assignableUsers, setAssignableUsers] = useState<AssignableUser[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");

  const [orgModal, setOrgModal] = useState<Organization | "new" | null>(null);
  const [memberModalOrg, setMemberModalOrg] = useState<Organization | null>(null);
  const [prodModal, setProdModal] = useState<Product | "new" | null>(null);

  const isAdmin = profile?.role === "administrador";
  const isMerchant = profile?.role === "comercio";
  const myMerchantOrg = profile?.memberships?.find(
    (m) => m.organization?.org_type === "comercio",
  )?.organization;

  useEffect(() => {
    if (isMerchant) setTab("catalog");
  }, [isMerchant]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [orgRes, prodRes] = await Promise.all([
        api<{
          organizations: Organization[];
          members: MemberRow[];
          assignableUsers: AssignableUser[];
        }>("/api/organizations"),
        api<{ products: Product[] }>("/api/products"),
      ]);
      setOrganizations(orgRes.organizations);
      setMembers(orgRes.members);
      setAssignableUsers(orgRes.assignableUsers);
      setProducts(prodRes.products);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar los datos.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (profile) void load();
  }, [profile, load]);

  if (!profile) return null;

  async function saveOrg(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setFormError("");
    const f = new FormData(e.currentTarget);
    try {
      const editing = orgModal && orgModal !== "new" ? orgModal : null;
      await api("/api/organizations", {
        method: "POST",
        body: JSON.stringify({
          id: editing?.id ?? null,
          org_type: editing ? editing.org_type : String(f.get("org_type")),
          name: String(f.get("name") || ""),
          tax_id: String(f.get("tax_id") || ""),
          contact_email: String(f.get("contact_email") || ""),
          contact_phone: String(f.get("contact_phone") || ""),
          status: String(f.get("status") || "activa"),
          is_demo: f.get("is_demo") === "on",
        }),
      });
      setOrgModal(null);
      setNotice(
        editing
          ? "Organización actualizada correctamente."
          : "Organización creada. Ahora puedes asignarle miembros.",
      );
      await load();
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "No se pudo guardar.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function saveMember(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!memberModalOrg) return;
    setBusy(true);
    setFormError("");
    const f = new FormData(e.currentTarget);
    try {
      await api("/api/organizations", {
        method: "PUT",
        body: JSON.stringify({
          organization_id: memberModalOrg.id,
          profile_id: String(f.get("profile_id")),
          member_role: String(f.get("member_role") || "operador"),
          status: String(f.get("status") || "activa"),
        }),
      });
      setMemberModalOrg(null);
      setNotice("Membresía organizacional actualizada correctamente.");
      await load();
      await refresh();
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "No se pudo asignar el miembro.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function saveProduct(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setFormError("");
    const f = new FormData(e.currentTarget);
    try {
      const priceVal = Number(f.get("price_bob"));
      if (!Number.isFinite(priceVal) || priceVal <= 0) {
        throw new Error("Ingresa un precio válido mayor a cero.");
      }
      const stockVal = Number(f.get("stock"));
      if (!Number.isInteger(stockVal) || stockVal < 0) {
        throw new Error("El stock debe ser un número entero mayor o igual a 0.");
      }

      const editing = prodModal && prodModal !== "new" ? prodModal : null;
      if (editing) {
        await api("/api/products", {
          method: "PATCH",
          body: JSON.stringify({
            id: editing.id,
            name: String(f.get("name") || ""),
            description: String(f.get("description") || ""),
            category: String(f.get("category") || "General"),
            price_minor: toMinorUnits(priceVal),
            stock: stockVal,
            is_available: f.get("is_available") === "on",
          }),
        });
        setNotice(
          "Producto actualizado. Las órdenes previas conservan el precio histórico.",
        );
      } else {
        if (!myMerchantOrg) {
          throw new Error("Tu cuenta no tiene un comercio activo asignado.");
        }
        await api("/api/products", {
          method: "POST",
          body: JSON.stringify({
            merchant_org_id: myMerchantOrg.id,
            name: String(f.get("name") || ""),
            description: String(f.get("description") || ""),
            category: String(f.get("category") || "General"),
            price_minor: toMinorUnits(priceVal),
            currency: "BOB",
            stock: stockVal,
            is_available: f.get("is_available") === "on",
          }),
        });
        setNotice("Producto publicado en tu catálogo.");
      }
      setProdModal(null);
      await load();
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "No se pudo guardar el producto.",
      );
    } finally {
      setBusy(false);
    }
  }

  const userById = new Map(assignableUsers.map((u) => [u.id, u]));
  const myProducts = isMerchant && myMerchantOrg
    ? products.filter((p) => p.merchant_org_id === myMerchantOrg.id)
    : products;

  return (
    <div className="section-stack">
      <div className="page-heading">
        <div>
          <span className="section-kicker">ORGANIZACIONES Y CATÁLOGO</span>
          <h1>Comercios, entidades y productos</h1>
          <p>
            Aislamiento organizacional de comercios y bancos aliados, con
            catálogo publicado por cada comercio.
          </p>
        </div>
        <div className="inline-actions">
          {isAdmin && (
            <button
              className="button primary"
              onClick={() => {
                setFormError("");
                setOrgModal("new");
              }}
            >
              <Plus size={18} /> Nueva organización
            </button>
          )}
          {isMerchant && myMerchantOrg && (
            <button
              className="button primary"
              onClick={() => {
                setFormError("");
                setProdModal("new");
              }}
            >
              <Plus size={18} /> Publicar producto
            </button>
          )}
          {profile.role === "cliente" && (
            <Link className="button primary" href="/app/compras">
              Crear orden de compra
            </Link>
          )}
        </div>
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
          className={`tab-btn ${tab === "orgs" ? "active" : ""}`}
          onClick={() => setTab("orgs")}
        >
          <Building2 size={16} /> Organizaciones ({organizations.length})
        </button>
        <button
          className={`tab-btn ${tab === "catalog" ? "active" : ""}`}
          onClick={() => setTab("catalog")}
        >
          <Package size={16} /> Catálogo de productos ({myProducts.length})
        </button>
      </div>

      {tab === "orgs" ? (
        <section className="users-card">
          <div className="users-card-header">
            <div>
              <Store size={20} />
              <h2>Comercios y entidades financieras</h2>
              <span className="count-badge">{organizations.length}</span>
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
          {loading ? (
            <div className="empty-state">Cargando organizaciones…</div>
          ) : organizations.length === 0 ? (
            <div className="empty-state">
              <Building2 size={32} />
              <h3>Sin organizaciones registradas</h3>
              <p>
                {isAdmin
                  ? "Crea el primer comercio y el banco simulado para operar el flujo completo."
                  : "Todavía no hay organizaciones activas disponibles."}
              </p>
            </div>
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Organización</th>
                    <th>Tipo</th>
                    <th>Estado</th>
                    <th>Miembros asignados</th>
                    {isAdmin && <th className="right">Acciones</th>}
                  </tr>
                </thead>
                <tbody>
                  {organizations.map((org) => {
                    const orgMembers = members.filter(
                      (m) => m.organization_id === org.id,
                    );
                    return (
                      <tr key={org.id}>
                        <td>
                          <strong>{org.name}</strong>
                          <div>
                            <small className="muted-text">
                              {org.tax_id ? `NIT/ID: ${org.tax_id} · ` : ""}
                              {org.contact_email || "Sin correo"}
                              {org.is_demo ? " · Simulación demo" : ""}
                            </small>
                          </div>
                        </td>
                        <td>
                          <span
                            className={`pill-badge ${org.org_type === "entidad_financiera" ? "blue" : "green"}`}
                          >
                            {org.org_type === "entidad_financiera"
                              ? "Entidad financiera"
                              : "Comercio"}
                          </span>
                        </td>
                        <td>
                          <span
                            className={`pill-badge ${org.status === "activa" ? "green" : "gray"}`}
                          >
                            {org.status}
                          </span>
                        </td>
                        <td>
                          {orgMembers.length === 0 ? (
                            <span className="muted-text">Sin miembros visibles</span>
                          ) : (
                            <div className="inline-actions">
                              {orgMembers.map((m) => {
                                const u = userById.get(m.profile_id);
                                const label =
                                  m.profile_id === profile.id
                                    ? `${profile.full_name} (Tú)`
                                    : u
                                      ? u.full_name
                                      : m.profile_id.slice(0, 8);
                                return (
                                  <span
                                    key={m.id}
                                    className={`pill-badge ${m.status === "activa" ? "gray" : "red"}`}
                                  >
                                    {label} · {m.member_role}
                                  </span>
                                );
                              })}
                            </div>
                          )}
                        </td>
                        {isAdmin && (
                          <td>
                            <div className="table-actions">
                              <button
                                className="icon-button"
                                title="Asignar empleado"
                                onClick={() => {
                                  setFormError("");
                                  setMemberModalOrg(org);
                                }}
                              >
                                <UserPlus size={17} />
                              </button>
                              <button
                                className="icon-button"
                                title="Editar organización"
                                onClick={() => {
                                  setFormError("");
                                  setOrgModal(org);
                                }}
                              >
                                <Pencil size={17} />
                              </button>
                            </div>
                          </td>
                        )}
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
              <Package size={20} />
              <h2>
                {isMerchant
                  ? `Catálogo de ${myMerchantOrg?.name || "mi comercio"}`
                  : "Catálogo de productos disponibles"}
              </h2>
              <span className="count-badge">{myProducts.length}</span>
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
          {loading ? (
            <div className="empty-state">Cargando catálogo…</div>
          ) : myProducts.length === 0 ? (
            <div className="empty-state">
              <Package size={32} />
              <h3>No hay productos publicados</h3>
              <p>
                {isMerchant
                  ? "Publica el primer producto para que los clientes puedan crear órdenes financiadas."
                  : "Los comercios afiliados aún no publicaron productos."}
              </p>
            </div>
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Producto</th>
                    <th>Comercio</th>
                    <th>Categoría</th>
                    <th>Precio</th>
                    <th>Stock</th>
                    <th>Estado</th>
                    {isMerchant && <th className="right">Acciones</th>}
                  </tr>
                </thead>
                <tbody>
                  {myProducts.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <strong>{p.name}</strong>
                        <div>
                          <small className="muted-text">
                            {p.description || "Sin descripción"}
                          </small>
                        </div>
                      </td>
                      <td>{p.merchant_name || "Comercio"}</td>
                      <td>{p.category}</td>
                      <td>
                        <strong>{formatMinor(p.price_minor, p.currency)}</strong>
                      </td>
                      <td>{p.stock}</td>
                      <td>
                        <span
                          className={`pill-badge ${p.is_available && p.stock > 0 ? "green" : "gray"}`}
                        >
                          {p.is_available && p.stock > 0
                            ? "Disponible"
                            : "No disponible"}
                        </span>
                      </td>
                      {isMerchant && (
                        <td>
                          <div className="table-actions">
                            <button
                              className="icon-button"
                              title="Editar producto"
                              onClick={() => {
                                setFormError("");
                                setProdModal(p);
                              }}
                            >
                              <Pencil size={17} />
                            </button>
                          </div>
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

      {orgModal && (
        <Modal
          title={
            orgModal === "new" ? "Nueva organización" : "Editar organización"
          }
          busy={busy}
          onClose={() => setOrgModal(null)}
        >
          <form onSubmit={saveOrg} className="form-stack">
            <label>
              Tipo de organización
              <select
                name="org_type"
                defaultValue={orgModal === "new" ? "comercio" : orgModal.org_type}
                disabled={orgModal !== "new"}
              >
                <option value="comercio">Comercio afiliado</option>
                <option value="entidad_financiera">Entidad financiera</option>
              </select>
            </label>
            <label>
              Razón social / Nombre
              <input
                name="name"
                defaultValue={orgModal === "new" ? "" : orgModal.name}
                required
                minLength={2}
                maxLength={120}
              />
            </label>
            <div className="form-grid">
              <label>
                NIT / Identificador
                <input
                  name="tax_id"
                  defaultValue={orgModal === "new" ? "" : orgModal.tax_id}
                  maxLength={40}
                />
              </label>
              <label>
                Estado
                <select
                  name="status"
                  defaultValue={orgModal === "new" ? "activa" : orgModal.status}
                >
                  <option value="activa">Activa</option>
                  <option value="inactiva">Inactiva</option>
                  <option value="suspendida">Suspendida</option>
                </select>
              </label>
            </div>
            <div className="form-grid">
              <label>
                Correo de contacto
                <input
                  name="contact_email"
                  type="email"
                  defaultValue={
                    orgModal === "new" ? "" : orgModal.contact_email
                  }
                />
              </label>
              <label>
                Teléfono
                <input
                  name="contact_phone"
                  defaultValue={
                    orgModal === "new" ? "" : orgModal.contact_phone
                  }
                />
              </label>
            </div>
            <label style={{ flexDirection: "row", alignItems: "center", gap: "0.5rem" }}>
              <input
                type="checkbox"
                name="is_demo"
                defaultChecked={orgModal === "new" ? true : orgModal.is_demo}
                style={{ width: "auto" }}
              />
              Etiquetar como organización de simulación / demo académica
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
                onClick={() => setOrgModal(null)}
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

      {memberModalOrg && (
        <Modal
          title={`Asignar empleado a ${memberModalOrg.name}`}
          busy={busy}
          onClose={() => setMemberModalOrg(null)}
        >
          <form onSubmit={saveMember} className="form-stack">
            <div className="notice">
              Solo se muestran usuarios activos cuyo rol global coincide con{" "}
              <strong>{memberModalOrg.org_type}</strong>. Cambia primero el rol
              del usuario en <strong>Gestión de usuarios</strong> si no aparece
              aquí.
            </div>
            <label>
              Usuario
              <select name="profile_id" required>
                <option value="">Selecciona un usuario…</option>
                {assignableUsers
                  .filter((u) => u.role === memberModalOrg.org_type)
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.full_name} ({u.email})
                    </option>
                  ))}
              </select>
            </label>
            <div className="form-grid">
              <label>
                Permiso interno
                <select
                  name="member_role"
                  defaultValue={
                    memberModalOrg.org_type === "entidad_financiera"
                      ? "evaluador"
                      : "admin_org"
                  }
                >
                  <option value="admin_org">Admin organización</option>
                  <option value="operador">Operador</option>
                  <option value="evaluador">Evaluador</option>
                  <option value="tesoreria">Tesorería</option>
                </select>
              </label>
              <label>
                Estado membresía
                <select name="status" defaultValue="activa">
                  <option value="activa">Activa</option>
                  <option value="inactiva">Inactiva</option>
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
                onClick={() => setMemberModalOrg(null)}
              >
                Cancelar
              </button>
              <button className="button primary" disabled={busy}>
                {busy ? "Guardando…" : "Guardar membresía"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {prodModal && (
        <Modal
          title={
            prodModal === "new" ? "Publicar producto" : "Editar producto"
          }
          busy={busy}
          onClose={() => setProdModal(null)}
        >
          <form onSubmit={saveProduct} className="form-stack">
            <label>
              Nombre del producto
              <input
                name="name"
                defaultValue={prodModal === "new" ? "" : prodModal.name}
                required
                minLength={2}
                maxLength={140}
              />
            </label>
            <label>
              Descripción
              <input
                name="description"
                defaultValue={prodModal === "new" ? "" : prodModal.description}
                maxLength={1000}
              />
            </label>
            <div className="form-grid">
              <label>
                Categoría
                <input
                  name="category"
                  defaultValue={
                    prodModal === "new" ? "Tecnología" : prodModal.category
                  }
                  required
                />
              </label>
              <label>
                Precio (BOB)
                <input
                  name="price_bob"
                  type="number"
                  step="0.01"
                  min="1"
                  defaultValue={
                    prodModal === "new"
                      ? ""
                      : (prodModal.price_minor / 100).toFixed(2)
                  }
                  required
                />
              </label>
            </div>
            <div className="form-grid">
              <label>
                Stock disponible
                <input
                  name="stock"
                  type="number"
                  min="0"
                  step="1"
                  defaultValue={prodModal === "new" ? 5 : prodModal.stock}
                  required
                />
              </label>
              <label style={{ flexDirection: "row", alignItems: "center", gap: "0.5rem", marginTop: "1.5rem" }}>
                <input
                  type="checkbox"
                  name="is_available"
                  defaultChecked={
                    prodModal === "new" ? true : prodModal.is_available
                  }
                  style={{ width: "auto" }}
                />
                Disponible para la venta
              </label>
            </div>
            <div className="notice">
              Modificar el precio de un producto solo aplica a órdenes nuevas;
              las órdenes ya creadas conservan su precio original.
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
                onClick={() => setProdModal(null)}
              >
                Cancelar
              </button>
              <button className="button primary" disabled={busy}>
                {busy ? "Guardando…" : "Guardar producto"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}