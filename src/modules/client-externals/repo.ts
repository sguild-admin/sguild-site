import { airtableSchema } from "@/config/airtable-schema";
import { SyncEndpointError } from "@/lib/errors";
import {
  airtableRequest,
  escapeAirtableFormulaString,
  parseAirtableError,
} from "@/lib/airtable/client";
import type {
  ClientExternalRecordDto,
  CreateClientExternalDto,
  FindClientExternalByContextDto,
  UpdateClientExternalDto,
} from "./dto";

const CLIENT_EXTERNALS_TABLE = airtableSchema.operations.tables.clientExternals;
const CLIENT_EXTERNAL_FIELDS = airtableSchema.operations.fields.clientExternals;

type AirtableRecord = {
  id: string;
  fields?: Record<string, unknown>;
};

function readString(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (Array.isArray(value)) {
    for (const item of value) {
      const parsed = readString(item);
      if (parsed) return parsed;
    }
  }
  return null;
}

function readLinkedIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const ids: string[] = [];
  for (const item of value) {
    if (typeof item === "string" && item.trim().length > 0) ids.push(item.trim());
  }
  return ids;
}

function readFirstLinkedId(value: unknown): string | null {
  const ids = readLinkedIds(value);
  return ids[0] ?? null;
}

function asStatus(value: string | null): ClientExternalRecordDto["status"] {
  if (value === "Active" || value === "Inactive" || value === "Failed" || value === "Pending") return value;
  return null;
}

function asSyncStatus(value: string | null): ClientExternalRecordDto["syncStatus"] {
  if (value === "Not Synced" || value === "Pending" || value === "Synced" || value === "Failed") return value;
  return null;
}

function deriveException(record: {
  clientRecordId: string | null;
  providerAccountRecordId: string | null;
  externalCustomerId: string | null;
  syncStatus: ClientExternalRecordDto["syncStatus"];
}): { hasException: boolean; exceptionReason: string | null } {
  if (!record.clientRecordId || !record.providerAccountRecordId) {
    return { hasException: true, exceptionReason: "Missing Required Links" };
  }
  if (record.syncStatus === "Synced" && !record.externalCustomerId) {
    return { hasException: true, exceptionReason: "Missing External Customer ID" };
  }
  if (record.syncStatus === "Failed") {
    return { hasException: true, exceptionReason: "Sync Failed" };
  }
  return { hasException: false, exceptionReason: null };
}

function toRecord(record: AirtableRecord): ClientExternalRecordDto {
  const fields = record.fields ?? {};
  const clientRecordId = readFirstLinkedId(fields[CLIENT_EXTERNAL_FIELDS.client]);
  const providerAccountRecordId = readFirstLinkedId(fields[CLIENT_EXTERNAL_FIELDS.providerAccount]);
  const externalCustomerId = readString(fields[CLIENT_EXTERNAL_FIELDS.externalCustomerId]);
  const syncStatus = asSyncStatus(readString(fields[CLIENT_EXTERNAL_FIELDS.syncStatus]));

  const exception = deriveException({
    clientRecordId,
    providerAccountRecordId,
    externalCustomerId,
    syncStatus,
  });

  return {
    recordId: record.id,
    externalCustomerId,
    status: asStatus(readString(fields[CLIENT_EXTERNAL_FIELDS.status])),
    notes: readString(fields[CLIENT_EXTERNAL_FIELDS.notes]),
    clientRecordId,
    providerAccountRecordId,
    provider: readString(fields[CLIENT_EXTERNAL_FIELDS.provider]),
    externalActionIds: readLinkedIds(fields[CLIENT_EXTERNAL_FIELDS.externalActions]),
    cardExternalIds: readLinkedIds(fields[CLIENT_EXTERNAL_FIELDS.cardExternals]),
    nameSnapshot: readString(fields[CLIENT_EXTERNAL_FIELDS.nameSnapshot]),
    phoneSnapshot: readString(fields[CLIENT_EXTERNAL_FIELDS.phoneSnapshot]),
    syncStatus,
    syncError: readString(fields[CLIENT_EXTERNAL_FIELDS.syncError]),
    lastSyncedAt: readString(fields[CLIENT_EXTERNAL_FIELDS.lastSyncedAt]),
    lastSuccessfulCallAt: readString(fields[CLIENT_EXTERNAL_FIELDS.lastSuccessfulCallAt]),
    lastErrorAt: readString(fields[CLIENT_EXTERNAL_FIELDS.lastErrorAt]),
    hasException: exception.hasException,
    exceptionReason: exception.exceptionReason,
  };
}

function toFields(input: Partial<CreateClientExternalDto | UpdateClientExternalDto>): Record<string, unknown> {
  const fields: Record<string, unknown> = {};

  if ("clientRecordId" in input && input.clientRecordId) fields[CLIENT_EXTERNAL_FIELDS.client] = [input.clientRecordId];
  if ("providerAccountRecordId" in input && input.providerAccountRecordId) {
    fields[CLIENT_EXTERNAL_FIELDS.providerAccount] = [input.providerAccountRecordId];
  }

  if (input.externalCustomerId != null) fields[CLIENT_EXTERNAL_FIELDS.externalCustomerId] = input.externalCustomerId;
  if (input.status) fields[CLIENT_EXTERNAL_FIELDS.status] = input.status;
  if (input.notes != null) fields[CLIENT_EXTERNAL_FIELDS.notes] = input.notes;

  if (input.nameSnapshot != null) fields[CLIENT_EXTERNAL_FIELDS.nameSnapshot] = input.nameSnapshot;
  if (input.phoneSnapshot != null) fields[CLIENT_EXTERNAL_FIELDS.phoneSnapshot] = input.phoneSnapshot;

  if (input.syncStatus) fields[CLIENT_EXTERNAL_FIELDS.syncStatus] = input.syncStatus;
  if (input.syncError != null) fields[CLIENT_EXTERNAL_FIELDS.syncError] = input.syncError;
  if (input.lastSyncedAt) fields[CLIENT_EXTERNAL_FIELDS.lastSyncedAt] = input.lastSyncedAt;
  if (input.lastSuccessfulCallAt) fields[CLIENT_EXTERNAL_FIELDS.lastSuccessfulCallAt] = input.lastSuccessfulCallAt;
  if (input.lastErrorAt) fields[CLIENT_EXTERNAL_FIELDS.lastErrorAt] = input.lastErrorAt;

  return fields;
}

async function createClientExternal(input: CreateClientExternalDto): Promise<ClientExternalRecordDto> {
  const fields = toFields(input);

  const response = await airtableRequest(encodeURIComponent(CLIENT_EXTERNALS_TABLE), {
    method: "POST",
    body: JSON.stringify({ fields }),
  });

  if (!response.ok) {
    const message = await parseAirtableError(response);
    throw new SyncEndpointError(`Failed to create Client External: ${message}`, 502);
  }

  return toRecord((await response.json()) as AirtableRecord);
}

async function updateClientExternal(input: UpdateClientExternalDto): Promise<ClientExternalRecordDto> {
  const { recordId, ...rest } = input;
  const fields = toFields(rest);
  if (Object.keys(fields).length === 0) {
    return getClientExternal(recordId);
  }

  const response = await airtableRequest(
    `${encodeURIComponent(CLIENT_EXTERNALS_TABLE)}/${encodeURIComponent(recordId)}`,
    {
      method: "PATCH",
      body: JSON.stringify({ fields }),
    },
  );

  if (response.status === 404) {
    throw new SyncEndpointError("Client External not found.", 404);
  }
  if (!response.ok) {
    const message = await parseAirtableError(response);
    throw new SyncEndpointError(`Failed to update Client External: ${message}`, 502);
  }

  return toRecord((await response.json()) as AirtableRecord);
}

async function getClientExternal(recordId: string): Promise<ClientExternalRecordDto> {
  const response = await airtableRequest(
    `${encodeURIComponent(CLIENT_EXTERNALS_TABLE)}/${encodeURIComponent(recordId)}`,
    { method: "GET" },
  );

  if (response.status === 404) {
    throw new SyncEndpointError("Client External not found.", 404);
  }
  if (!response.ok) {
    const message = await parseAirtableError(response);
    throw new SyncEndpointError(`Failed to get Client External: ${message}`, 502);
  }

  return toRecord((await response.json()) as AirtableRecord);
}

async function findClientExternalByContext(
  input: FindClientExternalByContextDto,
): Promise<ClientExternalRecordDto | null> {
  const escapedClientId = escapeAirtableFormulaString(input.clientRecordId);
  const escapedProviderAccountId = escapeAirtableFormulaString(input.providerAccountRecordId);
  const formula =
    `AND(` +
    `FIND('${escapedClientId}', ARRAYJOIN({${CLIENT_EXTERNAL_FIELDS.client}})), ` +
    `FIND('${escapedProviderAccountId}', ARRAYJOIN({${CLIENT_EXTERNAL_FIELDS.providerAccount}}))` +
    `)`;

  const params = new URLSearchParams({
    pageSize: "2",
    filterByFormula: formula,
  });

  const response = await airtableRequest(
    `${encodeURIComponent(CLIENT_EXTERNALS_TABLE)}?${params.toString()}`,
    { method: "GET" },
  );

  if (!response.ok) {
    const message = await parseAirtableError(response);
    throw new SyncEndpointError(`Failed to find Client External by context: ${message}`, 502);
  }

  const body = (await response.json()) as { records?: AirtableRecord[] };
  const records = body.records ?? [];
  if (records.length === 0) return null;
  if (records.length > 1) {
    throw new SyncEndpointError("Multiple Client Externals found for same Client + Provider Account context.", 409);
  }

  return toRecord(records[0]);
}

export const clientExternalsRepo = {
  createClientExternal,
  updateClientExternal,
  getClientExternal,
  findClientExternalByContext,
};
