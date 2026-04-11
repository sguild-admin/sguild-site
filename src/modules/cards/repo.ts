import { SyncEndpointError } from "@/lib/errors";
import { airtableSchema } from "@/config/airtable-schema";
import {
  airtableRequest,
  escapeAirtableFormulaString,
  parseAirtableError,
} from "@/lib/airtable/client";
import { fetchSquareCards } from "@/lib/providers/square/cards";
import type { SquareAuthContext } from "@/lib/providers/square/types";
import { clientSyncRepo } from "@/modules/clients";

const CLIENT_EXTERNALS_TABLE = airtableSchema.operations.tables.clientExternals;
const CARD_EXTERNALS_TABLE = airtableSchema.operations.tables.cardExternals;
const PROVIDER_ACCOUNTS_TABLE = airtableSchema.operations.tables.providerAccounts;

type AirtableRecord = {
  id: string;
  fields?: Record<string, unknown>;
};

export type CardExternalFields = {
  "External Card ID": string;
  "Client External": string[];
  "Card Brand": string;
  "Last 4": string;
  "Exp Month": number | null;
  "Exp Year": number | null;
  "Cardholder Name": string;
  Enabled: boolean;
  "Card Summary": string;
};

export type ClientExternalRecord = {
  recordId: string;
  externalCustomerId: string | null;
  providerAccountId: string | null;
  clientId: string | null;
  cardSyncEligible: boolean | null;
  provider: string | null;
  providerAccessTokenAlias: string | null;
};

export type ExistingCardExternal = {
  recordId: string;
  externalCardId: string | null;
  enabled: boolean;
  clientExternalIds: string[];
};

function readString(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const parsed = readString(item);
      if (parsed) return parsed;
    }
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return null;
}

function readFirstLinkedId(value: unknown): string | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const [first] = value;
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

function readNullableBoolean(value: unknown): boolean | null {
  if (value == null) return null;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return null;
    if (normalized === "true" || normalized === "yes" || normalized === "eligible") return true;
    if (normalized === "false" || normalized === "no" || normalized === "ineligible") return false;
  }
  return null;
}

function isEnabled(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return normalized === "true" || normalized === "yes" || normalized === "enabled";
  }
  return false;
}

async function getRecord(
  tableName: string,
  recordId: string,
  resourceLabel: string,
): Promise<AirtableRecord> {
  const response = await airtableRequest(
    `${encodeURIComponent(tableName)}/${encodeURIComponent(recordId)}`,
    { method: "GET" },
  );

  if (response.status === 404) {
    throw new SyncEndpointError(`${resourceLabel} not found.`, 404);
  }

  if (!response.ok) {
    const message = await parseAirtableError(response);
    throw new SyncEndpointError(`Airtable request failed: ${message}`, 502);
  }

  return (await response.json()) as AirtableRecord;
}

function validateCardsSecret(request: Request): void {
  clientSyncRepo.validateAirtableSecret(request);
}

async function loadClientExternal(recordId: string): Promise<ClientExternalRecord> {
  const clientExternal = await getRecord(CLIENT_EXTERNALS_TABLE, recordId, "Client External");
  const fields = clientExternal.fields ?? {};

  const providerAccountId = readFirstLinkedId(fields["Provider Account"]);
  const providerAccount =
    providerAccountId != null
      ? await getRecord(PROVIDER_ACCOUNTS_TABLE, providerAccountId, "Provider account")
      : null;
  const providerFields = providerAccount?.fields ?? {};

  return {
    recordId: clientExternal.id,
    externalCustomerId: readString(fields["External Customer ID"]),
    providerAccountId,
    clientId: readFirstLinkedId(fields.Client),
    cardSyncEligible: readNullableBoolean(fields["Card Sync Eligible"]),
    provider: readString(fields.Provider) ?? readString(providerFields.Provider),
    providerAccessTokenAlias:
      readString(providerFields["API Credential Alias"]) ??
      readString(providerFields["Access Token Alias"]) ??
      readString(providerFields["Access Token"]),
  };
}

async function listExistingCardExternals(
  clientExternalRecordId: string,
): Promise<ExistingCardExternal[]> {
  const escapedId = escapeAirtableFormulaString(clientExternalRecordId);
  let offset: string | undefined;
  const rows: ExistingCardExternal[] = [];

  do {
    const params = new URLSearchParams({
      pageSize: "100",
      filterByFormula: `FIND('${escapedId}', ARRAYJOIN({Client External}))`,
    });
    if (offset) params.set("offset", offset);

    const response = await airtableRequest(`${encodeURIComponent(CARD_EXTERNALS_TABLE)}?${params.toString()}`, {
      method: "GET",
    });

    if (!response.ok) {
      const message = await parseAirtableError(response);
      throw new SyncEndpointError(`Failed to load Card Externals: ${message}`, 502);
    }

    const body = (await response.json()) as {
      records?: AirtableRecord[];
      offset?: string;
    };

    for (const record of body.records ?? []) {
      const f = record.fields ?? {};
      rows.push({
        recordId: record.id,
        externalCardId: readString(f["External Card ID"]),
        enabled: isEnabled(f.Enabled),
        clientExternalIds: readLinkedIds(f["Client External"]),
      });
    }

    offset = body.offset;
  } while (offset);

  return rows;
}

async function findExistingCardExternalByKey(
  clientExternalRecordId: string,
  externalCardId: string,
): Promise<ExistingCardExternal | null> {
  const escapedCardId = escapeAirtableFormulaString(externalCardId);
  const params = new URLSearchParams({
    maxRecords: "20",
    filterByFormula: `{External Card ID}='${escapedCardId}'`,
  });

  const response = await airtableRequest(
    `${encodeURIComponent(CARD_EXTERNALS_TABLE)}?${params.toString()}`,
    {
      method: "GET",
    },
  );

  if (!response.ok) {
    const message = await parseAirtableError(response);
    throw new SyncEndpointError(`Failed to query Card Externals by key: ${message}`, 502);
  }

  const body = (await response.json()) as {
    records?: AirtableRecord[];
  };

  for (const record of body.records ?? []) {
    const f = record.fields ?? {};
    const linkedIds = readLinkedIds(f["Client External"]);
    if (!linkedIds.includes(clientExternalRecordId)) continue;

    return {
      recordId: record.id,
      externalCardId: readString(f["External Card ID"]),
      enabled: isEnabled(f.Enabled),
      clientExternalIds: linkedIds,
    };
  }

  return null;
}

async function createCardExternalRecord(fields: CardExternalFields): Promise<void> {
  const response = await airtableRequest(encodeURIComponent(CARD_EXTERNALS_TABLE), {
    method: "POST",
    body: JSON.stringify({
      records: [{ fields }],
    }),
  });

  if (!response.ok) {
    const message = await parseAirtableError(response);
    throw new SyncEndpointError(`Failed to create Card External: ${message}`, 502);
  }
}

async function updateCardExternalRecord(
  recordId: string,
  fields: Partial<CardExternalFields>,
): Promise<void> {
  const response = await airtableRequest(
    `${encodeURIComponent(CARD_EXTERNALS_TABLE)}/${encodeURIComponent(recordId)}`,
    {
      method: "PATCH",
      body: JSON.stringify({ fields }),
    },
  );

  if (!response.ok) {
    const message = await parseAirtableError(response);
    throw new SyncEndpointError(`Failed to update Card External: ${message}`, 502);
  }
}

async function disableCardExternalRecord(recordId: string): Promise<void> {
  await updateCardExternalRecord(recordId, { Enabled: false });
}

async function fetchSquareCardsForCustomer(
  context: SquareAuthContext,
  externalCustomerId: string,
) {
  return fetchSquareCards(context, externalCustomerId);
}

export const cardsRepo = {
  validateCardsSecret,
  loadClientExternal,
  findExistingCardExternalByKey,
  listExistingCardExternals,
  createCardExternalRecord,
  updateCardExternalRecord,
  disableCardExternalRecord,
  fetchSquareCardsForCustomer,
};
