import { airtableSchema } from "@/config/airtable-schema";
import { SyncEndpointError } from "@/lib/errors";
import {
  airtableRequest,
  escapeAirtableFormulaString,
  parseAirtableError,
} from "@/lib/airtable/client";
import type { CreditAccountRecordDto, CreditAccountStatus } from "./dto";

const CREDIT_ACCOUNTS_TABLE = airtableSchema.operations.tables.creditAccounts;
const CLIENT_PROFILES_TABLE = airtableSchema.operations.tables.clientProfiles;

type AirtableRecord = {
  id: string;
  fields?: Record<string, unknown>;
};

export type ClientProfileIdentity = {
  recordId: string;
  organizationId: string | null;
  clientId: string | null;
};

type CreditAccountCreateFields = {
  "Client Profile"?: string[];
  Status?: CreditAccountStatus;
  Notes?: string;
};

function readString(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const parsed = readString(item);
      if (parsed) return parsed;
    }
  }
  return null;
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

function readFirstLinkedId(value: unknown): string | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const first = value[0];
  return typeof first === "string" && first.trim().length > 0 ? first.trim() : null;
}

function readFirstLinkedIdFromFields(
  fields: Record<string, unknown>,
  candidates: string[],
): string | null {
  for (const key of candidates) {
    const parsed = readFirstLinkedId(fields[key]);
    if (parsed) return parsed;
  }
  return null;
}

function readStatus(value: unknown): CreditAccountStatus | null {
  const parsed = readString(value);
  if (parsed === "Active" || parsed === "Paused" || parsed === "Closed") {
    return parsed;
  }
  return null;
}

function toCreditAccountRecord(record: AirtableRecord): CreditAccountRecordDto {
  const fields = record.fields ?? {};
  return {
    recordId: record.id,
    clientProfileId: readFirstLinkedId(fields["Client Profile"]),
    organizationId: readFirstLinkedIdFromFields(fields, ["Organization"]),
    clientId: readFirstLinkedIdFromFields(fields, ["Client"]),
    status: readStatus(fields.Status),
    notes: readString(fields.Notes),
    balanceCredits: readNumber(fields["Balance Credits"]),
  };
}

async function getRecord(
  tableName: string,
  recordId: string,
  label: string,
): Promise<AirtableRecord> {
  const response = await airtableRequest(
    `${encodeURIComponent(tableName)}/${encodeURIComponent(recordId)}`,
    { method: "GET" },
  );

  if (response.status === 404) {
    throw new SyncEndpointError(`${label} not found.`, 404);
  }
  if (!response.ok) {
    const message = await parseAirtableError(response);
    throw new SyncEndpointError(`Failed to load ${label}: ${message}`, 502);
  }

  return (await response.json()) as AirtableRecord;
}

export async function getClientProfileIdentity(
  clientProfileRecordId: string,
): Promise<ClientProfileIdentity> {
  const record = await getRecord(CLIENT_PROFILES_TABLE, clientProfileRecordId, "Client Profile");
  const fields = record.fields ?? {};

  return {
    recordId: record.id,
    organizationId: readFirstLinkedIdFromFields(fields, ["Organization"]),
    clientId: readFirstLinkedIdFromFields(fields, ["Client"]),
  };
}

export async function findCreditAccountByProfile(
  clientProfileRecordId: string,
): Promise<CreditAccountRecordDto | null> {
  const escaped = escapeAirtableFormulaString(clientProfileRecordId);
  const params = new URLSearchParams({
    maxRecords: "2",
    filterByFormula: `FIND('${escaped}', ARRAYJOIN({Client Profile}))`,
  });

  const response = await airtableRequest(
    `${encodeURIComponent(CREDIT_ACCOUNTS_TABLE)}?${params.toString()}`,
    { method: "GET" },
  );
  if (!response.ok) {
    const message = await parseAirtableError(response);
    throw new SyncEndpointError(`Failed to find Credit Account by Client Profile: ${message}`, 502);
  }

  const body = (await response.json()) as { records?: AirtableRecord[] };
  const rows = (body.records ?? []).map((record) => toCreditAccountRecord(record));
  if (rows.length === 0) return null;
  if (rows.length > 1) {
    throw new SyncEndpointError(
      "Multiple Credit Accounts found for this Client Profile.",
      409,
    );
  }
  return rows[0];
}

export async function getCreditAccountById(
  creditAccountRecordId: string,
): Promise<CreditAccountRecordDto> {
  const record = await getRecord(CREDIT_ACCOUNTS_TABLE, creditAccountRecordId, "Credit Account");
  return toCreditAccountRecord(record);
}

function isUnknownOptionalFieldError(message: string, key: string): boolean {
  return (
    message.includes(`Unknown field name: "${key}"`) ||
    message.includes(`Unknown field names: ${key}`)
  );
}

export async function createCreditAccount(input: {
  clientProfileRecordId: string;
  status?: CreditAccountStatus;
  notes?: string;
}): Promise<CreditAccountRecordDto> {
  let fields: CreditAccountCreateFields = {
    "Client Profile": [input.clientProfileRecordId],
    Status: input.status ?? "Active",
  };

  if (input.notes) fields.Notes = input.notes;

  const optionalFields = new Set(Object.keys(fields));

  while (true) {
    const response = await airtableRequest(`${encodeURIComponent(CREDIT_ACCOUNTS_TABLE)}`, {
      method: "POST",
      body: JSON.stringify({ fields }),
    });

    if (response.ok) {
      return toCreditAccountRecord((await response.json()) as AirtableRecord);
    }

    const message = await parseAirtableError(response);
    const optionalFieldToDrop = [...optionalFields].find(
      (key) => key in fields && isUnknownOptionalFieldError(message, key),
    );

    if (optionalFieldToDrop) {
      const nextFields: CreditAccountCreateFields = {};
      for (const [key, value] of Object.entries(fields)) {
        if (key === optionalFieldToDrop) continue;
        (nextFields as Record<string, unknown>)[key] = value;
      }
      fields = nextFields;
      continue;
    }

    throw new SyncEndpointError(`Failed to create Credit Account: ${message}`, 502);
  }
}
