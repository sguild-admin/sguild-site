import { airtableSchema } from "@/config/airtable-schema";
import { SyncEndpointError } from "@/lib/errors";
import {
  airtableRequest,
  escapeAirtableFormulaString,
  parseAirtableError,
} from "@/lib/airtable/client";
import type {
  CreateProviderAccountDto,
  FindProviderAccountByKeyDto,
  ProviderAccountRecordDto,
  UpdateProviderAccountDto,
} from "./dto";

const PROVIDER_ACCOUNTS_TABLE = airtableSchema.operations.tables.providerAccounts;
const PROVIDER_ACCOUNT_FIELDS = airtableSchema.operations.fields.providerAccounts;

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

function readNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const parsed = readNumber(item);
      if (parsed != null) return parsed;
    }
  }
  return null;
}

function asStatus(value: string | null): ProviderAccountRecordDto["status"] {
  if (value === "Setup" || value === "Active" || value === "Paused" || value === "Disabled") return value;
  return null;
}

function toFlag(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value > 0 ? 1 : 0;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "string") {
    const n = Number(value.trim());
    if (Number.isFinite(n)) return n > 0 ? 1 : 0;
  }
  return 0;
}

function deriveConfigStatus(record: {
  provider: string | null;
  providerAccountId: string | null;
  apiCredentialAlias: string | null;
  apiBaseUrl: string | null;
  webhookSigningSecretAlias: string | null;
  webhookCredentialId: string | null;
  usesWebhooks: number;
}): string {
  if (!record.provider) return "Missing Provider";
  if (!record.providerAccountId) return "Missing Provider Account ID";
  if (!record.apiCredentialAlias) return "Missing API Credential Alias";

  const hasWebhookConfig = Boolean(record.webhookSigningSecretAlias && record.webhookCredentialId);
  if (record.usesWebhooks === 1 && !hasWebhookConfig) return "Webhook Config Incomplete";
  if ((record.webhookSigningSecretAlias && !record.webhookCredentialId) || (!record.webhookSigningSecretAlias && record.webhookCredentialId)) {
    return "Webhook Config Incomplete";
  }

  return "Ready";
}

function deriveException(record: {
  provider: string | null;
  providerAccountId: string | null;
  apiBaseUrl: string | null;
  apiCredentialAlias: string | null;
  webhookSigningSecretAlias: string | null;
  webhookCredentialId: string | null;
  status: ProviderAccountRecordDto["status"];
  orgIntegrationCount: number;
  activeOrgIntegrationCount: number;
  clientExternalCount: number;
  cardExternalCount: number;
  externalActionCount: number;
  webhookActionCount: number;
}): { hasException: boolean; exceptionReason: string | null } {
  const missingRequiredSetup = !record.provider || !record.providerAccountId || !record.apiCredentialAlias;
  const apiBaseMissingWithAlias = Boolean(record.apiCredentialAlias && !record.apiBaseUrl);
  const apiAliasMissingWithBase = Boolean(record.apiBaseUrl && !record.apiCredentialAlias);
  const webhookSecretMissing = Boolean(record.webhookCredentialId && !record.webhookSigningSecretAlias);
  const webhookCredentialMissing = Boolean(record.webhookSigningSecretAlias && !record.webhookCredentialId);
  const webhookUsedConfigMissing = record.webhookActionCount > 0 && (!record.webhookSigningSecretAlias || !record.webhookCredentialId);

  const isInUse =
    record.orgIntegrationCount > 0 ||
    record.clientExternalCount > 0 ||
    record.cardExternalCount > 0 ||
    record.externalActionCount > 0;

  const inactiveButInUse = (record.status ?? "") !== "Active" && isInUse;
  const disabledWithActiveOrgIntegrations = record.status === "Disabled" && record.activeOrgIntegrationCount > 0;

  if (missingRequiredSetup) return { hasException: true, exceptionReason: "Missing Required Setup" };
  if (apiBaseMissingWithAlias) return { hasException: true, exceptionReason: "API Base URL Missing" };
  if (apiAliasMissingWithBase) return { hasException: true, exceptionReason: "API Credential Alias Missing" };
  if (webhookSecretMissing) return { hasException: true, exceptionReason: "Webhook Signing Secret Alias Missing" };
  if (webhookCredentialMissing) return { hasException: true, exceptionReason: "Webhook Credential ID Missing" };
  if (webhookUsedConfigMissing) return { hasException: true, exceptionReason: "Webhook Config Missing" };
  if (inactiveButInUse) return { hasException: true, exceptionReason: "Inactive But Still In Use" };
  if (disabledWithActiveOrgIntegrations) return { hasException: true, exceptionReason: "Disabled With Active Org Integrations" };

  return { hasException: false, exceptionReason: null };
}

function toRecord(record: AirtableRecord): ProviderAccountRecordDto {
  const fields = record.fields ?? {};
  const provider = readString(fields[PROVIDER_ACCOUNT_FIELDS.provider]);
  const providerAccountId = readString(fields[PROVIDER_ACCOUNT_FIELDS.providerAccountId]);
  const apiBaseUrl = readString(fields[PROVIDER_ACCOUNT_FIELDS.apiBaseUrl]);
  const apiCredentialAlias =
    readString(fields[PROVIDER_ACCOUNT_FIELDS.apiCredentialAlias]) ??
    readString(fields[PROVIDER_ACCOUNT_FIELDS.accessTokenAlias]) ??
    readString(fields[PROVIDER_ACCOUNT_FIELDS.accessToken]);
  const webhookSigningSecretAlias = readString(fields[PROVIDER_ACCOUNT_FIELDS.webhookSigningSecretAlias]);
  const webhookCredentialId = readString(fields[PROVIDER_ACCOUNT_FIELDS.webhookCredentialId]);
  const status = asStatus(readString(fields[PROVIDER_ACCOUNT_FIELDS.status]));

  const orgIntegrationCount = toFlag(fields[PROVIDER_ACCOUNT_FIELDS.orgIntegrationCount]);
  const activeOrgIntegrationCount = toFlag(fields[PROVIDER_ACCOUNT_FIELDS.activeOrgIntegrationCount]);
  const clientExternalCount = toFlag(fields[PROVIDER_ACCOUNT_FIELDS.clientExternalCount]);
  const cardExternalCount = toFlag(fields[PROVIDER_ACCOUNT_FIELDS.cardExternalCount]);
  const externalActionCount = toFlag(fields[PROVIDER_ACCOUNT_FIELDS.externalActionCount]);
  const webhookActionCount = toFlag(fields[PROVIDER_ACCOUNT_FIELDS.externalActionWebhookCount]);

  const configStatus = deriveConfigStatus({
    provider,
    providerAccountId,
    apiCredentialAlias,
    apiBaseUrl,
    webhookSigningSecretAlias,
    webhookCredentialId,
    usesWebhooks: webhookActionCount > 0 ? 1 : 0,
  });

  const exception = deriveException({
    provider,
    providerAccountId,
    apiBaseUrl,
    apiCredentialAlias,
    webhookSigningSecretAlias,
    webhookCredentialId,
    status,
    orgIntegrationCount,
    activeOrgIntegrationCount,
    clientExternalCount,
    cardExternalCount,
    externalActionCount,
    webhookActionCount,
  });

  return {
    recordId: record.id,
    provider,
    providerAccountName: readString(fields[PROVIDER_ACCOUNT_FIELDS.providerAccountName]),
    providerAccountId,
    status,
    notes: readString(fields[PROVIDER_ACCOUNT_FIELDS.notes]),
    apiBaseUrl,
    apiCredentialAlias,
    webhookSigningSecretAlias,
    webhookCredentialId,
    orgIntegrationIds: readLinkedIds(fields[PROVIDER_ACCOUNT_FIELDS.orgIntegrations]),
    externalActionIds: readLinkedIds(fields[PROVIDER_ACCOUNT_FIELDS.externalActions]),
    clientExternalIds: readLinkedIds(fields[PROVIDER_ACCOUNT_FIELDS.clientExternals]),
    configStatus,
    hasException: exception.hasException,
    exceptionReason: exception.exceptionReason,
  };
}

function toFields(input: Partial<CreateProviderAccountDto | UpdateProviderAccountDto>): Record<string, unknown> {
  const fields: Record<string, unknown> = {};

  if (input.provider != null) fields[PROVIDER_ACCOUNT_FIELDS.provider] = input.provider;
  if (input.providerAccountName != null) fields[PROVIDER_ACCOUNT_FIELDS.providerAccountName] = input.providerAccountName;
  if (input.providerAccountId != null) fields[PROVIDER_ACCOUNT_FIELDS.providerAccountId] = input.providerAccountId;
  if (input.status) fields[PROVIDER_ACCOUNT_FIELDS.status] = input.status;
  if (input.notes != null) fields[PROVIDER_ACCOUNT_FIELDS.notes] = input.notes;

  if (input.apiBaseUrl != null) fields[PROVIDER_ACCOUNT_FIELDS.apiBaseUrl] = input.apiBaseUrl;
  if (input.apiCredentialAlias != null) {
    fields[PROVIDER_ACCOUNT_FIELDS.apiCredentialAlias] = input.apiCredentialAlias;
    fields[PROVIDER_ACCOUNT_FIELDS.accessTokenAlias] = input.apiCredentialAlias;
  }
  if (input.webhookSigningSecretAlias != null) fields[PROVIDER_ACCOUNT_FIELDS.webhookSigningSecretAlias] = input.webhookSigningSecretAlias;
  if (input.webhookCredentialId != null) fields[PROVIDER_ACCOUNT_FIELDS.webhookCredentialId] = input.webhookCredentialId;

  return fields;
}

async function createProviderAccount(input: CreateProviderAccountDto): Promise<ProviderAccountRecordDto> {
  const response = await airtableRequest(encodeURIComponent(PROVIDER_ACCOUNTS_TABLE), {
    method: "POST",
    body: JSON.stringify({ fields: toFields(input) }),
  });

  if (!response.ok) {
    const message = await parseAirtableError(response);
    throw new SyncEndpointError(`Failed to create Provider Account: ${message}`, 502);
  }

  return toRecord((await response.json()) as AirtableRecord);
}

async function updateProviderAccount(input: UpdateProviderAccountDto): Promise<ProviderAccountRecordDto> {
  const { recordId, ...rest } = input;
  const fields = toFields(rest);
  if (Object.keys(fields).length === 0) {
    return getProviderAccount(recordId);
  }

  const response = await airtableRequest(
    `${encodeURIComponent(PROVIDER_ACCOUNTS_TABLE)}/${encodeURIComponent(recordId)}`,
    {
      method: "PATCH",
      body: JSON.stringify({ fields }),
    },
  );

  if (response.status === 404) {
    throw new SyncEndpointError("Provider Account not found.", 404);
  }
  if (!response.ok) {
    const message = await parseAirtableError(response);
    throw new SyncEndpointError(`Failed to update Provider Account: ${message}`, 502);
  }

  return toRecord((await response.json()) as AirtableRecord);
}

async function getProviderAccount(recordId: string): Promise<ProviderAccountRecordDto> {
  const response = await airtableRequest(
    `${encodeURIComponent(PROVIDER_ACCOUNTS_TABLE)}/${encodeURIComponent(recordId)}`,
    { method: "GET" },
  );

  if (response.status === 404) {
    throw new SyncEndpointError("Provider Account not found.", 404);
  }
  if (!response.ok) {
    const message = await parseAirtableError(response);
    throw new SyncEndpointError(`Failed to get Provider Account: ${message}`, 502);
  }

  return toRecord((await response.json()) as AirtableRecord);
}

async function findProviderAccountByKey(input: FindProviderAccountByKeyDto): Promise<ProviderAccountRecordDto | null> {
  const escapedProvider = escapeAirtableFormulaString(input.provider);
  const escapedAccountId = escapeAirtableFormulaString(input.providerAccountId);
  const formula = `AND({${PROVIDER_ACCOUNT_FIELDS.provider}}='${escapedProvider}', {${PROVIDER_ACCOUNT_FIELDS.providerAccountId}}='${escapedAccountId}')`;

  const params = new URLSearchParams({ pageSize: "2", filterByFormula: formula });
  const response = await airtableRequest(
    `${encodeURIComponent(PROVIDER_ACCOUNTS_TABLE)}?${params.toString()}`,
    { method: "GET" },
  );

  if (!response.ok) {
    const message = await parseAirtableError(response);
    throw new SyncEndpointError(`Failed to find Provider Account by key: ${message}`, 502);
  }

  const body = (await response.json()) as { records?: AirtableRecord[] };
  const records = body.records ?? [];
  if (records.length === 0) return null;
  if (records.length > 1) {
    throw new SyncEndpointError("Multiple Provider Accounts found for same Provider + Provider Account ID.", 409);
  }

  return toRecord(records[0]);
}

export const providerAccountsRepo = {
  createProviderAccount,
  updateProviderAccount,
  getProviderAccount,
  findProviderAccountByKey,
};
