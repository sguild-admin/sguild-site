import {
  SyncEndpointError,
} from "@/lib/errors";
import type { BillingAction } from "@/lib/types/billing";
import type {
  ApplyInvoicePaymentRequest,
  ApplyRefundToOrderRequest,
  GrantCreditsRequest,
  OpenOrderRequest,
  OrderBillingRequest,
  ResolvePromotionRedemptionsRequest,
  SendInvoiceRequest,
} from "./dto";

type ProcessOrderBillingBody = {
  orderRecordId?: unknown;
  orderExternalRecordId?: unknown;
  orgIntegrationRecordId?: unknown;
  invoiceRecordId?: unknown;
  externalInvoiceId?: unknown;
  externalAction?: unknown;
  writebackAction?: unknown;
  action?: unknown;
};

type ResolvePromotionRedemptionsBody = {
  recordId?: unknown;
  force?: unknown;
  idempotencyKey?: unknown;
};

type OpenOrderBody = {
  recordId?: unknown;
  force?: unknown;
  idempotencyKey?: unknown;
};

type SendInvoiceBody = {
  recordId?: unknown;
  force?: unknown;
  retryExternalActionId?: unknown;
  idempotencyKey?: unknown;
  externalActionAttemptNumber?: unknown;
};

type ApplyInvoicePaymentBody = {
  recordId?: unknown;
  force?: unknown;
  idempotencyKey?: unknown;
  providerEvent?: unknown;
};

type GrantCreditsBody = {
  recordId?: unknown;
  force?: unknown;
  idempotencyKey?: unknown;
};

function parseAction(value: unknown): BillingAction {
  if (
    value === "Create Order" ||
    value === "Create Invoice" ||
    value === "Charge" ||
    value === "Refund" ||
    value === "Cancel" ||
    value === "Invoice" ||
    value === "Authentication"
  ) {
    return value;
  }

  throw new SyncEndpointError(
    "Invalid action. Must be Create Order, Create Invoice, Charge, Refund, Cancel, Invoice, or Authentication.",
    400,
  );
}

function parseWritebackAction(value: unknown): "Write Result" | "Skip Writeback" {
  if (value === "Skip Writeback") return "Skip Writeback";
  return "Write Result";
}

function readOptionalTrimmedString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function readBoolean(value: unknown): boolean | undefined {
  if (value == null) return undefined;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "1" || normalized === "yes") return true;
    if (normalized === "false" || normalized === "0" || normalized === "no") return false;
  }
  throw new SyncEndpointError("Invalid force flag.", 400);
}

function readOptionalPositiveInteger(
  value: unknown,
  fieldName: string,
): number | undefined {
  if (value == null) return undefined;
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return value;
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    if (Number.isInteger(parsed) && parsed > 0) return parsed;
  }
  throw new SyncEndpointError(`Invalid ${fieldName}.`, 400);
}

export function parseProcessOrderBillingBody(body: unknown): OrderBillingRequest {
  if (typeof body !== "object" || body == null || Array.isArray(body)) {
    throw new SyncEndpointError("Invalid request body.", 400);
  }

  const typed = body as ProcessOrderBillingBody;
  const orderRecordId = typeof typed.orderRecordId === "string" ? typed.orderRecordId.trim() : "";
  const orderExternalRecordId =
    typeof typed.orderExternalRecordId === "string" ? typed.orderExternalRecordId.trim() : "";
  const orgIntegrationRecordId =
    typeof typed.orgIntegrationRecordId === "string" ? typed.orgIntegrationRecordId.trim() : "";
  const actionSource = typed.externalAction ?? typed.action;
  const action = parseAction(actionSource);
  const writebackAction = parseWritebackAction(typed.writebackAction);
  const invoiceRecordId = typeof typed.invoiceRecordId === "string" ? typed.invoiceRecordId.trim() : "";
  const externalInvoiceId =
    typeof typed.externalInvoiceId === "string" ? typed.externalInvoiceId.trim() : "";

  if (!orderRecordId) throw new SyncEndpointError("Missing orderRecordId.", 400);
  if (!orderExternalRecordId) throw new SyncEndpointError("Missing orderExternalRecordId.", 400);
  if (!orgIntegrationRecordId) throw new SyncEndpointError("Missing orgIntegrationRecordId.", 400);

  return {
    orderRecordId,
    orderExternalRecordId,
    orgIntegrationRecordId,
    invoiceRecordId: invoiceRecordId || undefined,
    externalInvoiceId: externalInvoiceId || undefined,
    writebackAction,
    action,
  };
}

export function parseResolvePromotionRedemptionsBody(
  body: unknown,
): ResolvePromotionRedemptionsRequest {
  if (typeof body !== "object" || body == null || Array.isArray(body)) {
    throw new SyncEndpointError("Invalid request body.", 400);
  }

  const typed = body as ResolvePromotionRedemptionsBody;
  const recordId = readOptionalTrimmedString(typed.recordId);
  if (!recordId) throw new SyncEndpointError("Missing recordId.", 400);

  return {
    recordId,
    force: readBoolean(typed.force) ?? false,
    idempotencyKey: readOptionalTrimmedString(typed.idempotencyKey),
  };
}

export function parseOpenOrderBody(body: unknown): OpenOrderRequest {
  if (typeof body !== "object" || body == null || Array.isArray(body)) {
    throw new SyncEndpointError("Invalid request body.", 400);
  }

  const typed = body as OpenOrderBody;
  const recordId = readOptionalTrimmedString(typed.recordId);
  if (!recordId) throw new SyncEndpointError("Missing recordId.", 400);

  return {
    recordId,
    force: readBoolean(typed.force) ?? false,
    idempotencyKey: readOptionalTrimmedString(typed.idempotencyKey),
  };
}

export function parseSendInvoiceBody(body: unknown): SendInvoiceRequest {
  if (typeof body !== "object" || body == null || Array.isArray(body)) {
    throw new SyncEndpointError("Invalid request body.", 400);
  }

  const typed = body as SendInvoiceBody;
  const recordId = readOptionalTrimmedString(typed.recordId);
  if (!recordId) throw new SyncEndpointError("Missing recordId.", 400);

  return {
    recordId,
    force: readBoolean(typed.force) ?? false,
    retryExternalActionId: readOptionalTrimmedString(typed.retryExternalActionId),
    idempotencyKey: readOptionalTrimmedString(typed.idempotencyKey),
    externalActionAttemptNumber: readOptionalPositiveInteger(
      typed.externalActionAttemptNumber,
      "externalActionAttemptNumber",
    ),
  };
}

function parseOptionalProviderEvent(
  value: unknown,
): ApplyInvoicePaymentRequest["providerEvent"] | undefined {
  if (value == null) return undefined;
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new SyncEndpointError("Invalid providerEvent.", 400);
  }

  const typed = value as Record<string, unknown>;
  const amountPaidCents = readOptionalPositiveInteger(typed.amountPaidCents, "amountPaidCents");
  const paidAt = readOptionalTrimmedString(typed.paidAt);
  if (paidAt) {
    const parsed = new Date(paidAt);
    if (Number.isNaN(parsed.getTime())) {
      throw new SyncEndpointError("Invalid providerEvent.paidAt.", 400);
    }
  }

  return {
    provider: readOptionalTrimmedString(typed.provider),
    providerEventId: readOptionalTrimmedString(typed.providerEventId),
    providerEventType: readOptionalTrimmedString(typed.providerEventType),
    externalInvoiceId: readOptionalTrimmedString(typed.externalInvoiceId),
    externalPaymentId: readOptionalTrimmedString(typed.externalPaymentId),
    amountPaidCents,
    paidAt,
    rawPayload: readOptionalTrimmedString(typed.rawPayload),
  };
}

export function parseApplyInvoicePaymentBody(body: unknown): ApplyInvoicePaymentRequest {
  if (typeof body !== "object" || body == null || Array.isArray(body)) {
    throw new SyncEndpointError("Invalid request body.", 400);
  }

  const typed = body as ApplyInvoicePaymentBody;
  const recordId = readOptionalTrimmedString(typed.recordId);
  if (!recordId) throw new SyncEndpointError("Missing recordId.", 400);

  return {
    recordId,
    force: readBoolean(typed.force) ?? false,
    idempotencyKey: readOptionalTrimmedString(typed.idempotencyKey),
    providerEvent: parseOptionalProviderEvent(typed.providerEvent),
  };
}

export function parseGrantCreditsBody(body: unknown): GrantCreditsRequest {
  if (typeof body !== "object" || body == null || Array.isArray(body)) {
    throw new SyncEndpointError("Invalid request body.", 400);
  }

  const typed = body as GrantCreditsBody;
  const recordId = readOptionalTrimmedString(typed.recordId);
  if (!recordId) throw new SyncEndpointError("Missing recordId.", 400);

  return {
    recordId,
    force: readBoolean(typed.force),
    idempotencyKey: readOptionalTrimmedString(typed.idempotencyKey),
  };
}

type ApplyRefundToOrderBody = {
  recordId?: unknown;
};

export function parseApplyRefundToOrderBody(body: unknown): ApplyRefundToOrderRequest {
  if (typeof body !== "object" || body == null || Array.isArray(body)) {
    throw new SyncEndpointError("Invalid request body.", 400);
  }

  const typed = body as ApplyRefundToOrderBody;
  const recordId = readOptionalTrimmedString(typed.recordId);
  if (!recordId) throw new SyncEndpointError("Missing recordId.", 400);

  return { recordId };
}
