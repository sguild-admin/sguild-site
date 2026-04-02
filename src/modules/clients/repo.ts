import crypto from "crypto";

import { SyncEndpointError } from "@/lib/errors";
import { airtableSchema } from "@/config/airtable-schema";
import {
  airtableRequest,
  parseAirtableError,
} from "@/lib/airtable/client";
import { syncSquareCustomer } from "@/lib/providers/square/customers";
import type { SquareAuthContext, SquareCustomerSyncInput } from "@/lib/providers/square/types";

const CLIENT_EXTERNALS_TABLE = airtableSchema.operations.tables.clientExternals;
const PROVIDER_ACCOUNTS_TABLE = airtableSchema.operations.tables.providerAccounts;
const CLIENTS_TABLE = airtableSchema.operations.tables.clients;

type AirtableRecord = {
  id: string;
  fields?: Record<string, unknown>;
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

function timingSafeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

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

async function getAirtableRecord(
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

function readFirstStringFromFields(fields: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = readStringLike(fields[key]);
    if (value) return value;
  }
  return null;
}

function validateAirtableSecret(request: Request): void {
  const configuredSecret = process.env.AIRTABLE_SYNC_SECRET;
  if (!configuredSecret) {
    throw new SyncEndpointError("Airtable sync secret is not configured.", 500, {
      exposeMessage: false,
    });
  }

  const providedSecret = request.headers.get("x-airtable-secret") ?? "";
  if (!providedSecret || !timingSafeEqual(configuredSecret, providedSecret)) {
    throw new SyncEndpointError("Unauthorized", 401);
  }
}

async function loadClientExternal(recordId: string): Promise<ClientExternalRecord> {
  const clientExternal = await getAirtableRecord(
    CLIENT_EXTERNALS_TABLE,
    recordId,
    "Client External",
  );
  const fields = clientExternal.fields ?? {};

  const providerAccountId = readFirstLinkedId(fields["Provider Account"]);
  const providerAccount =
    providerAccountId != null
      ? await getAirtableRecord(PROVIDER_ACCOUNTS_TABLE, providerAccountId, "Provider account")
      : null;
  const clientId = readFirstLinkedId(fields.Client);
  const clientRecord =
    clientId != null ? await getAirtableRecord(CLIENTS_TABLE, clientId, "Client") : null;

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

async function persistClientExternalSnapshots(
  recordId: string,
  fields: Partial<Record<"Name Snapshot" | "Phone Snapshot", string>>,
): Promise<void> {
  const sanitizedFields = Object.fromEntries(
    Object.entries(fields).filter(([, value]) => typeof value === "string" && value.trim().length > 0),
  ) as Partial<Record<"Name Snapshot" | "Phone Snapshot", string>>;

  if (Object.keys(sanitizedFields).length === 0) return;

  const response = await airtableRequest(
    `${encodeURIComponent(CLIENT_EXTERNALS_TABLE)}/${encodeURIComponent(recordId)}`,
    {
      method: "PATCH",
      body: JSON.stringify({ fields: sanitizedFields }),
    },
  );

  if (!response.ok) {
    const message = await parseAirtableError(response);
    throw new SyncEndpointError(`Airtable snapshot update failed: ${message}`, 502);
  }
}

async function runSquareClientSync(
  input: ClientExternalRecord,
  context: SquareAuthContext,
) {
  const providerInput: SquareCustomerSyncInput = {
    recordReferenceId: input.recordId,
    externalCustomerId: input.externalCustomerId,
    canonicalFirstName: input.clientCanonicalFirstName,
    canonicalLastName: input.clientCanonicalLastName,
    nameSnapshot: input.nameSnapshot,
    phoneSnapshot: input.phoneSnapshot,
    matchPhoneNormalized: input.matchPhoneNormalized,
    emailSnapshot: input.emailSnapshot,
  };

  return syncSquareCustomer(providerInput, context);
}

function validateClientsSecret(request: Request): void {
  validateAirtableSecret(request);
}

export const clientSyncRepo = {
  validateClientsSecret,
  validateAirtableSecret,
  loadClientExternal,
  persistClientExternalSnapshots,
  runSquareClientSync,
};
