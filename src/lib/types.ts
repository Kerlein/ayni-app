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

export type OrgType = "comercio" | "entidad_financiera";
export type OrgStatus = "activa" | "inactiva" | "suspendida";
export type OrgMemberRole = "admin_org" | "operador" | "evaluador" | "tesoreria";
export type MembershipStatus = "activa" | "inactiva";

export type Organization = {
  id: string;
  org_type: OrgType;
  name: string;
  tax_id: string;
  contact_email: string;
  contact_phone: string;
  status: OrgStatus;
  is_demo: boolean;
  created_at: string;
  updated_at: string;
};

export type UserMembership = {
  id: string;
  organization_id: string;
  profile_id: string;
  member_role: OrgMemberRole;
  status: MembershipStatus;
  organization?: Pick<Organization, "id" | "name" | "org_type" | "status" | "is_demo"> | null;
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
  memberships?: UserMembership[];
};

export type Audit = {
  id: number;
  actor_id: string | null;
  target_id: string;
  action: string;
  created_at: string;
  details: Record<string, unknown>;
};

export type Product = {
  id: string;
  merchant_org_id: string;
  merchant_name?: string;
  name: string;
  description: string;
  category: string;
  price_minor: number;
  currency: string;
  stock: number;
  is_available: boolean;
  created_at: string;
  updated_at: string;
};

export type OrderStatus =
  | "creada"
  | "pendiente_financiamiento"
  | "financiada"
  | "pendiente_entrega"
  | "entregada"
  | "cancelada"
  | "devolucion_en_proceso"
  | "devuelta";

export type PurchaseOrderItem = {
  id: string;
  order_id: string;
  product_id: string;
  product_name_snapshot: string;
  product_description_snapshot: string;
  unit_price_minor: number;
  quantity: number;
  subtotal_minor: number;
};

export type DisbursementConfirmation = {
  id: string;
  credit_id: string;
  order_id: string;
  bank_org_id: string;
  external_event_id: string;
  amount_minor: number;
  currency: string;
  recipient_type: "comercio" | "cliente" | "acordado";
  disbursed_at: string;
  created_at: string;
};

export type PurchaseOrder = {
  id: string;
  order_code: string;
  client_id: string;
  client_name_snapshot: string;
  merchant_org_id: string;
  merchant_name?: string;
  status: OrderStatus;
  currency: string;
  total_minor: number;
  delivery_notes: string;
  delivered_at: string | null;
  created_at: string;
  updated_at: string;
  items?: PurchaseOrderItem[];
  disbursement?: DisbursementConfirmation | null;
};

export type ApplicationStatus =
  | "borrador"
  | "enviada"
  | "en_revision_bancaria"
  | "requiere_informacion"
  | "rechazada"
  | "oferta_emitida"
  | "cancelada";

export type OfferStatus =
  | "vigente"
  | "aceptada"
  | "rechazada_por_cliente"
  | "vencida"
  | "sustituida";

export type CreditStatus =
  | "pendiente_formalizacion"
  | "formalizado"
  | "desembolsado"
  | "cancelado"
  | "cerrado";

export type InstallmentStatus =
  | "pendiente"
  | "parcial"
  | "pagada"
  | "atrasada"
  | "pendiente_informacion";

export type PaymentReportStatus =
  | "pendiente_verificacion"
  | "vinculado_confirmacion"
  | "observado"
  | "rechazado";

export type FinancingOffer = {
  id: string;
  application_id: string;
  bank_org_id: string;
  version_number: number;
  principal_minor: number;
  total_payable_minor: number;
  currency: string;
  installment_count: number;
  installment_amount_minor: number;
  annual_rate_bps: number;
  conditions_text: string;
  expires_at: string;
  status: OfferStatus;
  is_demo: boolean;
  created_at: string;
};

export type FinancingApplication = {
  id: string;
  application_code: string;
  order_id: string;
  client_id: string;
  client_name_snapshot: string;
  bank_org_id: string;
  bank_name?: string;
  order_code?: string;
  requested_amount_minor: number;
  currency: string;
  requested_installments: number;
  client_notes: string;
  status: ApplicationStatus;
  bank_notes: string;
  submitted_at: string;
  updated_at: string;
  offers?: FinancingOffer[];
};

export type Installment = {
  id: string;
  schedule_version_id: string;
  credit_id: string;
  installment_number: number;
  due_date: string;
  amount_minor: number;
  paid_minor: number;
  currency: string;
  status: InstallmentStatus;
  paid_at: string | null;
  last_confirmed_at: string | null;
};

export type ScheduleVersion = {
  id: string;
  credit_id: string;
  bank_org_id: string;
  version_number: number;
  source_label: string;
  is_current: boolean;
  last_synced_at: string;
  created_at: string;
  installments?: Installment[];
};

export type PaymentReport = {
  id: string;
  credit_id: string;
  installment_id: string | null;
  client_id: string;
  bank_org_id: string;
  reported_amount_minor: number;
  currency: string;
  payment_date: string;
  reference_code: string;
  notes: string;
  status: PaymentReportStatus;
  linked_confirmation_id: string | null;
  review_notes: string;
  reviewed_at: string | null;
  created_at: string;
};

export type BankPaymentConfirmation = {
  id: string;
  credit_id: string;
  bank_org_id: string;
  client_id: string;
  external_event_id: string;
  event_type: "confirmacion" | "reverso";
  reversal_of_id: string | null;
  amount_minor: number;
  currency: string;
  operation_date: string;
  received_at: string;
  source_channel: string;
  notes: string;
};

export type LinkedCredit = {
  id: string;
  application_id: string;
  offer_id: string;
  order_id: string;
  client_id: string;
  bank_org_id: string;
  bank_name?: string;
  order_code?: string;
  client_name?: string;
  external_credit_ref: string | null;
  currency: string;
  principal_minor: number;
  total_payable_minor: number;
  status: CreditStatus;
  formalized_at: string | null;
  disbursed_at: string | null;
  closed_at: string | null;
  is_demo: boolean;
  created_at: string;
  schedules?: ScheduleVersion[];
  reports?: PaymentReport[];
  confirmations?: BankPaymentConfirmation[];
};

export type ComplianceSummary = {
  confirmed_installments: number;
  paid_on_time: number;
  confirmed_delays: number;
  pending_info_installments: number;
  completed_credits: number;
  active_credits: number;
  last_synced_at: string | null;
  disclaimer: string;
};

export type Consent = {
  id: string;
  client_id: string;
  target_org_id: string;
  target_org_name?: string;
  purpose: "evaluacion_solicitud" | "consulta_cumplimiento_nueva_oportunidad";
  data_categories: string[];
  text_version: string;
  status: "vigente" | "revocado" | "vencido";
  granted_at: string;
  expires_at: string;
  revoked_at: string | null;
};

export type CommissionAgreement = {
  id: string;
  organization_id: string;
  organization_name?: string;
  version_label: string;
  service_description: string;
  trigger_event: "desembolso_confirmado";
  calc_type: "fija" | "porcentaje";
  fixed_minor: number;
  rate_bps: number;
  currency: string;
  is_demo: boolean;
  status: "activo" | "inactivo";
  created_at: string;
};

export type CommissionEntry = {
  id: string;
  agreement_id: string;
  organization_id: string;
  organization_name?: string;
  credit_id: string;
  source_disbursement_id: string;
  base_amount_minor: number;
  commission_minor: number;
  currency: string;
  status: "pendiente_condicion" | "devengada" | "anulada" | "liquidada";
  settlement_ref: string;
  notes: string;
  accrued_at: string;
  settled_at: string | null;
};

export type SupportCase = {
  id: string;
  reporter_id: string;
  organization_id: string | null;
  related_credit_id: string | null;
  related_order_id: string | null;
  category: "tecnico" | "entrega_comercial" | "credito_pagos" | "datos_consentimiento";
  subject: string;
  description: string;
  status: "abierto" | "en_proceso" | "resuelto" | "cerrado";
  resolution_notes: string;
  created_at: string;
  updated_at: string;
};

export function formatMinor(minor: number, currency = "BOB"): string {
  const value = (Number(minor || 0) / 100).toFixed(2);
  return `${currency} ${value}`;
}

export function toMinorUnits(amount: number): number {
  return Math.round(amount * 100);
}