import { z } from "zod";
import { roles } from "./types";

export const passwordSchema = z
  .string()
  .min(10, "Usa al menos 10 caracteres.")
  .max(72, "Usa como máximo 72 caracteres.")
  .regex(/[A-Za-z]/, "Incluye una letra.")
  .regex(/[0-9]/, "Incluye un número.");

export const profileSchema = z.object({
  full_name: z.string().trim().min(3, "Escribe tu nombre completo.").max(100),
  phone: z
    .string()
    .trim()
    .max(20)
    .regex(/^[+0-9 ()-]*$/, "Teléfono inválido."),
});

export const createUserSchema = profileSchema.extend({
  email: z.email("Correo inválido.").max(254),
  password: passwordSchema,
});

export const updateUserSchema = profileSchema.extend({
  role: z.enum(roles),
  status: z.enum(["activo", "inactivo"]),
});

export const upsertOrganizationSchema = z.object({
  id: z.uuid().nullable().optional(),
  org_type: z.enum(["comercio", "entidad_financiera"]),
  name: z.string().trim().min(2, "Nombre mínimo de 2 caracteres.").max(120),
  tax_id: z.string().trim().max(40).default(""),
  contact_email: z.string().trim().max(254).default(""),
  contact_phone: z.string().trim().max(25).default(""),
  status: z.enum(["activa", "inactiva", "suspendida"]).default("activa"),
  is_demo: z.boolean().default(true),
});

export const assignOrgMemberSchema = z.object({
  organization_id: z.uuid(),
  profile_id: z.uuid(),
  member_role: z.enum(["admin_org", "operador", "evaluador", "tesoreria"]).default("operador"),
  status: z.enum(["activa", "inactiva"]).default("activa"),
});

export const createProductSchema = z.object({
  merchant_org_id: z.uuid(),
  name: z.string().trim().min(2, "Escribe el nombre del producto.").max(140),
  description: z.string().trim().max(1000).default(""),
  category: z.string().trim().min(2).max(60).default("General"),
  price_minor: z.number().int().positive("El precio debe ser mayor a cero."),
  currency: z.string().regex(/^[A-Z]{3}$/).default("BOB"),
  stock: z.number().int().min(0, "El stock no puede ser negativo."),
  is_available: z.boolean().default(true),
});

export const updateProductSchema = createProductSchema
  .omit({ merchant_org_id: true, currency: true })
  .partial()
  .extend({ id: z.uuid() });

export const createOrderSchema = z.object({
  merchant_org_id: z.uuid(),
  items: z
    .array(
      z.object({
        product_id: z.uuid(),
        quantity: z.number().int().min(1).max(100),
      }),
    )
    .min(1, "Agrega al menos un producto."),
});

export const updateOrderStatusSchema = z.object({
  order_id: z.uuid(),
  status: z.enum([
    "pendiente_entrega",
    "entregada",
    "cancelada",
    "devolucion_en_proceso",
    "devuelta",
  ]),
  note: z.string().trim().max(500).default(""),
});

export const submitApplicationSchema = z.object({
  order_id: z.uuid(),
  bank_org_id: z.uuid(),
  requested_installments: z.number().int().min(1).max(60),
  client_notes: z.string().trim().max(1000).default(""),
  consent_accepted: z.literal(true, {
    error: "Debes autorizar el envío de datos a la entidad financiera seleccionada.",
  }),
});

export const bankReviewSchema = z.object({
  action: z.enum(["en_revision_bancaria", "requiere_informacion", "rechazada", "emitir_oferta"]),
  reason: z.string().trim().max(1000).default(""),
  offer: z
    .object({
      principal_minor: z.number().int().positive(),
      total_payable_minor: z.number().int().positive(),
      installment_count: z.number().int().min(1).max(60),
      installment_amount_minor: z.number().int().positive(),
      annual_rate_bps: z.number().int().min(0).max(10000).default(0),
      conditions_text: z.string().trim().max(1500).default(""),
      expires_days: z.number().int().min(1).max(60).default(7),
      is_demo: z.boolean().default(true),
    })
    .nullable()
    .optional(),
});

export const respondOfferSchema = z.object({
  accept: z.boolean(),
  acceptance_note: z.string().trim().max(500).default(""),
});

export const formalizeCreditSchema = z.object({
  action: z.literal("formalize"),
  credit_id: z.uuid(),
  external_credit_ref: z.string().trim().min(3, "Referencia bancaria obligatoria.").max(80),
});

export const disburseCreditSchema = z.object({
  action: z.literal("disburse"),
  credit_id: z.uuid(),
  external_event_id: z.string().trim().min(3, "ID externo de desembolso obligatorio.").max(80),
  amount_minor: z.number().int().positive(),
  recipient_type: z.enum(["comercio", "cliente", "acordado"]).default("comercio"),
  disbursed_at: z.string().optional(),
});

export const publishScheduleSchema = z.object({
  action: z.literal("publish_schedule"),
  credit_id: z.uuid(),
  source_label: z.string().trim().min(3).max(120).default("Cronograma bancario (simulación demo)"),
  installments: z
    .array(
      z.object({
        installment_number: z.number().int().min(1),
        due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha YYYY-MM-DD requerida."),
        amount_minor: z.number().int().positive(),
        status: z
          .enum(["pendiente", "parcial", "pagada", "atrasada", "pendiente_informacion"])
          .optional(),
      }),
    )
    .min(1),
});

export const paymentReportSchema = z.object({
  action: z.literal("report"),
  credit_id: z.uuid(),
  installment_id: z.uuid().nullable().optional(),
  reported_amount_minor: z.number().int().positive(),
  payment_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reference_code: z.string().trim().max(80).default(""),
  notes: z.string().trim().max(500).default(""),
});

export const bankConfirmPaymentSchema = z.object({
  action: z.literal("confirm_payment"),
  credit_id: z.uuid(),
  external_event_id: z.string().trim().min(3).max(80),
  amount_minor: z.number().int().positive(),
  operation_date: z.string().optional(),
  allocations: z
    .array(
      z.object({
        installment_id: z.uuid(),
        amount_minor: z.number().int().positive(),
      }),
    )
    .min(1),
  linked_report_id: z.uuid().nullable().optional(),
  notes: z.string().trim().max(500).default(""),
});

export const bankReversePaymentSchema = z.object({
  action: z.literal("reverse_payment"),
  original_confirmation_id: z.uuid(),
  external_event_id: z.string().trim().min(3).max(80),
  reason: z.string().trim().min(3).max(500),
});

export const bankReviewReportSchema = z.object({
  action: z.literal("review_report"),
  report_id: z.uuid(),
  status: z.enum(["observado", "rechazado"]),
  review_notes: z.string().trim().max(500).default(""),
});

export const manageConsentSchema = z.object({
  target_org_id: z.uuid(),
  purpose: z.enum(["evaluacion_solicitud", "consulta_cumplimiento_nueva_oportunidad"]),
  days_valid: z.number().int().min(1).max(180).default(30),
  revoke_consent_id: z.uuid().nullable().optional(),
});

export const createCommissionAgreementSchema = z.object({
  organization_id: z.uuid(),
  version_label: z.string().trim().min(2).max(40).default("v1-demo"),
  calc_type: z.enum(["fija", "porcentaje"]),
  fixed_minor: z.number().int().min(0).default(0),
  rate_bps: z.number().int().min(0).max(5000).default(200),
  service_description: z.string().trim().min(5).max(300),
  is_demo: z.boolean().default(true),
});

export const updateCommissionEntrySchema = z.object({
  entry_id: z.uuid(),
  status: z.enum(["liquidada", "anulada"]),
  settlement_ref: z.string().trim().max(80).default(""),
  notes: z.string().trim().max(500).default(""),
});

export const createSupportCaseSchema = z.object({
  organization_id: z.uuid().nullable().optional(),
  related_credit_id: z.uuid().nullable().optional(),
  related_order_id: z.uuid().nullable().optional(),
  category: z.enum(["tecnico", "entrega_comercial", "credito_pagos", "datos_consentimiento"]),
  subject: z.string().trim().min(3).max(140),
  description: z.string().trim().min(5).max(1500),
});

export const updateSupportCaseSchema = z.object({
  id: z.uuid(),
  status: z.enum(["abierto", "en_proceso", "resuelto", "cerrado"]),
  resolution_notes: z.string().trim().max(1000).default(""),
});