import { SyncEndpointError } from "@/lib/errors";
import type {
  CountExternalActionsByExternalDto,
  CreateExternalActionDto,
  ExternalActionDirection,
  ExternalActionEntityType,
  ExternalActionStatus,
  ExternalActionTriggerSource,
  ExternalActionType,
  ExternalActionWritebackStatus,
  ExternalActionsRequestDto,
  FindInboundExternalActionDto,
  RetryClassification,
  RetryExternalActionRequestDto,
  SyncExternalActionRequestDto,
  UpdateExternalActionDto,
} from "./dto";

type RequestBody = {
  operation?: unknown;
  payload?: unknown;
};

type AnyRecord = Record<string, unknown>;

const ENTITY_TYPES = new Set<ExternalActionEntityType>(["Client", "Card", "Order", "Refund"]);
const ACTION_TYPES = new Set<ExternalActionType>([
  "Create",
  "Send",
  "Refresh",
  "Void",
  "Import",
  "Webhook",
  "Reconcile",
  "Retry",
]);
const DIRECTIONS = new Set<ExternalActionDirection>(["Outbound", "Inbound"]);
const TRIGGER_SOURCES = new Set<ExternalActionTriggerSource>([
  "Manual",
  "Automation",
  "Webhook",
  "Script",
  "Backfill",
]);
const STATUSES = new Set<ExternalActionStatus>(["Pending", "Succeeded", "Failed", "Ignored"]);
const WRITEBACK_STATUSES = new Set<ExternalActionWritebackStatus>([
  "Not Started",
  "Pending",
  "Succeeded",
  "Failed",
]);
const RETRY_CLASSIFICATIONS = new Set<RetryClassification>([
  "Provider Transient",
  "Writeback Failure",
  "Idempotent Uncertain",
  "Validation Failure",
  "Ambiguity",
  "Policy Failure",
  "Provider Permanent",
]);
const LINK_TYPES = new Set<CountExternalActionsByExternalDto["externalLinkType"]>([
  "Client External",
  "Card External",
  "Order External",
  "Refund External",
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

function readOptionalNumber(value: unknown): number | undefined {
  if (value == null) return undefined;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) return parsed;
  }
  throw new SyncEndpointError("Invalid number field in payload.", 400);
}

function readOptionalBoolean(value: unknown): boolean | undefined {
  if (value == null) return undefined;
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }
  throw new SyncEndpointError("Invalid boolean field in payload.", 400);
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

function parseCreatePayload(payload: unknown, mode: "create" | "update"): CreateExternalActionDto {
  const typed = asRecord(payload, "Invalid create payload.");

  return {
    externalEntityType: asEnum(
      typed.externalEntityType,
      ENTITY_TYPES,
      "externalEntityType",
      mode === "create",
    ) as ExternalActionEntityType,
    actionType: asEnum(typed.actionType, ACTION_TYPES, "actionType", mode === "create") as ExternalActionType,
    direction: asEnum(typed.direction, DIRECTIONS, "direction", mode === "create") as ExternalActionDirection,
    triggerSource: asEnum(typed.triggerSource, TRIGGER_SOURCES, "triggerSource", false),
    occurredAt: parseOptionalIso(typed.occurredAt, "occurredAt"),
    status: asEnum(typed.status, STATUSES, "status", false),
    attemptNumber: readOptionalNumber(typed.attemptNumber),
    retryable: readOptionalBoolean(typed.retryable),
    retryClassification: asEnum(
      typed.retryClassification,
      RETRY_CLASSIFICATIONS,
      "retryClassification",
      false,
    ),
    notes: readTrimmedString(typed.notes),
    orgIntegrationRecordId: readTrimmedString(typed.orgIntegrationRecordId),
    providerAccountRecordId: readTrimmedString(typed.providerAccountRecordId),
    clientExternalRecordId: readTrimmedString(typed.clientExternalRecordId),
    cardExternalRecordId: readTrimmedString(typed.cardExternalRecordId),
    orderExternalRecordId: readTrimmedString(typed.orderExternalRecordId),
    refundExternalRecordId: readTrimmedString(typed.refundExternalRecordId),
    provider: readTrimmedString(typed.provider),
    providerEventType: readTrimmedString(typed.providerEventType),
    providerReferenceId: readTrimmedString(typed.providerReferenceId),
    httpStatusCode: readOptionalNumber(typed.httpStatusCode),
    errorSummary: readTrimmedString(typed.errorSummary),
    requestPayload: readTrimmedString(typed.requestPayload),
    responsePayload: readTrimmedString(typed.responsePayload),
    rawProviderPayload: readTrimmedString(typed.rawProviderPayload),
    writebackStatus: asEnum(typed.writebackStatus, WRITEBACK_STATUSES, "writebackStatus", false),
    writebackSucceededAt: parseOptionalIso(typed.writebackSucceededAt, "writebackSucceededAt"),
    writebackError: readTrimmedString(typed.writebackError),
    writebackRetryCount: readOptionalNumber(typed.writebackRetryCount),
    writebackLastAttemptAt: parseOptionalIso(typed.writebackLastAttemptAt, "writebackLastAttemptAt"),
  };
}

function parseUpdatePayload(payload: unknown): UpdateExternalActionDto {
  const typed = asRecord(payload, "Invalid update payload.");
  const recordId = readTrimmedString(typed.recordId);
  if (!recordId) throw new SyncEndpointError("Missing recordId.", 400);

  const parsed = parseCreatePayload(typed, "update");
  return {
    recordId,
    ...parsed,
  };
}

function parseFindInboundPayload(payload: unknown): FindInboundExternalActionDto {
  const typed = asRecord(payload, "Invalid find_inbound_by_identity payload.");
  const provider = readTrimmedString(typed.provider);
  const providerReferenceId = readTrimmedString(typed.providerReferenceId);
  if (!provider || !providerReferenceId) {
    throw new SyncEndpointError("Missing provider or providerReferenceId.", 400);
  }

  return {
    provider,
    providerReferenceId,
    providerAccountRecordId: readTrimmedString(typed.providerAccountRecordId),
  };
}

function parseCountPayload(payload: unknown): CountExternalActionsByExternalDto {
  const typed = asRecord(payload, "Invalid count_by_external payload.");
  const linkType = asEnum(typed.externalLinkType, LINK_TYPES, "externalLinkType", true);
  const externalRecordId = readTrimmedString(typed.externalRecordId);
  if (!externalRecordId) throw new SyncEndpointError("Missing externalRecordId.", 400);

  return {
    externalLinkType: linkType as CountExternalActionsByExternalDto["externalLinkType"],
    externalRecordId,
    direction: asEnum(typed.direction, DIRECTIONS, "direction", false),
  };
}

export function parseExternalActionsRequestBody(body: unknown): ExternalActionsRequestDto {
  const typed = asRecord(body, "Invalid request body.") as RequestBody;
  const operation = readTrimmedString(typed.operation);
  if (!operation) throw new SyncEndpointError("Missing operation.", 400);

  if (operation === "create") {
    return {
      operation,
      payload: parseCreatePayload(typed.payload, "create"),
    };
  }
  if (operation === "update") {
    return {
      operation,
      payload: parseUpdatePayload(typed.payload),
    };
  }
  if (operation === "find_inbound_by_identity") {
    return {
      operation,
      payload: parseFindInboundPayload(typed.payload),
    };
  }
  if (operation === "count_by_external") {
    return {
      operation,
      payload: parseCountPayload(typed.payload),
    };
  }

  throw new SyncEndpointError("Unsupported operation.", 400);
}

export function parseSyncExternalActionBody(body: unknown): SyncExternalActionRequestDto {
  const typed = asRecord(body, "Invalid request body.");
  const recordId = readTrimmedString(typed.recordId);
  if (!recordId) throw new SyncEndpointError("Missing recordId.", 400);

  const force = readOptionalBoolean(typed.force);
  const retryExternalActionId = readTrimmedString(typed.retryExternalActionId);
  const idempotencyKey = readTrimmedString(typed.idempotencyKey);

  return {
    recordId,
    force,
    retryExternalActionId,
    idempotencyKey,
  };
}

export function parseRetryExternalActionBody(body: unknown): RetryExternalActionRequestDto {
  const typed = asRecord(body, "Invalid request body.");
  const recordId = readTrimmedString(typed.recordId);
  if (!recordId) throw new SyncEndpointError("Missing recordId.", 400);

  return {
    recordId,
    force: readOptionalBoolean(typed.force),
    idempotencyKey: readTrimmedString(typed.idempotencyKey),
  };
}
