import { SyncEndpointError } from "@/lib/errors";

const CLIENT_EXTERNALS_TABLE = "Client Externals";
const DEFAULT_PROVIDER_ACCOUNTS_TABLE = "Provider Accounts";
const DEFAULT_CLIENTS_TABLE = "Clients";

type AirtableRecord = {
  id: string;
  fields?: Record<string, unknown>;
};

type AirtableError = {
  error?: {
    type?: string;
    message?: string;
  };
};

export type ClientExternalRecord = {
  recordId: string;
  externalCustomerId: string | null;
  providerAccountId: string | null;
  clientId: string | null;
  clientCanonicalName: string | null;
  clientCanonicalFirstName: string | null;
  clientCanonicalLastName: string | null;
  latestPhoneNormalized: string | null;
  clientCanonicalPhone: string | null;
  nameSnapshot: string | null;
  phoneSnapshot: string | null;
  emailSnapshot: string | null;
  matchPhoneNormalized: string | null;
  syncStatus: string | null;
  missingRequiredLinks: string | null;
  provider: string | null;
  providerAccessTokenAlias: string | null;
};

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readStringLike(value: unknown): string | null {
  if (typeof value === "string") return readString(value);
  if (typeof value === "number" && Number.isFinite(value)) {
    const asString = String(value).trim();
    return asString.length > 0 ? asString : null;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const parsed = readStringLike(item);
      if (parsed) return parsed;
    }
  }
  return null;
}

function readFirstLinkedId(value: unknown): string | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const [first] = value;
  return typeof first === "string" && first.trim().length > 0 ? first.trim() : null;
}

function isTruthyMissingRequiredLinks(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

async function parseAirtableError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as AirtableError;
    if (body.error?.message) return body.error.message;
  } catch {
    // fall through
  }
  return response.statusText || "Unknown Airtable error";
}

async function getAirtableRecord(
  tableName: string,
  recordId: string,
  resourceLabel: string,
): Promise<AirtableRecord> {
  const token =
    readString(process.env.AIRTABLE_OPERATIONS_TOKEN) ?? readString(process.env.AIRTABLE_TOKEN);
  const baseId = readString(process.env.AIRTABLE_OPERATIONS_BASE_ID) ?? readString(process.env.AIRTABLE_BASE_ID);

  if (!token || !baseId) {
    throw new SyncEndpointError("Airtable configuration is missing.", 500, {
      exposeMessage: false,
    });
  }

  const url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}/${encodeURIComponent(recordId)}`;
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });

  if (response.status === 404) {
    throw new SyncEndpointError(`${resourceLabel} not found.`, 404);
  }

  if (!response.ok) {
    const message = await parseAirtableError(response);
    throw new SyncEndpointError(`Airtable request failed: ${message}`, 502);
  }

  return (await response.json()) as AirtableRecord;
}

function readFirstStringFromFields(fields: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = readStringLike(fields[key]);
    if (value) return value;
  }
  return null;
}

export async function getClientExternalRecord(recordId: string): Promise<ClientExternalRecord> {
  const providerAccountsTable =
    readString(process.env.AIRTABLE_PROVIDER_ACCOUNTS_TABLE) ?? DEFAULT_PROVIDER_ACCOUNTS_TABLE;
  const clientsTable = readString(process.env.AIRTABLE_CLIENTS_TABLE) ?? DEFAULT_CLIENTS_TABLE;

  const clientExternal = await getAirtableRecord(
    CLIENT_EXTERNALS_TABLE,
    recordId,
    "Client External",
  );
  const fields = clientExternal.fields ?? {};

  const providerAccountId = readFirstLinkedId(fields["Provider Account"]);
  const providerAccount =
    providerAccountId != null
      ? await getAirtableRecord(providerAccountsTable, providerAccountId, "Provider account")
      : null;
  const clientId = readFirstLinkedId(fields.Client);
  const clientRecord =
    clientId != null ? await getAirtableRecord(clientsTable, clientId, "Client") : null;

  const providerFields = providerAccount?.fields ?? {};
  const clientFields = clientRecord?.fields ?? {};
  const missingRequiredLinksRaw = fields["Missing Required Links"];

  return {
    recordId: clientExternal.id,
    externalCustomerId: readString(fields["External Customer ID"]),
    providerAccountId,
    clientId,
    clientCanonicalName: readString(clientFields["Client Name"]),
    clientCanonicalFirstName: readString(clientFields["First Name"]),
    clientCanonicalLastName: readString(clientFields["Last Name"]),
    latestPhoneNormalized: readFirstStringFromFields(fields, [
      "Latest Phone Normalized",
      "Latest phone normalized",
    ]),
    clientCanonicalPhone: readFirstStringFromFields(clientFields, [
      "Latest Phone Normalized",
      "Latest phone normalized",
    ]),
    nameSnapshot: readString(fields["Name Snapshot"]),
    phoneSnapshot: readString(fields["Phone Snapshot"]),
    emailSnapshot: readString(fields["Email Snapshot"]),
    matchPhoneNormalized: readString(fields["Match Phone Normalized"]),
    syncStatus: readString(fields["Sync Status"]),
    missingRequiredLinks: isTruthyMissingRequiredLinks(missingRequiredLinksRaw)
      ? "Missing required links"
      : null,
    provider: readString(providerFields.Provider),
    providerAccessTokenAlias:
      readString(providerFields["Access Token Alias"]) ??
      readString(providerFields["Access Token"]),
  };
}

export async function updateClientExternalSnapshots(
  recordId: string,
  fields: Partial<Record<"Name Snapshot" | "Phone Snapshot", string>>,
): Promise<void> {
  const token =
    readString(process.env.AIRTABLE_OPERATIONS_TOKEN) ?? readString(process.env.AIRTABLE_TOKEN);
  const baseId = readString(process.env.AIRTABLE_OPERATIONS_BASE_ID) ?? readString(process.env.AIRTABLE_BASE_ID);

  if (!token || !baseId) {
    throw new SyncEndpointError("Airtable configuration is missing.", 500, {
      exposeMessage: false,
    });
  }

  const sanitizedFields = Object.fromEntries(
    Object.entries(fields).filter(([, value]) => typeof value === "string" && value.trim().length > 0),
  ) as Partial<Record<"Name Snapshot" | "Phone Snapshot", string>>;

  if (Object.keys(sanitizedFields).length === 0) {
    return;
  }

  const url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(CLIENT_EXTERNALS_TABLE)}/${encodeURIComponent(recordId)}`;
  const response = await fetch(url, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ fields: sanitizedFields }),
    cache: "no-store",
  });

  if (!response.ok) {
    const message = await parseAirtableError(response);
    throw new SyncEndpointError(`Airtable snapshot update failed: ${message}`, 502);
  }
}
