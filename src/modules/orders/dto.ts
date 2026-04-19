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

export type ResolvePromotionRedemptionsRequest = {
  recordId: string;
  force: boolean;
  idempotencyKey?: string;
};

export type ResolvePromotionRedemptionsResponse = {
  result: "success";
  appliedCount: number;
  skippedCount: number;
};

export type OpenOrderRequest = {
  recordId: string;
  force: boolean;
  idempotencyKey?: string;
};

export type OpenOrderResponse = {
  result: "success";
  activatedItemCount: number;
  skippedItemCount: number;
};

export type SendInvoiceRequest = {
  recordId: string;
  force: boolean;
  retryExternalActionId?: string;
  idempotencyKey?: string;
  externalActionAttemptNumber?: number;
};

export type ApplyInvoicePaymentEventInput = {
  provider?: string;
  providerEventId?: string;
  providerEventType?: string;
  externalInvoiceId?: string;
  externalPaymentId?: string;
  amountPaidCents?: number;
  paidAt?: string;
  rawPayload?: string;
};

export type GrantCreditsRequest = {
  recordId: string;
  force?: boolean;
  idempotencyKey?: string;
};

export type GrantCreditsItemResult = {
  orderItemId: string;
  result: "granted" | "already_granted" | "skipped_zero_credits";
  ledgerEntryId?: string;
  existingLedgerEntryId?: string;
  deltaCredits?: number;
};

export type GrantCreditsSummary = {
  eligible: number;
  granted: number;
  alreadyGranted: number;
  skippedZeroCredits: number;
  totalCreditsGranted: number;
};

export type GrantCreditsSuccessResponse = {
  ok: true;
  endpoint: "/orders/grant-credits";
  recordId: string;
  result: "succeeded" | "noop" | "partial";
  creditAccountId: string;
  summary: GrantCreditsSummary;
  items: GrantCreditsItemResult[];
};

export type GrantCreditsFailureResponse = {
  ok: false;
  endpoint: "/orders/grant-credits";
  recordId: string;
  stage: "validation" | "execution" | "ambiguity";
  error: string;
};

export type GrantCreditsResponse = GrantCreditsSuccessResponse | GrantCreditsFailureResponse;

export type ApplyInvoicePaymentRequest = {
  recordId: string;
  force: boolean;
  idempotencyKey?: string;
  providerEvent?: ApplyInvoicePaymentEventInput;
};

export type SendInvoiceSuccessResponse = {
  ok: true;
  endpoint: "/api/orders/send-invoice";
  recordId: string;
  crossedProviderBoundary: true;
  providerResult: "succeeded" | "noop" | "ignored";
  externalActionId: string;
  writebackStatus: "Succeeded" | "Failed" | "Pending";
  idempotencyKey: string;
};

export type SendInvoiceFailureResponse = {
  ok: false;
  endpoint: "/api/orders/send-invoice";
  recordId: string;
  crossedProviderBoundary: boolean;
  stage: "validation" | "provider" | "writeback" | "ambiguity";
  error: string;
  externalActionId?: string;
};

export type ApplyInvoicePaymentSuccessResponse = {
  ok: true;
  endpoint: "/api/orders/apply-invoice-payment";
  recordId: string;
  crossedProviderBoundary: true;
  providerResult: "succeeded" | "noop";
  externalActionId: string;
  writebackStatus: "Succeeded" | "Failed" | "Pending";
  idempotencyKey: string;
};

export type ApplyInvoicePaymentFailureResponse = {
  ok: false;
  endpoint: "/api/orders/apply-invoice-payment";
  recordId: string;
  crossedProviderBoundary: false;
  stage: "validation" | "ambiguity" | "writeback";
  error: string;
  externalActionId?: string;
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

export type ApplyRefundToOrderRequest = {
  recordId: string;
};

export type ApplyRefundToOrderSuccessResponse = {
  ok: true;
  endpoint: "/api/orders/apply-refund";
  recordId: string;
  result: "succeeded" | "noop";
  orderStatusBefore: string;
  orderStatusAfter: string;
  amountPaidBefore: number;
  amountPaidAfter: number;
  writebackStatus: "Succeeded" | "Failed";
};

export type ApplyRefundToOrderFailureResponse = {
  ok: false;
  endpoint: "/api/orders/apply-refund";
  recordId: string;
  stage: "validation" | "writeback";
  error: string;
};

// ---------------------------------------------------------------------------
// Check Provider Readiness
// ---------------------------------------------------------------------------

export type CheckProviderReadinessRequest = {
  recordId: string;
  force: boolean;
};

export type ReadinessField = "Card Readiness" | "Invoice Readiness";
export type ReadinessValue = "Ready" | "Not Ready" | "Not Checked";
export type ClientSyncStep = "succeeded" | "skipped" | "noop";

export type CheckProviderReadinessSuccessResponse = {
  ok: true;
  endpoint: "/api/orders/check-provider-readiness";
  recordId: string;
  crossedProviderBoundary: boolean;
  steps: {
    clientSync: ClientSyncStep;
    readinessCheck: "Ready" | "Not Ready";
  };
  field: ReadinessField;
  result: "Ready" | "Not Ready";
  error: null;
  writebackStatus: "Succeeded";
};

export type CheckProviderReadinessNoopResponse = {
  ok: true;
  endpoint: "/api/orders/check-provider-readiness";
  recordId: string;
  result: "noop";
  field: ReadinessField;
  currentValue: "Ready";
};

export type CheckProviderReadinessFailureResponse = {
  ok: false;
  endpoint: "/api/orders/check-provider-readiness";
  recordId: string;
  crossedProviderBoundary: boolean;
  stage: "validation" | "provider" | "writeback" | "ambiguity";
  step: "clientSync" | "readinessCheck" | "writeback";
  error: string;
};

export type CheckProviderReadinessResponse =
  | CheckProviderReadinessSuccessResponse
  | CheckProviderReadinessNoopResponse
  | CheckProviderReadinessFailureResponse;

export type ChargeOrderRequest = {
  recordId: string;
  force: boolean;
  retryExternalActionId: string | null;
  idempotencyKey: string | null;
};

export type ChargeOrderStage = "validation" | "provider" | "writeback" | "ambiguity";
export type ChargeOrderProviderResult = "succeeded" | "noop";
export type ChargeOrderWritebackStatus = "Succeeded" | "Failed" | "Pending";

export type ChargeOrderSuccessResponse = {
  ok: true;
  endpoint: "/api/orders/charge";
  recordId: string;
  orderExternalRecordId: string;
  crossedProviderBoundary: boolean;
  providerResult: ChargeOrderProviderResult;
  externalActionId: string;
  externalPaymentId: string;
  chargeAmountCents: number;
  writebackStatus: ChargeOrderWritebackStatus;
  idempotencyKey: string;
};

export type ChargeOrderFailureResponse = {
  ok: false;
  endpoint: "/api/orders/charge";
  recordId: string;
  orderExternalRecordId?: string;
  crossedProviderBoundary: boolean;
  stage: ChargeOrderStage;
  error: string;
  externalActionId?: string;
};

export type ChargeOrderResponse =
  | ChargeOrderSuccessResponse
  | ChargeOrderFailureResponse;
