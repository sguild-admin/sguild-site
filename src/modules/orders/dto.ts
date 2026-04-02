import type { BillingAction } from "@/lib/types/billing";

export type OrderBillingWritebackAction = "Write Result" | "Skip Writeback";

export type OrderBillingReconciliationStatus =
  | "Not Started"
  | "In Progress"
  | "Complete"
  | "External Failed"
  | "Writeback Failed"
  | "Writeback Failed After External Success"
  | "Needs Review";

export type OrderBillingWritebackStatus = "Succeeded" | "Failed" | "Skipped";
export type BillingProcessResult = "processed" | "noop";

export type SkippedDuplicateInvoiceCancellation = {
  externalInvoiceId: string;
  reason: string;
};

export type BillingProcessExternalIds = {
  externalPaymentId?: string | null;
  externalOrderId?: string | null;
  externalInvoiceId?: string | null;
};

export type BillingProcessMetadata = {
  externalAction?: BillingAction;
  writebackStatus?: OrderBillingWritebackStatus;
  reconciliationStatus?: OrderBillingReconciliationStatus;
  resolvedInvoiceRecordId?: string | null;
  invoiceId?: string | null;
  orderId?: string | null;
  invoiceExternalRecordId?: string | null;
  externalStatus?: string | null;
  amountDue?: number | null;
  amountPaid?: number | null;
  issuedAt?: string | null;
  dueAt?: string | null;
  hostedInvoiceUrl?: string | null;
  wasExistingMappingReused?: boolean;
  rawPayload?: string | null;
  canceledDuplicateExternalInvoiceIds?: string[];
  skippedDuplicateInvoiceCancellations?: SkippedDuplicateInvoiceCancellation[];
};

export type OrderBillingRequest = {
  orderRecordId: string;
  orderExternalRecordId: string;
  orgIntegrationRecordId: string;
  invoiceRecordId?: string;
  externalInvoiceId?: string;
  writebackAction?: OrderBillingWritebackAction;
  action: BillingAction;
};

export type BillingProcessSuccessResponse = {
  ok: true;
  syncStatus: "Synced";
  action: BillingAction;
  externalAction?: BillingAction;
  writebackStatus?: OrderBillingWritebackStatus;
  reconciliationStatus?: OrderBillingReconciliationStatus;
  result: BillingProcessResult;
  resolvedInvoiceRecordId?: string;
  invoiceId?: string;
  orderId?: string;
  invoiceExternalRecordId?: string;
  externalPaymentId?: string;
  externalOrderId?: string;
  externalInvoiceId?: string;
  externalStatus?: string;
  amountDue?: number;
  amountPaid?: number;
  issuedAt?: string;
  dueAt?: string;
  hostedInvoiceUrl?: string;
  wasExistingMappingReused?: boolean;
  rawPayload?: string;
  canceledDuplicateExternalInvoiceIds?: string[];
  skippedDuplicateInvoiceCancellations?: SkippedDuplicateInvoiceCancellation[];
};

export type BillingProcessErrorResponse = {
  ok: false;
  error: string;
  stack?: string | null;
};

export type BillingProcessResponse = BillingProcessSuccessResponse | BillingProcessErrorResponse;
