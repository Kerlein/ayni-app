export const roles = [
  "cliente",
  "comercio",
  "administrador",
  "entidad_financiera",
] as const;
export type Role = (typeof roles)[number];
export const roleLabels: Record<Role, string> = {
  cliente: "Cliente",
  comercio: "Comercio",
  administrador: "Administrador",
  entidad_financiera: "Entidad financiera",
};
export type Profile = {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  role: Role;
  status: "activo" | "inactivo" | "eliminado";
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};
export type Audit = {
  id: number;
  actor_id: string | null;
  target_id: string;
  action: string;
  created_at: string;
  details: Record<string, unknown>;
};
