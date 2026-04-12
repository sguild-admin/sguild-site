import { SyncEndpointError } from "@/lib/errors";
import type {
  ClientExternalStatus,
  ClientExternalSyncStatus,
  ClientExternalsRequestDto,
  CreateClientExternalDto,
  FindClientExternalByContextDto,
  SyncAllClientExternalsDto,
  UpdateClientExternalDto,
} from "./dto";

type AnyRecord = Record<string, unknown>;

const STATUSES = new Set<ClientExternalStatus>(["Active", "Inactive", "Failed", "Pending"]);
const SYNC_STATUSES = new Set<ClientExternalSyncStatus>([
  "Not Synced",
  "Pending",
  "Synced",
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

function parseOptionalIso(value: unknown, fieldName: string): string | undefined {
  const raw = readTrimmedString(value);
  if (!raw) return undefined;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    throw new SyncEndpointError(`Invalid ${fieldName}.`, 400);
  }
  return parsed.toISOString();
}

function asEnum<T extends string>(value: unknown, allowed: Set<T>, fieldName: string, required: boolean): T | undefined {
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

function parseCreatePayload(payload: unknown): CreateClientExternalDto {
  const typed = asRecord(payload, "Invalid create payload.");
  const clientRecordId = readTrimmedString(typed.clientRecordId);
  const providerAccountRecordId = readTrimmedString(typed.providerAccountRecordId);

  if (!clientRecordId) throw new SyncEndpointError("Missing clientRecordId.", 400);
  if (!providerAccountRecordId) throw new SyncEndpointError("Missing providerAccountRecordId.", 400);

  return {
    clientRecordId,
    providerAccountRecordId,
    externalCustomerId: readTrimmedString(typed.externalCustomerId),
    status: asEnum(typed.status, STATUSES, "status", false),
    notes: readTrimmedString(typed.notes),
    nameSnapshot: readTrimmedString(typed.nameSnapshot),
    phoneSnapshot: readTrimmedString(typed.phoneSnapshot),
    syncStatus: asEnum(typed.syncStatus, SYNC_STATUSES, "syncStatus", false),
    syncError: readTrimmedString(typed.syncError),
    lastSyncedAt: parseOptionalIso(typed.lastSyncedAt, "lastSyncedAt"),
    lastSuccessfulCallAt: parseOptionalIso(typed.lastSuccessfulCallAt, "lastSuccessfulCallAt"),
    lastErrorAt: parseOptionalIso(typed.lastErrorAt, "lastErrorAt"),
  };
}

function parseUpdatePayload(payload: unknown): UpdateClientExternalDto {
  const typed = asRecord(payload, "Invalid update payload.");
  const recordId = readTrimmedString(typed.recordId);
  if (!recordId) throw new SyncEndpointError("Missing recordId.", 400);

  return {
    recordId,
    externalCustomerId: readTrimmedString(typed.externalCustomerId),
    status: asEnum(typed.status, STATUSES, "status", false),
    notes: readTrimmedString(typed.notes),
    nameSnapshot: readTrimmedString(typed.nameSnapshot),
    phoneSnapshot: readTrimmedString(typed.phoneSnapshot),
    syncStatus: asEnum(typed.syncStatus, SYNC_STATUSES, "syncStatus", false),
    syncError: readTrimmedString(typed.syncError),
    lastSyncedAt: parseOptionalIso(typed.lastSyncedAt, "lastSyncedAt"),
    lastSuccessfulCallAt: parseOptionalIso(typed.lastSuccessfulCallAt, "lastSuccessfulCallAt"),
    lastErrorAt: parseOptionalIso(typed.lastErrorAt, "lastErrorAt"),
  };
}

function parseGetPayload(payload: unknown): { recordId: string } {
  const typed = asRecord(payload, "Invalid get payload.");
  const recordId = readTrimmedString(typed.recordId);
  if (!recordId) throw new SyncEndpointError("Missing recordId.", 400);
  return { recordId };
}

function parseFindByContextPayload(payload: unknown): FindClientExternalByContextDto {
  const typed = asRecord(payload, "Invalid find_by_context payload.");
  const clientRecordId = readTrimmedString(typed.clientRecordId);
  const providerAccountRecordId = readTrimmedString(typed.providerAccountRecordId);

  if (!clientRecordId) throw new SyncEndpointError("Missing clientRecordId.", 400);
  if (!providerAccountRecordId) throw new SyncEndpointError("Missing providerAccountRecordId.", 400);

  return { clientRecordId, providerAccountRecordId };
}

function parseSyncAllPayload(payload: unknown): SyncAllClientExternalsDto {
  if (payload == null) return {};
  const typed = asRecord(payload, "Invalid sync_all payload.");
  const dryRun =
    typeof typed.dryRun === "boolean"
      ? typed.dryRun
      : typeof typed.dryRun === "string"
        ? typed.dryRun.trim().toLowerCase() === "true"
        : undefined;
  return {
    ...(typeof dryRun === "boolean" ? { dryRun } : {}),
  };
}

export function parseClientExternalsRequestBody(body: unknown): ClientExternalsRequestDto {
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
  if (operation === "find_by_context") {
    return { operation, payload: parseFindByContextPayload(typed.payload) };
  }
  if (operation === "sync_all") {
    return { operation, payload: parseSyncAllPayload(typed.payload) };
  }

  throw new SyncEndpointError("Unsupported operation.", 400);
}
