import { airtableSchema } from "@/config/airtable-schema";
import { SyncEndpointError } from "@/lib/errors";
import {
  airtableRequest,
  escapeAirtableFormulaString,
  parseAirtableError,
} from "@/lib/airtable/client";
import type {
  CountExternalActionsByExternalDto,
  CreateExternalActionDto,
  ExternalActionDirection,
  ExternalActionEntityType,
  ExternalActionRecordDto,
  ExternalActionStatus,
  ExternalActionType,
  ExternalActionWritebackStatus,
  FindInboundExternalActionDto,
  UpdateExternalActionDto,
} from "./dto";
import { syncSquareCustomer } from "@/lib/providers/square/customers";
import { resolveSquareContext } from "@/modules/clients";
import type { SquareCustomerSyncInput } from "@/lib/providers/square/types";

const EXTERNAL_ACTIONS_TABLE = airtableSchema.operations.tables.externalActions;
const PROVIDER_ACCOUNTS_TABLE = airtableSchema.operations.tables.providerAccounts;
const CLIENT_EXTERNALS_TABLE = airtableSchema.operations.tables.clientExternals;
const CLIENTS_TABLE = airtableSchema.operations.tables.clients;
const EXTERNAL_ACTION_FIELDS = airtableSchema.operations.fields.externalActions;
const PROVIDER_ACCOUNT_FIELDS = airtableSchema.operations.fields.providerAccounts;
const CLIENT_EXTERNAL_FIELDS = airtableSchema.operations.fields.clientExternals;
const CLIENT_FIELDS = airtableSchema.operations.fields.clients;

type AirtableRecord = {
  id: string;
  fields?: Record<string, unknown>;
};

export type ExternalActionSyncRecord = {
  recordId: string;
  externalEntityType: ExternalActionEntityType | null;
  actionType: ExternalActionType | null;
  direction: ExternalActionDirection | null;
  status: ExternalActionStatus | null;
  retryable: boolean | null;
  retryClassification: string | null;
  httpStatusCode: number | null;
  errorSummary: string | null;
  attemptNumber: number | null;
  provider: string | null;
  providerReferenceId: string | null;
  providerEventType: string | null;
  requestPayload: string | null;
  responsePayload: string | null;
  notes: string | null;
  providerAccountRecordId: string | null;
  orgIntegrationRecordId: string | null;
  orgIntegrationProviderAccountRecordId: string | null;
  clientExternalProviderAccountRecordId: string | null;
  cardExternalProviderAccountRecordId: string | null;
  orderExternalProviderAccountRecordId: string | null;
  refundExternalProviderAccountRecordId: string | null;
  clientExternalRecordId: string | null;
  clientExternalRecordIds: string[];
  cardExternalRecordId: string | null;
  cardExternalRecordIds: string[];
  orderExternalRecordId: string | null;
  orderExternalRecordIds: string[];
  refundExternalRecordId: string | null;
  refundExternalRecordIds: string[];
  writebackStatus: ExternalActionWritebackStatus | null;
  writebackRetryCount: number | null;
};

export type ProviderAccountSyncContext = {
  recordId: string;
  provider: string | null;
  accessTokenAlias: string | null;
  operationallyUsable: boolean;
};

export type ClientExternalSyncContext = {
  recordId: string;
  providerAccountRecordId: string | null;
  externalCustomerId: string | null;
  syncStatus: string | null;
  nameSnapshot: string | null;
  phoneSnapshot: string | null;
  emailSnapshot: string | null;
  matchPhoneNormalized: string | null;
  clientRecordId: string | null;
  clientCanonicalFirstName: string | null;
  clientCanonicalLastName: string | null;
  clientCanonicalName: string | null;
  clientCanonicalPhone: string | null;
  latestPhoneNormalized: string | null;
  provider: string | null;
  providerAccessTokenAlias: string | null;
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

function readFirstLinkedId(value: unknown): string | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const first = value[0];
  return typeof first === "string" && first.trim().length > 0 ? first.trim() : null;
}

function readLinkedIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const ids: string[] = [];
  for (const item of value) {
    if (typeof item === "string" && item.trim().length > 0) ids.push(item.trim());
  }
  return ids;
}

function readReferenceIds(value: unknown): string[] {
  if (Array.isArray(value)) return readLinkedIds(value);
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.startsWith("rec") ? [trimmed] : [];
  }
  return [];
}

function readNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function asDirection(value: unknown): ExternalActionDirection | null {
  const parsed = readString(value);
  if (parsed === "Inbound" || parsed === "Outbound") return parsed;
  return null;
}

function asStatus(value: unknown): ExternalActionStatus | null {
  const parsed = readString(value);
  if (parsed === "Pending" || parsed === "Succeeded" || parsed === "Failed" || parsed === "Ignored") {
    return parsed;
  }
  return null;
}

function asWritebackStatus(value: unknown): ExternalActionWritebackStatus | null {
  const parsed = readString(value);
  if (parsed === "Not Started" || parsed === "Pending" || parsed === "Succeeded" || parsed === "Failed") {
    return parsed;
  }
  return null;
}

function asActionType(value: unknown): ExternalActionType | null {
  const parsed = readString(value);
  if (
    parsed === "Create" ||
    parsed === "Send" ||
    parsed === "Refresh" ||
    parsed === "Void" ||
    parsed === "Import" ||
    parsed === "Webhook" ||
    parsed === "Reconcile" ||
    parsed === "Retry"
  ) {
    return parsed;
  }
  return null;
}

function asEntityType(value: unknown): ExternalActionEntityType | null {
  const parsed = readString(value);
  if (parsed === "Client" || parsed === "Card" || parsed === "Order" || parsed === "Refund") {
    return parsed;
  }
  return null;
}

function toRecord(record: AirtableRecord): ExternalActionRecordDto {
  const fields = record.fields ?? {};
  return {
    recordId: record.id,
    externalEntityType: asEntityType(fields[EXTERNAL_ACTION_FIELDS.externalEntityType]),
    actionType: asActionType(fields[EXTERNAL_ACTION_FIELDS.actionType]),
    direction: asDirection(fields[EXTERNAL_ACTION_FIELDS.direction]),
    status: asStatus(fields[EXTERNAL_ACTION_FIELDS.status]),
    attemptNumber: readNumber(fields[EXTERNAL_ACTION_FIELDS.attemptNumber]),
    provider: readString(fields[EXTERNAL_ACTION_FIELDS.provider]),
    providerReferenceId: readString(fields[EXTERNAL_ACTION_FIELDS.providerReferenceId]),
    providerAccountRecordId: readFirstLinkedId(fields[EXTERNAL_ACTION_FIELDS.providerAccount]),
  };
}

function toSyncRecord(record: AirtableRecord): ExternalActionSyncRecord {
  const fields = record.fields ?? {};
  const clientExternalRecordIds = readLinkedIds(fields[EXTERNAL_ACTION_FIELDS.clientExternal]);
  const cardExternalRecordIds = readLinkedIds(fields[EXTERNAL_ACTION_FIELDS.cardExternal]);
  const orderExternalRecordIds = readLinkedIds(fields[EXTERNAL_ACTION_FIELDS.orderExternal]);
  const refundExternalRecordIds = Array.from(
    new Set([
      ...readLinkedIds(fields[EXTERNAL_ACTION_FIELDS.refundExternal]),
      ...readLinkedIds(fields["Refund External"]),
      ...readLinkedIds(fields["Refund Externals"]),
    ]),
  );
  const orgIntegrationProviderAccountRecordIds = readReferenceIds(
    fields[EXTERNAL_ACTION_FIELDS.orgIntegrationProviderAccount],
  );
  const clientExternalProviderAccountRecordIds = readReferenceIds(
    fields[EXTERNAL_ACTION_FIELDS.clientExternalProviderAccount],
  );
  const cardExternalProviderAccountRecordIds = readReferenceIds(
    fields[EXTERNAL_ACTION_FIELDS.cardExternalProviderAccount],
  );
  const orderExternalProviderAccountRecordIds = readReferenceIds(
    fields[EXTERNAL_ACTION_FIELDS.orderExternalProviderAccount],
  );
  const refundExternalProviderAccountRecordIds = readReferenceIds(
    fields[EXTERNAL_ACTION_FIELDS.refundExternalProviderAccount],
  );

  return {
    recordId: record.id,
    externalEntityType: asEntityType(fields[EXTERNAL_ACTION_FIELDS.externalEntityType]),
    actionType: asActionType(fields[EXTERNAL_ACTION_FIELDS.actionType]),
    direction: asDirection(fields[EXTERNAL_ACTION_FIELDS.direction]),
    status: asStatus(fields[EXTERNAL_ACTION_FIELDS.status]),
    retryable: typeof fields[EXTERNAL_ACTION_FIELDS.retryable] === "boolean" ? (fields[EXTERNAL_ACTION_FIELDS.retryable] as boolean) : null,
    retryClassification: readString(fields[EXTERNAL_ACTION_FIELDS.retryClassification]),
    httpStatusCode: readNumber(fields[EXTERNAL_ACTION_FIELDS.httpStatusCode]),
    errorSummary: readString(fields[EXTERNAL_ACTION_FIELDS.errorSummary]),
    attemptNumber: readNumber(fields[EXTERNAL_ACTION_FIELDS.attemptNumber]),
    provider: readString(fields[EXTERNAL_ACTION_FIELDS.provider]),
    providerReferenceId: readString(fields[EXTERNAL_ACTION_FIELDS.providerReferenceId]),
    providerEventType: readString(fields[EXTERNAL_ACTION_FIELDS.providerEventType]),
    requestPayload: readString(fields[EXTERNAL_ACTION_FIELDS.requestPayload]),
    responsePayload: readString(fields[EXTERNAL_ACTION_FIELDS.responsePayload]),
    notes: readString(fields[EXTERNAL_ACTION_FIELDS.notes]),
    providerAccountRecordId: readFirstLinkedId(fields[EXTERNAL_ACTION_FIELDS.providerAccount]),
    orgIntegrationRecordId: readFirstLinkedId(fields[EXTERNAL_ACTION_FIELDS.orgIntegration]),
    orgIntegrationProviderAccountRecordId: orgIntegrationProviderAccountRecordIds[0] ?? null,
    clientExternalProviderAccountRecordId: clientExternalProviderAccountRecordIds[0] ?? null,
    cardExternalProviderAccountRecordId: cardExternalProviderAccountRecordIds[0] ?? null,
    orderExternalProviderAccountRecordId: orderExternalProviderAccountRecordIds[0] ?? null,
    refundExternalProviderAccountRecordId: refundExternalProviderAccountRecordIds[0] ?? null,
    clientExternalRecordId: clientExternalRecordIds[0] ?? null,
    clientExternalRecordIds,
    cardExternalRecordId: cardExternalRecordIds[0] ?? null,
    cardExternalRecordIds,
    orderExternalRecordId: orderExternalRecordIds[0] ?? null,
    orderExternalRecordIds,
    refundExternalRecordId: refundExternalRecordIds[0] ?? null,
    refundExternalRecordIds,
    writebackStatus: asWritebackStatus(fields[EXTERNAL_ACTION_FIELDS.writebackStatus]),
    writebackRetryCount: readNumber(fields[EXTERNAL_ACTION_FIELDS.writebackRetryCount]),
  };
}

function toFields(input: Partial<CreateExternalActionDto>): Record<string, unknown> {
  const fields: Record<string, unknown> = {};

  if (input.externalEntityType) fields[EXTERNAL_ACTION_FIELDS.externalEntityType] = input.externalEntityType;
  if (input.actionType) fields[EXTERNAL_ACTION_FIELDS.actionType] = input.actionType;
  if (input.direction) fields[EXTERNAL_ACTION_FIELDS.direction] = input.direction;
  if (input.triggerSource) fields[EXTERNAL_ACTION_FIELDS.triggerSource] = input.triggerSource;
  if (input.occurredAt) fields[EXTERNAL_ACTION_FIELDS.occurredAt] = input.occurredAt;
  if (input.status) fields[EXTERNAL_ACTION_FIELDS.status] = input.status;
  if (input.attemptNumber != null) fields[EXTERNAL_ACTION_FIELDS.attemptNumber] = input.attemptNumber;
  if (typeof input.retryable === "boolean") fields[EXTERNAL_ACTION_FIELDS.retryable] = input.retryable;
  if (input.retryClassification != null) {
    fields[EXTERNAL_ACTION_FIELDS.retryClassification] = input.retryClassification;
  }
  if (input.notes != null) fields[EXTERNAL_ACTION_FIELDS.notes] = input.notes;

  if (input.orgIntegrationRecordId) fields[EXTERNAL_ACTION_FIELDS.orgIntegration] = [input.orgIntegrationRecordId];
  if (input.providerAccountRecordId) fields[EXTERNAL_ACTION_FIELDS.providerAccount] = [input.providerAccountRecordId];
  if (input.clientExternalRecordId) fields[EXTERNAL_ACTION_FIELDS.clientExternal] = [input.clientExternalRecordId];
  if (input.cardExternalRecordId) fields[EXTERNAL_ACTION_FIELDS.cardExternal] = [input.cardExternalRecordId];
  if (input.orderExternalRecordId) fields[EXTERNAL_ACTION_FIELDS.orderExternal] = [input.orderExternalRecordId];
  if (input.refundExternalRecordId) {
    fields[EXTERNAL_ACTION_FIELDS.refundExternal] = [input.refundExternalRecordId];
    fields["Refund External"] = [input.refundExternalRecordId];
    fields["Refund Externals"] = [input.refundExternalRecordId];
  }

  if (input.provider) fields[EXTERNAL_ACTION_FIELDS.provider] = input.provider;
  if (input.providerEventType) fields[EXTERNAL_ACTION_FIELDS.providerEventType] = input.providerEventType;
  if (input.providerReferenceId) fields[EXTERNAL_ACTION_FIELDS.providerReferenceId] = input.providerReferenceId;
  if (input.httpStatusCode != null) fields[EXTERNAL_ACTION_FIELDS.httpStatusCode] = input.httpStatusCode;
  if (input.errorSummary != null) fields[EXTERNAL_ACTION_FIELDS.errorSummary] = input.errorSummary;

  if (input.requestPayload != null) fields[EXTERNAL_ACTION_FIELDS.requestPayload] = input.requestPayload;
  if (input.responsePayload != null) fields[EXTERNAL_ACTION_FIELDS.responsePayload] = input.responsePayload;
  if (input.rawProviderPayload != null) fields[EXTERNAL_ACTION_FIELDS.rawProviderPayload] = input.rawProviderPayload;

  if (input.writebackStatus) fields[EXTERNAL_ACTION_FIELDS.writebackStatus] = input.writebackStatus;
  if (input.writebackSucceededAt) fields[EXTERNAL_ACTION_FIELDS.writebackSucceededAt] = input.writebackSucceededAt;
  if (input.writebackError != null) fields[EXTERNAL_ACTION_FIELDS.writebackError] = input.writebackError;
  if (input.writebackRetryCount != null) fields[EXTERNAL_ACTION_FIELDS.writebackRetryCount] = input.writebackRetryCount;
  if (input.writebackLastAttemptAt) fields[EXTERNAL_ACTION_FIELDS.writebackLastAttemptAt] = input.writebackLastAttemptAt;

  return fields;
}

function getRemovableFieldFromAirtableError(message: string): string | null {
  const missingFieldMatch = message.match(/Unknown field name: "([^"]+)"/);
  if (missingFieldMatch?.[1]) return missingFieldMatch[1];

  const computedFieldMatch = message.match(
    /Field "([^"]+)" cannot accept a value because the field is computed/i,
  );
  if (computedFieldMatch?.[1]) return computedFieldMatch[1];

  return null;
}

async function createExternalAction(input: CreateExternalActionDto): Promise<string> {
  const fields = toFields(input);
  const optionalFields = new Set(Object.keys(fields));
  let nextFields = { ...fields };

  while (true) {
    const response = await airtableRequest(encodeURIComponent(EXTERNAL_ACTIONS_TABLE), {
      method: "POST",
      body: JSON.stringify({ fields: nextFields }),
    });

    if (response.ok) {
      const body = (await response.json()) as AirtableRecord;
      return body.id;
    }

    const message = await parseAirtableError(response);
    const missingField = getRemovableFieldFromAirtableError(message);

    if (missingField && optionalFields.has(missingField) && missingField in nextFields) {
      const reduced: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(nextFields)) {
        if (key === missingField) continue;
        reduced[key] = value;
      }
      nextFields = reduced;
      continue;
    }

    throw new SyncEndpointError(`Failed to create External Action: ${message}`, 502);
  }
}

async function updateExternalAction(input: UpdateExternalActionDto): Promise<void> {
  const { recordId, ...patch } = input;
  const fields = toFields(patch);
  if (Object.keys(fields).length === 0) return;

  const path = `${encodeURIComponent(EXTERNAL_ACTIONS_TABLE)}/${encodeURIComponent(recordId)}`;
  const optionalFields = new Set(Object.keys(fields));
  let nextFields = { ...fields };

  while (true) {
    const response = await airtableRequest(path, {
      method: "PATCH",
      body: JSON.stringify({ fields: nextFields }),
    });
    if (response.ok) return;

    const message = await parseAirtableError(response);
    const missingField = getRemovableFieldFromAirtableError(message);

    if (missingField && optionalFields.has(missingField) && missingField in nextFields) {
      const reduced: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(nextFields)) {
        if (key === missingField) continue;
        reduced[key] = value;
      }
      nextFields = reduced;
      if (Object.keys(nextFields).length === 0) return;
      continue;
    }

    throw new SyncEndpointError(`Failed to update External Action: ${message}`, 502);
  }
}

async function getExternalAction(recordId: string): Promise<ExternalActionSyncRecord> {
  const response = await airtableRequest(
    `${encodeURIComponent(EXTERNAL_ACTIONS_TABLE)}/${encodeURIComponent(recordId)}`,
    { method: "GET" },
  );
  if (response.status === 404) {
    throw new SyncEndpointError("External Action not found.", 404);
  }
  if (!response.ok) {
    const message = await parseAirtableError(response);
    throw new SyncEndpointError(`Failed to load External Action: ${message}`, 502);
  }
  return toSyncRecord((await response.json()) as AirtableRecord);
}

function isProviderAccountOperationallyUsable(fields: Record<string, unknown>): boolean {
  const enabled = fields[PROVIDER_ACCOUNT_FIELDS.enabled];
  if (typeof enabled === "boolean" && !enabled) return false;

  const operational = readString(fields[PROVIDER_ACCOUNT_FIELDS.operationalStatus])?.toLowerCase();
  if (operational && ["disabled", "inactive", "failed", "archived", "off"].includes(operational)) {
    return false;
  }
  const status = readString(fields[PROVIDER_ACCOUNT_FIELDS.status])?.toLowerCase();
  if (status && ["disabled", "inactive", "failed", "archived", "off"].includes(status)) {
    return false;
  }
  return true;
}

async function getProviderAccount(recordId: string): Promise<ProviderAccountSyncContext> {
  const response = await airtableRequest(
    `${encodeURIComponent(PROVIDER_ACCOUNTS_TABLE)}/${encodeURIComponent(recordId)}`,
    { method: "GET" },
  );
  if (response.status === 404) throw new SyncEndpointError("Provider Account not found.", 404);
  if (!response.ok) {
    const message = await parseAirtableError(response);
    throw new SyncEndpointError(`Failed to load Provider Account: ${message}`, 502);
  }
  const record = (await response.json()) as AirtableRecord;
  const fields = record.fields ?? {};
  return {
    recordId: record.id,
    provider: readString(fields[PROVIDER_ACCOUNT_FIELDS.provider]),
    accessTokenAlias:
      readString(fields[PROVIDER_ACCOUNT_FIELDS.apiCredentialAlias]) ??
      readString(fields[PROVIDER_ACCOUNT_FIELDS.accessTokenAlias]) ??
      readString(fields[PROVIDER_ACCOUNT_FIELDS.accessToken]),
    operationallyUsable: isProviderAccountOperationallyUsable(fields),
  };
}

function readFirstStringFromFields(fields: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = readString(fields[key]);
    if (value) return value;
  }
  return null;
}

async function getClientExternal(recordId: string): Promise<ClientExternalSyncContext> {
  const clientExternalResponse = await airtableRequest(
    `${encodeURIComponent(CLIENT_EXTERNALS_TABLE)}/${encodeURIComponent(recordId)}`,
    { method: "GET" },
  );
  if (clientExternalResponse.status === 404) {
    throw new SyncEndpointError("Client External not found.", 404);
  }
  if (!clientExternalResponse.ok) {
    const message = await parseAirtableError(clientExternalResponse);
    throw new SyncEndpointError(`Failed to load Client External: ${message}`, 502);
  }

  const clientExternalRecord = (await clientExternalResponse.json()) as AirtableRecord;
  const fields = clientExternalRecord.fields ?? {};
  const clientRecordId = readFirstLinkedId(fields[CLIENT_EXTERNAL_FIELDS.client]);
  const providerAccountRecordId = readFirstLinkedId(fields[CLIENT_EXTERNAL_FIELDS.providerAccount]);

  let clientCanonicalFirstName: string | null = null;
  let clientCanonicalLastName: string | null = null;
  let clientCanonicalName: string | null = null;
  let clientCanonicalPhone: string | null = null;

  if (clientRecordId) {
    const clientResponse = await airtableRequest(
      `${encodeURIComponent(CLIENTS_TABLE)}/${encodeURIComponent(clientRecordId)}`,
      { method: "GET" },
    );
    if (clientResponse.ok) {
      const client = (await clientResponse.json()) as AirtableRecord;
      const clientFields = client.fields ?? {};
      clientCanonicalFirstName = readString(clientFields[CLIENT_FIELDS.firstName]);
      clientCanonicalLastName = readString(clientFields[CLIENT_FIELDS.lastName]);
      clientCanonicalName = readString(clientFields[CLIENT_FIELDS.clientName]);
      clientCanonicalPhone = readFirstStringFromFields(clientFields, [
        CLIENT_FIELDS.latestPhoneNormalized,
        CLIENT_FIELDS.latestPhoneNormalizedLegacy,
      ]);
    }
  }

  return {
    recordId: clientExternalRecord.id,
    providerAccountRecordId,
    externalCustomerId: readString(fields[CLIENT_EXTERNAL_FIELDS.externalCustomerId]),
    syncStatus: readString(fields[CLIENT_EXTERNAL_FIELDS.syncStatus]),
    nameSnapshot: readString(fields[CLIENT_EXTERNAL_FIELDS.nameSnapshot]),
    phoneSnapshot: readString(fields[CLIENT_EXTERNAL_FIELDS.phoneSnapshot]),
    emailSnapshot: readString(fields[CLIENT_EXTERNAL_FIELDS.emailSnapshot]),
    matchPhoneNormalized: readString(fields[CLIENT_EXTERNAL_FIELDS.matchPhoneNormalized]),
    clientRecordId,
    clientCanonicalFirstName,
    clientCanonicalLastName,
    clientCanonicalName,
      clientCanonicalPhone,
      latestPhoneNormalized: readFirstStringFromFields(fields, [
        CLIENT_EXTERNAL_FIELDS.latestPhoneNormalized,
        CLIENT_EXTERNAL_FIELDS.latestPhoneNormalizedLegacy,
      ]),
    provider: readString(fields[CLIENT_EXTERNAL_FIELDS.provider]),
    providerAccessTokenAlias: null,
  };
}

async function writeClientExternalSyncResult(input: {
  recordId: string;
  externalCustomerId?: string | null;
  syncStatus: "Synced" | "Failed";
  syncError?: string;
  nameSnapshot?: string | null;
  phoneSnapshot?: string | null;
}): Promise<void> {
  const fields: Record<string, unknown> = {
    [CLIENT_EXTERNAL_FIELDS.syncStatus]: input.syncStatus,
  };
  if (input.syncStatus === "Synced") {
    fields[CLIENT_EXTERNAL_FIELDS.syncError] = "";
    fields[CLIENT_EXTERNAL_FIELDS.lastSyncedAt] = new Date().toISOString();
    fields[CLIENT_EXTERNAL_FIELDS.lastSuccessfulCallAt] = new Date().toISOString();
    fields[CLIENT_EXTERNAL_FIELDS.lastErrorAt] = "";
  } else {
    fields[CLIENT_EXTERNAL_FIELDS.syncError] = input.syncError ?? "External Action sync failed.";
    fields[CLIENT_EXTERNAL_FIELDS.lastErrorAt] = new Date().toISOString();
  }
  if (input.externalCustomerId) fields[CLIENT_EXTERNAL_FIELDS.externalCustomerId] = input.externalCustomerId;
  if (input.nameSnapshot) fields[CLIENT_EXTERNAL_FIELDS.nameSnapshot] = input.nameSnapshot;
  if (input.phoneSnapshot) fields[CLIENT_EXTERNAL_FIELDS.phoneSnapshot] = input.phoneSnapshot;

  const response = await airtableRequest(
    `${encodeURIComponent(CLIENT_EXTERNALS_TABLE)}/${encodeURIComponent(input.recordId)}`,
    {
      method: "PATCH",
      body: JSON.stringify({ fields }),
    },
  );
  if (!response.ok) {
    const message = await parseAirtableError(response);
    throw new SyncEndpointError(`Failed to update Client External from action sync: ${message}`, 502);
  }
}

async function countSuccessfulActionsByScope(input: {
  providerReferenceId: string;
  providerAccountRecordId?: string | null;
  externalEntityType: ExternalActionEntityType;
  actionType: ExternalActionType;
  targetField: "Client External" | "Card External" | "Order External" | "Refund External";
  targetRecordId: string;
  excludeRecordId?: string;
}): Promise<number> {
  const clauses: string[] = [
    `{${EXTERNAL_ACTION_FIELDS.direction}}='Outbound'`,
    `{${EXTERNAL_ACTION_FIELDS.status}}='Succeeded'`,
    `{${EXTERNAL_ACTION_FIELDS.externalEntityType}}='${escapeAirtableFormulaString(input.externalEntityType)}'`,
    `{${EXTERNAL_ACTION_FIELDS.actionType}}='${escapeAirtableFormulaString(input.actionType)}'`,
    `{${EXTERNAL_ACTION_FIELDS.providerReferenceId}}='${escapeAirtableFormulaString(input.providerReferenceId)}'`,
    `FIND('${escapeAirtableFormulaString(input.targetRecordId)}', ARRAYJOIN({${input.targetField}}))`,
  ];
  if (input.providerAccountRecordId) {
    clauses.push(
      `FIND('${escapeAirtableFormulaString(input.providerAccountRecordId)}', ARRAYJOIN({${EXTERNAL_ACTION_FIELDS.providerAccount}}))`,
    );
  }
  if (input.excludeRecordId) {
    clauses.push(`RECORD_ID()!='${escapeAirtableFormulaString(input.excludeRecordId)}'`);
  }
  const formula = `AND(${clauses.join(",")})`;
  let count = 0;
  let offset: string | undefined;
  do {
    const params = new URLSearchParams({ pageSize: "100", filterByFormula: formula });
    if (offset) params.set("offset", offset);
    const response = await airtableRequest(
      `${encodeURIComponent(EXTERNAL_ACTIONS_TABLE)}?${params.toString()}`,
      { method: "GET" },
    );
    if (!response.ok) {
      const message = await parseAirtableError(response);
      throw new SyncEndpointError(`Failed to check action idempotency scope: ${message}`, 502);
    }
    const body = (await response.json()) as { records?: AirtableRecord[]; offset?: string };
    count += body.records?.length ?? 0;
    offset = body.offset;
  } while (offset);
  return count;
}

async function findRetryActionByProviderReferenceId(
  providerReferenceId: string,
): Promise<ExternalActionSyncRecord | null> {
  const formula =
    `AND(` +
    `{${EXTERNAL_ACTION_FIELDS.actionType}}='Retry',` +
    `{${EXTERNAL_ACTION_FIELDS.providerReferenceId}}='${escapeAirtableFormulaString(providerReferenceId)}'` +
    `)`;
  const params = new URLSearchParams({
    pageSize: "1",
    filterByFormula: formula,
    "sort[0][field]": EXTERNAL_ACTION_FIELDS.createdAt,
    "sort[0][direction]": "desc",
  });
  const response = await airtableRequest(
    `${encodeURIComponent(EXTERNAL_ACTIONS_TABLE)}?${params.toString()}`,
    { method: "GET" },
  );
  if (!response.ok) {
    const message = await parseAirtableError(response);
    throw new SyncEndpointError(`Failed to query retry External Action by provider reference: ${message}`, 502);
  }
  const body = (await response.json()) as { records?: AirtableRecord[] };
  const first = body.records?.[0];
  return first ? toSyncRecord(first) : null;
}

async function runSquareClientActionSync(input: {
  clientExternal: ClientExternalSyncContext;
  providerAccount: ProviderAccountSyncContext;
}): Promise<{
  externalCustomerId: string;
  providerMode: "created" | "updated" | "verified";
  providerPath: "create" | "update" | "verify" | "matched";
  squarePhoneNumber: string | null;
  squareGivenName: string | null;
  squareFamilyName: string | null;
  squareNickname: string | null;
}> {
  const context = resolveSquareContext({
    recordId: input.clientExternal.recordId,
    externalCustomerId: input.clientExternal.externalCustomerId,
    providerAccountId: input.providerAccount.recordId,
    clientId: input.clientExternal.clientRecordId,
    clientCanonicalName: input.clientExternal.clientCanonicalName,
    clientCanonicalFirstName: input.clientExternal.clientCanonicalFirstName,
    clientCanonicalLastName: input.clientExternal.clientCanonicalLastName,
    latestPhoneNormalized: input.clientExternal.latestPhoneNormalized,
    clientCanonicalPhone: input.clientExternal.clientCanonicalPhone,
    nameSnapshot: input.clientExternal.nameSnapshot,
    phoneSnapshot: input.clientExternal.phoneSnapshot,
    emailSnapshot: input.clientExternal.emailSnapshot,
    matchPhoneNormalized: input.clientExternal.matchPhoneNormalized,
    syncStatus: input.clientExternal.syncStatus,
    missingRequiredLinks: null,
    provider: input.providerAccount.provider ?? input.clientExternal.provider,
    providerAccessTokenAlias:
      input.providerAccount.accessTokenAlias ?? input.clientExternal.providerAccessTokenAlias,
    externalActionIds: [],
  });

  const payload: SquareCustomerSyncInput = {
    recordReferenceId: input.clientExternal.recordId,
    externalCustomerId: input.clientExternal.externalCustomerId,
    canonicalFirstName: input.clientExternal.clientCanonicalFirstName,
    canonicalLastName: input.clientExternal.clientCanonicalLastName,
    nameSnapshot: input.clientExternal.nameSnapshot,
    phoneSnapshot:
      input.clientExternal.phoneSnapshot ??
      input.clientExternal.latestPhoneNormalized ??
      input.clientExternal.clientCanonicalPhone,
    matchPhoneNormalized: input.clientExternal.matchPhoneNormalized,
    emailSnapshot: input.clientExternal.emailSnapshot,
  };

  const result = await syncSquareCustomer(payload, context);
  return {
    externalCustomerId: result.externalCustomerId,
    providerMode: result.mode,
    providerPath: result.path,
    squarePhoneNumber: result.squarePhoneNumber,
    squareGivenName: result.squareGivenName,
    squareFamilyName: result.squareFamilyName,
    squareNickname: result.squareNickname,
  };
}

async function findInboundExternalActionByIdentity(
  input: FindInboundExternalActionDto,
): Promise<ExternalActionRecordDto | null> {
  const escapedProvider = escapeAirtableFormulaString(input.provider);
  const escapedReference = escapeAirtableFormulaString(input.providerReferenceId);
  const providerAccountClause = input.providerAccountRecordId
    ? `, FIND('${escapeAirtableFormulaString(input.providerAccountRecordId)}', ARRAYJOIN({${EXTERNAL_ACTION_FIELDS.providerAccount}}))`
    : "";
  const formula =
    `AND(` +
    `{${EXTERNAL_ACTION_FIELDS.direction}}='Inbound', ` +
    `{${EXTERNAL_ACTION_FIELDS.provider}}='${escapedProvider}', ` +
    `{${EXTERNAL_ACTION_FIELDS.providerReferenceId}}='${escapedReference}'` +
    `${providerAccountClause}` +
    `)`;

  const params = new URLSearchParams({ pageSize: "1", filterByFormula: formula });
  const response = await airtableRequest(
    `${encodeURIComponent(EXTERNAL_ACTIONS_TABLE)}?${params.toString()}`,
    { method: "GET" },
  );

  if (!response.ok) {
    const message = await parseAirtableError(response);
    throw new SyncEndpointError(`Failed to find inbound External Action: ${message}`, 502);
  }

  const body = (await response.json()) as { records?: AirtableRecord[] };
  const first = body.records?.[0];
  if (!first) return null;
  return toRecord(first);
}

function directionClause(direction?: ExternalActionDirection): string {
  if (!direction) return "";
  return `, {${EXTERNAL_ACTION_FIELDS.direction}}='${direction}'`;
}

async function countExternalActionsByExternalLink(input: CountExternalActionsByExternalDto): Promise<number> {
  const escapedRecordId = escapeAirtableFormulaString(input.externalRecordId);
  const formula = `AND(FIND('${escapedRecordId}', ARRAYJOIN({${input.externalLinkType}}))${directionClause(input.direction)})`;
  let offset: string | undefined;
  let count = 0;

  do {
    const params = new URLSearchParams({ pageSize: "100", filterByFormula: formula });
    if (offset) params.set("offset", offset);

    const response = await airtableRequest(
      `${encodeURIComponent(EXTERNAL_ACTIONS_TABLE)}?${params.toString()}`,
      { method: "GET" },
    );

    if (!response.ok) {
      const message = await parseAirtableError(response);
      throw new SyncEndpointError(`Failed to count External Actions: ${message}`, 502);
    }

    const body = (await response.json()) as { records?: AirtableRecord[]; offset?: string };
    count += body.records?.length ?? 0;
    offset = body.offset;
  } while (offset);

  return count;
}

export const externalActionsRepo = {
  createExternalAction,
  updateExternalAction,
  findInboundExternalActionByIdentity,
  countExternalActionsByExternalLink,
  getExternalAction,
  getProviderAccount,
  getClientExternal,
  writeClientExternalSyncResult,
  countSuccessfulActionsByScope,
  findRetryActionByProviderReferenceId,
  runSquareClientActionSync,
  toSyncRecord,
  asWritebackStatus,
  readLinkedIds,
};
