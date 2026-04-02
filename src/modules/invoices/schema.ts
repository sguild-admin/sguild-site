import { SyncEndpointError } from "@/lib/errors";
import type {
  DeliveryMethod,
  ReconcileInvoiceExternalsRequestDto,
  SendInvoiceRequestDto,
} from "./dto";

type SendInvoiceBody = {
  invoiceRecordId?: unknown;
  orderRecordId?: unknown;
  orgIntegrationRecordId?: unknown;
  invoiceExternalRecordId?: unknown;
  externalInvoiceId?: unknown;
  deliveryMethod?: unknown;
  saveCard?: unknown;
  phoneSnapshot?: unknown;
  idempotencyKey?: unknown;
  forceResend?: unknown;
};

type ReconcileInvoiceExternalsBody = {
  orderRecordId?: unknown;
  orgIntegrationRecordId?: unknown;
  dryRun?: unknown;
};

function asTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asOptionalBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return null;
    if (normalized === "true" || normalized === "yes" || normalized === "1") return true;
    if (normalized === "false" || normalized === "no" || normalized === "0") return false;
  }
  return null;
}

function parseDeliveryMethod(value: unknown): DeliveryMethod {
  if (value === "Email" || value === "Sms" || value === "Link") return value;
  if (value === "URL") return "Link";
  throw new SyncEndpointError("Invalid deliveryMethod. Must be Email, Sms, or Link.", 400);
}

export function coerceDeliveryMethod(value: unknown): DeliveryMethod | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === "email") return "Email";
  if (normalized === "sms" || normalized === "text") return "Sms";
  if (
    normalized === "link" ||
    normalized === "url" ||
    normalized === "share_manually" ||
    normalized === "share manually"
  ) {
    return "Link";
  }
  return null;
}

export function parseSendInvoiceBody(body: unknown): SendInvoiceRequestDto {
  if (typeof body !== "object" || body == null || Array.isArray(body)) {
    throw new SyncEndpointError("Invalid request body.", 400);
  }

  const typed = body as SendInvoiceBody;
  const invoiceRecordId = asTrimmedString(typed.invoiceRecordId);
  const orderRecordId = asTrimmedString(typed.orderRecordId);
  const orgIntegrationRecordId = asTrimmedString(typed.orgIntegrationRecordId);
  const invoiceExternalRecordId = asTrimmedString(typed.invoiceExternalRecordId) ?? undefined;
  const externalInvoiceId = asTrimmedString(typed.externalInvoiceId) ?? undefined;
  const idempotencyKey = asTrimmedString(typed.idempotencyKey) ?? undefined;
  const phoneSnapshot = asTrimmedString(typed.phoneSnapshot) ?? undefined;
  const saveCard = asOptionalBoolean(typed.saveCard) ?? undefined;
  const requestedDeliveryMethodRaw = asTrimmedString(typed.deliveryMethod);
  const requestedDeliveryMethod = requestedDeliveryMethodRaw
    ? parseDeliveryMethod(requestedDeliveryMethodRaw)
    : undefined;

  if (!invoiceRecordId) throw new SyncEndpointError("Missing invoiceRecordId.", 400);
  if (!orgIntegrationRecordId) throw new SyncEndpointError("Missing orgIntegrationRecordId.", 400);

  return {
    invoiceRecordId,
    ...(orderRecordId ? { orderRecordId } : {}),
    orgIntegrationRecordId,
    invoiceExternalRecordId,
    externalInvoiceId,
    ...(requestedDeliveryMethod ? { deliveryMethod: requestedDeliveryMethod } : {}),
    ...(saveCard != null ? { saveCard } : {}),
    phoneSnapshot,
    idempotencyKey,
    forceResend: typed.forceResend === true,
  };
}

export function parseReconcileBody(body: unknown): ReconcileInvoiceExternalsRequestDto {
  if (typeof body !== "object" || body == null || Array.isArray(body)) {
    throw new SyncEndpointError("Invalid request body.", 400);
  }

  const typed = body as ReconcileInvoiceExternalsBody;
  const orderRecordId = typeof typed.orderRecordId === "string" ? typed.orderRecordId.trim() : "";
  const orgIntegrationRecordId =
    typeof typed.orgIntegrationRecordId === "string" ? typed.orgIntegrationRecordId.trim() : "";

  if (!orderRecordId) throw new SyncEndpointError("Missing orderRecordId.", 400);
  if (!orgIntegrationRecordId) throw new SyncEndpointError("Missing orgIntegrationRecordId.", 400);

  return {
    orderRecordId,
    orgIntegrationRecordId,
    dryRun: typed.dryRun !== false,
  };
}

export function mapProviderInvoiceStatusToExternal(value: string | null):
  | "Draft"
  | "Sent"
  | "Partially Paid"
  | "Paid"
  | "Voided"
  | "Refunded"
  | "Failed" {
  const normalized = (value ?? "").trim().toUpperCase();
  if (normalized === "DRAFT") return "Draft";
  if (normalized === "PAID") return "Paid";
  if (normalized === "PARTIALLY_PAID") return "Partially Paid";
  if (normalized === "CANCELED") return "Voided";
  if (normalized === "REFUNDED") return "Refunded";
  if (normalized === "UNPAID" || normalized === "SCHEDULED") return "Sent";
  return "Failed";
}

export function defaultSendIdempotencyKey(input: {
  provider: string;
  invoiceRecordId: string;
  deliveryMethod: DeliveryMethod;
}): string {
  return `invoice-send:${input.provider.toLowerCase()}:${input.invoiceRecordId}:${input.deliveryMethod.toLowerCase()}`;
}

export function pickCanonicalExternalInvoiceId(input: {
  fromInvoiceExternal: string | null;
  fromOrderExternals: string[];
}): { externalInvoiceId: string | null; error?: string } {
  if (input.fromInvoiceExternal) {
    return { externalInvoiceId: input.fromInvoiceExternal };
  }

  const uniqueFromOrderExternals = [...new Set(input.fromOrderExternals)];
  if (uniqueFromOrderExternals.length === 0) {
    return { externalInvoiceId: null, error: "No external invoice ID found in Order Externals or Invoice Externals." };
  }

  if (uniqueFromOrderExternals.length > 1) {
    return {
      externalInvoiceId: null,
      error:
        "Multiple external invoice IDs found for this Invoice without an existing Invoice External canonical row.",
    };
  }

  return { externalInvoiceId: uniqueFromOrderExternals[0] };
}
