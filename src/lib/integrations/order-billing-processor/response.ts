export type BillingAction =
  | "Create Order"
  | "Create Invoice"
  | "Charge"
  | "Refund"
  | "Cancel"
  | "Invoice"
  | "Authentication";

export type BillingProcessSuccessResponse = {
  ok: true;
  syncStatus: "Synced";
  action: BillingAction;
  externalAction?: BillingAction;
  writebackStatus?: "Succeeded" | "Failed" | "Skipped";
  reconciliationStatus?:
    | "Not Started"
    | "In Progress"
    | "Complete"
    | "External Failed"
    | "Writeback Failed"
    | "Writeback Failed After External Success"
    | "Needs Review";
  result: "processed" | "noop";
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
  skippedDuplicateInvoiceCancellations?: Array<{ externalInvoiceId: string; reason: string }>;
};

export type BillingProcessErrorResponse = {
  ok: false;
  error: string;
  stack?: string | null;
};

export class SyncEndpointError extends Error {
  readonly status: number;
  readonly exposeMessage: boolean;
  readonly rawPayload?: string;

  constructor(
    message: string,
    status: number,
    options?: { exposeMessage?: boolean; rawPayload?: string },
  ) {
    super(message);
    this.name = "SyncEndpointError";
    this.status = status;
    this.exposeMessage = options?.exposeMessage ?? true;
    this.rawPayload = options?.rawPayload;
  }
}

export function successResponse(
  action: BillingAction,
  result: "processed" | "noop",
  externalIds?: {
    externalPaymentId?: string | null;
    externalOrderId?: string | null;
    externalInvoiceId?: string | null;
  },
  metadata?: {
    externalAction?: BillingAction;
    writebackStatus?: "Succeeded" | "Failed" | "Skipped";
    reconciliationStatus?:
      | "Not Started"
      | "In Progress"
      | "Complete"
      | "External Failed"
      | "Writeback Failed"
      | "Writeback Failed After External Success"
      | "Needs Review";
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
    skippedDuplicateInvoiceCancellations?: Array<{ externalInvoiceId: string; reason: string }>;
  },
): BillingProcessSuccessResponse {
  const body: BillingProcessSuccessResponse = {
    ok: true,
    syncStatus: "Synced",
    action,
    result,
  };

  if (externalIds?.externalPaymentId) body.externalPaymentId = externalIds.externalPaymentId;
  if (externalIds?.externalOrderId) body.externalOrderId = externalIds.externalOrderId;
  if (externalIds?.externalInvoiceId) body.externalInvoiceId = externalIds.externalInvoiceId;

  if (metadata?.resolvedInvoiceRecordId) {
    body.resolvedInvoiceRecordId = metadata.resolvedInvoiceRecordId;
  }
  if (metadata?.externalAction) body.externalAction = metadata.externalAction;
  if (metadata?.writebackStatus) body.writebackStatus = metadata.writebackStatus;
  if (metadata?.reconciliationStatus) body.reconciliationStatus = metadata.reconciliationStatus;
  if (metadata?.invoiceId) body.invoiceId = metadata.invoiceId;
  if (metadata?.orderId) body.orderId = metadata.orderId;
  if (metadata?.invoiceExternalRecordId) {
    body.invoiceExternalRecordId = metadata.invoiceExternalRecordId;
  }
  if (metadata?.externalStatus) body.externalStatus = metadata.externalStatus;
  if (metadata?.amountDue != null) body.amountDue = metadata.amountDue;
  if (metadata?.amountPaid != null) body.amountPaid = metadata.amountPaid;
  if (metadata?.issuedAt) body.issuedAt = metadata.issuedAt;
  if (metadata?.dueAt) body.dueAt = metadata.dueAt;
  if (metadata?.hostedInvoiceUrl) body.hostedInvoiceUrl = metadata.hostedInvoiceUrl;
  if (typeof metadata?.wasExistingMappingReused === "boolean") {
    body.wasExistingMappingReused = metadata.wasExistingMappingReused;
  }
  if (metadata?.rawPayload) body.rawPayload = metadata.rawPayload;
  if (metadata?.canceledDuplicateExternalInvoiceIds?.length) {
    body.canceledDuplicateExternalInvoiceIds = metadata.canceledDuplicateExternalInvoiceIds;
  }
  if (metadata?.skippedDuplicateInvoiceCancellations?.length) {
    body.skippedDuplicateInvoiceCancellations = metadata.skippedDuplicateInvoiceCancellations;
  }

  return body;
}

export function failureFromError(
  error: unknown,
): { status: number; body: BillingProcessErrorResponse } {
  const isDev = process.env.NODE_ENV !== "production";

  if (error instanceof SyncEndpointError) {
    return {
      status: error.status,
      body: {
        ok: false,
        error: error.exposeMessage ? error.message : "Unexpected server error.",
        ...(isDev && error instanceof Error ? { stack: error.stack ?? null } : {}),
      },
    };
  }

  return {
    status: 500,
    body: {
      ok: false,
      error: error instanceof Error ? error.message : "Unexpected server error.",
      ...(isDev && error instanceof Error ? { stack: error.stack ?? null } : {}),
    },
  };
}
