import { SyncEndpointError } from "@/lib/errors";
import type {
  CreateProviderAccountDto,
  FindProviderAccountByKeyDto,
  ProviderAccountsRequestDto,
  ProviderAccountStatus,
  UpdateProviderAccountDto,
} from "./dto";

type AnyRecord = Record<string, unknown>;

const STATUSES = new Set<ProviderAccountStatus>(["Setup", "Active", "Paused", "Disabled"]);

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

function parseCreatePayload(payload: unknown): CreateProviderAccountDto {
  const typed = asRecord(payload, "Invalid create payload.");
  const provider = readTrimmedString(typed.provider);
  const providerAccountName = readTrimmedString(typed.providerAccountName);
  const providerAccountId = readTrimmedString(typed.providerAccountId);

  if (!provider) throw new SyncEndpointError("Missing provider.", 400);
  if (!providerAccountName) throw new SyncEndpointError("Missing providerAccountName.", 400);
  if (!providerAccountId) throw new SyncEndpointError("Missing providerAccountId.", 400);

  return {
    provider,
    providerAccountName,
    providerAccountId,
    status: asEnum(typed.status, STATUSES, "status", false),
    notes: readTrimmedString(typed.notes),
    apiBaseUrl: readTrimmedString(typed.apiBaseUrl),
    apiCredentialAlias: readTrimmedString(typed.apiCredentialAlias),
    webhookSigningSecretAlias: readTrimmedString(typed.webhookSigningSecretAlias),
    webhookCredentialId: readTrimmedString(typed.webhookCredentialId),
  };
}

function parseUpdatePayload(payload: unknown): UpdateProviderAccountDto {
  const typed = asRecord(payload, "Invalid update payload.");
  const recordId = readTrimmedString(typed.recordId);
  if (!recordId) throw new SyncEndpointError("Missing recordId.", 400);

  return {
    recordId,
    provider: readTrimmedString(typed.provider),
    providerAccountName: readTrimmedString(typed.providerAccountName),
    providerAccountId: readTrimmedString(typed.providerAccountId),
    status: asEnum(typed.status, STATUSES, "status", false),
    notes: readTrimmedString(typed.notes),
    apiBaseUrl: readTrimmedString(typed.apiBaseUrl),
    apiCredentialAlias: readTrimmedString(typed.apiCredentialAlias),
    webhookSigningSecretAlias: readTrimmedString(typed.webhookSigningSecretAlias),
    webhookCredentialId: readTrimmedString(typed.webhookCredentialId),
  };
}

function parseGetPayload(payload: unknown): { recordId: string } {
  const typed = asRecord(payload, "Invalid get payload.");
  const recordId = readTrimmedString(typed.recordId);
  if (!recordId) throw new SyncEndpointError("Missing recordId.", 400);
  return { recordId };
}

function parseFindByKeyPayload(payload: unknown): FindProviderAccountByKeyDto {
  const typed = asRecord(payload, "Invalid find_by_key payload.");
  const provider = readTrimmedString(typed.provider);
  const providerAccountId = readTrimmedString(typed.providerAccountId);
  if (!provider) throw new SyncEndpointError("Missing provider.", 400);
  if (!providerAccountId) throw new SyncEndpointError("Missing providerAccountId.", 400);

  return { provider, providerAccountId };
}

export function parseProviderAccountsRequestBody(body: unknown): ProviderAccountsRequestDto {
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
  if (operation === "find_by_key") {
    return { operation, payload: parseFindByKeyPayload(typed.payload) };
  }

  throw new SyncEndpointError("Unsupported operation.", 400);
}
