export type BillingAction = "Charge" | "Invoice" | "Authentication";

export type BillingProcessSuccessResponse = {
  ok: true;
  syncStatus: "Synced";
  action: BillingAction;
  result: "processed" | "noop";
  externalPaymentId?: string;
  externalOrderId?: string;
  externalInvoiceId?: string;
};

export type BillingProcessErrorResponse = {
  ok: false;
  error: string;
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

  return body;
}

export function failureFromError(
  error: unknown,
): { status: number; body: BillingProcessErrorResponse } {
  if (error instanceof SyncEndpointError) {
    return {
      status: error.status,
      body: {
        ok: false,
        error: error.exposeMessage ? error.message : "Unexpected server error.",
      },
    };
  }

  return {
    status: 500,
    body: {
      ok: false,
      error: "Unexpected server error.",
    },
  };
}

