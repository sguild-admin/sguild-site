import { SyncEndpointError } from "@/lib/errors";
import type {
  CreateOrderExternalDto,
  FindOrderExternalByExternalIdsDto,
  FindOrderExternalsByOrderDto,
  OrderExternalSyncStatus,
  OrderExternalWritebackStatus,
  OrderExternalsRequestDto,
  UpdateOrderExternalDto,
} from "./dto";

type AnyRecord = Record<string, unknown>;

const SYNC_STATUSES = new Set<OrderExternalSyncStatus>(["Pending", "Synced", "Failed", "Ignored"]);
const WRITEBACK_STATUSES = new Set<OrderExternalWritebackStatus>([
  "Not Started",
  "Pending",
  "Succeeded",
  "Failed",
]);

function asRecord(value: unknown, message: string): AnyRecord {
  if (typeof value !== "object" || value == null || Array.isArray(value)) {
    throw new SyncEndpointError(message, 400);
  }
  return value as AnyRecord;
}

function readTrimmedString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function readOptionalTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readOptionalInteger(value: unknown, fieldName: string): number | undefined {
  if (value == null) return undefined;
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    if (Number.isInteger(parsed)) return parsed;
  }
  throw new SyncEndpointError(`Invalid ${fieldName}.`, 400);
}

function parseOptionalIso(value: unknown, fieldName: string): string | undefined {
  const raw = readTrimmedString(value);
  if (!raw) return undefined;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    throw new SyncEndpointError(`Invalid ${fieldName}.`, 400);
  }
  return parsed.toISOString();
}

function asEnum<T extends string>(
  value: unknown,
  allowed: Set<T>,
  fieldName: string,
  required: boolean,
): T | undefined {
  const parsed = readTrimmedString(value);
  if (!parsed) {
    if (required) throw new SyncEndpointError(`Missing ${fieldName}.`, 400);
    return undefined;
  }
  if (!allowed.has(parsed as T)) {
    throw new SyncEndpointError(`Invalid ${fieldName}.`, 400);
  }
  return parsed as T;
}

function parseCreatePayload(payload: unknown): CreateOrderExternalDto {
  const typed = asRecord(payload, "Invalid create payload.");
  const orderRecordId = readTrimmedString(typed.orderRecordId);
  if (!orderRecordId) throw new SyncEndpointError("Missing orderRecordId.", 400);

  return {
    orderRecordId,
    orgIntegrationRecordId: readTrimmedString(typed.orgIntegrationRecordId),
    globalProviderAccountRecordId: readTrimmedString(typed.globalProviderAccountRecordId),
    syncStatus: asEnum(typed.syncStatus, SYNC_STATUSES, "syncStatus", false),
    writebackStatus: asEnum(typed.writebackStatus, WRITEBACK_STATUSES, "writebackStatus", false),
    currentExternalStatus: readTrimmedString(typed.currentExternalStatus),
    lastProviderActivityAt: parseOptionalIso(typed.lastProviderActivityAt, "lastProviderActivityAt"),
    lastSyncedAt: parseOptionalIso(typed.lastSyncedAt, "lastSyncedAt"),
    syncError: readTrimmedString(typed.syncError),
    writebackAt: parseOptionalIso(typed.writebackAt, "writebackAt"),
    writebackError: readTrimmedString(typed.writebackError),
    notes: readTrimmedString(typed.notes),
    externalOrderId: readTrimmedString(typed.externalOrderId),
    externalPaymentId: readTrimmedString(typed.externalPaymentId),
    externalInvoiceId: readTrimmedString(typed.externalInvoiceId),
    externalPaymentStatusSnapshot: readTrimmedString(typed.externalPaymentStatusSnapshot),
    externalInvoiceStatusSnapshot: readTrimmedString(typed.externalInvoiceStatusSnapshot),
    externalInvoiceUrlSnapshot: readTrimmedString(typed.externalInvoiceUrlSnapshot),
    externalInvoiceSentAtSnapshot: readTrimmedString(typed.externalInvoiceSentAtSnapshot),
    externalInvoicePaidAtSnapshot: readTrimmedString(typed.externalInvoicePaidAtSnapshot),
    customerIdSnapshot: readTrimmedString(typed.customerIdSnapshot),
    cardIdSnapshot: readTrimmedString(typed.cardIdSnapshot),
    amountSnapshotCents: readOptionalInteger(typed.amountSnapshotCents, "amountSnapshotCents"),
    rawPayloadSnapshot: readTrimmedString(typed.rawPayloadSnapshot),
  };
}

function parseUpdatePayload(payload: unknown): UpdateOrderExternalDto {
  const typed = asRecord(payload, "Invalid update payload.");
  const recordId = readTrimmedString(typed.recordId);
  if (!recordId) throw new SyncEndpointError("Missing recordId.", 400);

  return {
    recordId,
    orgIntegrationRecordId: readTrimmedString(typed.orgIntegrationRecordId),
    globalProviderAccountRecordId: readTrimmedString(typed.globalProviderAccountRecordId),
    syncStatus: asEnum(typed.syncStatus, SYNC_STATUSES, "syncStatus", false),
    writebackStatus: asEnum(typed.writebackStatus, WRITEBACK_STATUSES, "writebackStatus", false),
    currentExternalStatus: readTrimmedString(typed.currentExternalStatus),
    lastProviderActivityAt: parseOptionalIso(typed.lastProviderActivityAt, "lastProviderActivityAt"),
    lastSyncedAt: parseOptionalIso(typed.lastSyncedAt, "lastSyncedAt"),
    syncError: readTrimmedString(typed.syncError),
    writebackAt: parseOptionalIso(typed.writebackAt, "writebackAt"),
    writebackError: readTrimmedString(typed.writebackError),
    notes: readTrimmedString(typed.notes),
    externalOrderId: readTrimmedString(typed.externalOrderId),
    externalPaymentId: readTrimmedString(typed.externalPaymentId),
    externalInvoiceId: readTrimmedString(typed.externalInvoiceId),
    externalPaymentStatusSnapshot: readTrimmedString(typed.externalPaymentStatusSnapshot),
    externalInvoiceStatusSnapshot: readTrimmedString(typed.externalInvoiceStatusSnapshot),
    externalInvoiceUrlSnapshot: readTrimmedString(typed.externalInvoiceUrlSnapshot),
    externalInvoiceSentAtSnapshot: readTrimmedString(typed.externalInvoiceSentAtSnapshot),
    externalInvoicePaidAtSnapshot: readTrimmedString(typed.externalInvoicePaidAtSnapshot),
    customerIdSnapshot: readTrimmedString(typed.customerIdSnapshot),
    cardIdSnapshot: readTrimmedString(typed.cardIdSnapshot),
    amountSnapshotCents: readOptionalInteger(typed.amountSnapshotCents, "amountSnapshotCents"),
    rawPayloadSnapshot: readTrimmedString(typed.rawPayloadSnapshot),
  };
}

function parseGetPayload(payload: unknown): { recordId: string } {
  const typed = asRecord(payload, "Invalid get payload.");
  const recordId = readTrimmedString(typed.recordId);
  if (!recordId) throw new SyncEndpointError("Missing recordId.", 400);
  return { recordId };
}

function parseFindByOrderPayload(payload: unknown): FindOrderExternalsByOrderDto {
  const typed = asRecord(payload, "Invalid find_by_order payload.");
  const orderRecordId = readTrimmedString(typed.orderRecordId);
  if (!orderRecordId) throw new SyncEndpointError("Missing orderRecordId.", 400);
  return { orderRecordId };
}

function parseFindByExternalIdsPayload(payload: unknown): FindOrderExternalByExternalIdsDto {
  const typed = asRecord(payload, "Invalid find_by_external_ids payload.");
  const externalOrderId = readTrimmedString(typed.externalOrderId);
  const externalPaymentId = readTrimmedString(typed.externalPaymentId);
  const externalInvoiceId = readTrimmedString(typed.externalInvoiceId);
  if (!externalOrderId && !externalPaymentId && !externalInvoiceId) {
    throw new SyncEndpointError(
      "Provide at least one of externalOrderId, externalPaymentId, or externalInvoiceId.",
      400,
    );
  }

  return {
    externalOrderId,
    externalPaymentId,
    externalInvoiceId,
  };
}

export function parseOrderExternalsRequestBody(body: unknown): OrderExternalsRequestDto {
  const typed = asRecord(body, "Invalid request body.");
  const operation = readTrimmedString(typed.operation);
  if (!operation) throw new SyncEndpointError("Missing operation.", 400);

  if (operation === "create") {
    return { operation, payload: parseCreatePayload(typed.payload) };
  }
  if (operation === "update") {
    return { operation, payload: parseUpdatePayload(typed.payload) };
  }
  if (operation === "get") {
    return { operation, payload: parseGetPayload(typed.payload) };
  }
  if (operation === "find_by_order") {
    return { operation, payload: parseFindByOrderPayload(typed.payload) };
  }
  if (operation === "find_by_external_ids") {
    return { operation, payload: parseFindByExternalIdsPayload(typed.payload) };
  }

  throw new SyncEndpointError("Unsupported operation.", 400);
}
