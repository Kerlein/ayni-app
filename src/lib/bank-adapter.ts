import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { dbError } from "./server";

export interface BankProviderAdapter {
  readonly mode: "simulado" | "real";
  reviewApplication(
    db: SupabaseClient,
    params: {
      applicationId: string;
      action: "en_revision_bancaria" | "requiere_informacion" | "rechazada" | "emitir_oferta";
      reason: string;
      offer?: {
        principal_minor: number;
        total_payable_minor: number;
        installment_count: number;
        installment_amount_minor: number;
        annual_rate_bps: number;
        conditions_text: string;
        expires_at: string;
        is_demo: boolean;
      } | null;
    },
  ): Promise<unknown>;
  formalizeCredit(
    db: SupabaseClient,
    params: { creditId: string; externalCreditRef: string },
  ): Promise<void>;
  confirmDisbursement(
    db: SupabaseClient,
    params: {
      creditId: string;
      externalEventId: string;
      amountMinor: number;
      recipientType: "comercio" | "cliente" | "acordado";
      disbursedAt: string;
    },
  ): Promise<unknown>;
  publishSchedule(
    db: SupabaseClient,
    params: {
      creditId: string;
      sourceLabel: string;
      installments: Array<{
        installment_number: number;
        due_date: string;
        amount_minor: number;
        status?: string;
      }>;
    },
  ): Promise<string>;
  confirmPayment(
    db: SupabaseClient,
    params: {
      creditId: string;
      externalEventId: string;
      amountMinor: number;
      operationDate: string;
      allocations: Array<{ installment_id: string; amount_minor: number }>;
      linkedReportId: string | null;
      notes: string;
    },
  ): Promise<unknown>;
  reversePayment(
    db: SupabaseClient,
    params: {
      originalConfirmationId: string;
      externalEventId: string;
      reason: string;
    },
  ): Promise<unknown>;
  reviewPaymentReport(
    db: SupabaseClient,
    params: {
      reportId: string;
      status: "observado" | "rechazado";
      reviewNotes: string;
    },
  ): Promise<void>;
}

export const bankAdapter: BankProviderAdapter = {
  mode: "simulado",

  async reviewApplication(db, p) {
    const { data, error } = await db.rpc("bank_review_application", {
      p_application_id: p.applicationId,
      p_action: p.action,
      p_reason: p.reason,
      p_offer: p.offer ?? null,
    });
    dbError(error);
    return data;
  },

  async formalizeCredit(db, p) {
    const { error } = await db.rpc("bank_formalize_credit", {
      p_credit_id: p.creditId,
      p_external_credit_ref: p.externalCreditRef,
    });
    dbError(error);
  },

  async confirmDisbursement(db, p) {
    const { data, error } = await db.rpc("bank_confirm_disbursement", {
      p_credit_id: p.creditId,
      p_external_event_id: p.externalEventId,
      p_amount_minor: p.amountMinor,
      p_recipient_type: p.recipientType,
      p_disbursed_at: p.disbursedAt,
    });
    dbError(error);
    return data;
  },

  async publishSchedule(db, p) {
    const { data, error } = await db.rpc("bank_publish_schedule", {
      p_credit_id: p.creditId,
      p_source_label: p.sourceLabel,
      p_installments: p.installments,
    });
    dbError(error);
    return data as string;
  },

  async confirmPayment(db, p) {
    const { data, error } = await db.rpc("bank_confirm_payment", {
      p_credit_id: p.creditId,
      p_external_event_id: p.externalEventId,
      p_amount_minor: p.amountMinor,
      p_operation_date: p.operationDate,
      p_allocations: p.allocations,
      p_linked_report_id: p.linkedReportId,
      p_notes: p.notes,
    });
    dbError(error);
    return data;
  },

  async reversePayment(db, p) {
    const { data, error } = await db.rpc("bank_reverse_payment", {
      p_original_confirmation_id: p.originalConfirmationId,
      p_external_event_id: p.externalEventId,
      p_reason: p.reason,
    });
    dbError(error);
    return data;
  },

  async reviewPaymentReport(db, p) {
    const { error } = await db.rpc("bank_review_payment_report", {
      p_report_id: p.reportId,
      p_status: p.status,
      p_review_notes: p.reviewNotes,
    });
    dbError(error);
  },
};  