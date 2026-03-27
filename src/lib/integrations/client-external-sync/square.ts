import crypto from "crypto";

import { ClientExternalRecord } from "./airtable";
import { SyncEndpointError, SyncMode } from "./response";
import { SquareContext } from "./provider-context";

const DEFAULT_SQUARE_BASE_URL = "https://connect.squareup.com";
const DEFAULT_SQUARE_VERSION = "2024-06-04";

type SquareErrorResponse = {
  errors?: Array<{
    category?: string;
    code?: string;
    detail?: string;
  }>;
};

type SquareCustomer = {
  id: string;
  nickname?: string;
  given_name?: string;
  family_name?: string;
  email_address?: string;
  phone_number?: string;
};

type SquareRetrieveCustomerResponse = {
  customer?: SquareCustomer;
};

type SquareCreateOrUpdateResponse = {
  customer?: SquareCustomer;
};

type SyncSquareCustomerResult = {
  externalCustomerId: string;
  mode: SyncMode;
  path: "create" | "update" | "verify";
  squarePhoneNumber: string | null;
  squareGivenName: string | null;
  squareFamilyName: string | null;
  squareNickname: string | null;
};

function normalizePhone(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  return trimmed;
}

function parseSquareErrorMessage(body: unknown): string {
  const data = body as SquareErrorResponse;
  const first = data.errors?.[0];
  return first?.detail || first?.code || "Square request failed.";
}

function getSquareBaseUrl(): string {
  return process.env.SQUARE_API_BASE_URL?.trim() || DEFAULT_SQUARE_BASE_URL;
}

function squareHeaders(accessToken: string): HeadersInit {
  return {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    "Square-Version": process.env.SQUARE_API_VERSION?.trim() || DEFAULT_SQUARE_VERSION,
  };
}

async function squareRequest(
  path: string,
  init: RequestInit,
  context: SquareContext,
): Promise<Response> {
  const response = await fetch(`${getSquareBaseUrl()}${path}`, {
    ...init,
    headers: {
      ...squareHeaders(context.accessToken),
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });

  return response;
}

function deterministicCreateIdempotencyKey(recordId: string): string {
  const digest = crypto.createHash("sha256").update(`${recordId}:square:create`).digest("hex");
  return `cex_${digest.slice(0, 28)}`;
}

function buildDesiredCustomerPayload(clientExternal: ClientExternalRecord): {
  nickname: string | null;
  givenName: string | null;
  familyName: string | null;
  phoneNumber: string | null;
  emailAddress: string | null;
} {
  const canonicalFirstName = clientExternal.clientCanonicalFirstName?.trim() || null;
  const canonicalLastName = clientExternal.clientCanonicalLastName?.trim() || null;
  const snapshotName = clientExternal.nameSnapshot?.trim() || null;

  let splitGivenName: string | null = null;
  let splitFamilyName: string | null = null;
  if (snapshotName) {
    const parts = snapshotName.split(/\s+/).filter((part) => part.length > 0);
    if (parts.length > 0) {
      splitGivenName = parts[0] ?? null;
      splitFamilyName = parts.length > 1 ? parts.slice(1).join(" ") : null;
    }
  }

  return {
    nickname: snapshotName,
    givenName: canonicalFirstName ?? splitGivenName,
    familyName: canonicalLastName ?? splitFamilyName,
    phoneNumber: normalizePhone(clientExternal.phoneSnapshot ?? clientExternal.matchPhoneNormalized),
    emailAddress: clientExternal.emailSnapshot?.trim() || null,
  };
}

function hasSquareRequiredIdentity(desired: {
  givenName: string | null;
  familyName: string | null;
  emailAddress: string | null;
  phoneNumber: string | null;
}): boolean {
  return Boolean(
    desired.givenName || desired.familyName || desired.emailAddress || desired.phoneNumber,
  );
}

function assertSquareRequiredIdentity(desired: {
  givenName: string | null;
  familyName: string | null;
  emailAddress: string | null;
  phoneNumber: string | null;
}): void {
  if (!hasSquareRequiredIdentity(desired)) {
    throw new SyncEndpointError(
      "Missing customer identity for Square sync. Provide name, email, or phone.",
      422,
    );
  }
}

async function retrieveSquareCustomer(
  externalCustomerId: string,
  context: SquareContext,
): Promise<SquareCustomer> {
  const response = await squareRequest(`/v2/customers/${encodeURIComponent(externalCustomerId)}`, {
    method: "GET",
  }, context);

  if (response.status === 404) {
    throw new SyncEndpointError(
      "Stored external customer ID does not exist in Square.",
      422,
    );
  }

  let data: SquareRetrieveCustomerResponse | SquareErrorResponse = {};
  try {
    data = (await response.json()) as SquareRetrieveCustomerResponse | SquareErrorResponse;
  } catch {
    // ignore parse errors and handle with generic text
  }

  if (!response.ok) {
    throw new SyncEndpointError(
      `Square customer lookup failed: ${parseSquareErrorMessage(data)}`,
      502,
    );
  }

  if (!("customer" in data) || !data.customer?.id) {
    throw new SyncEndpointError("Square customer lookup returned no customer.", 502);
  }

  return data.customer;
}

function applyConservativeChanges(
  existing: SquareCustomer,
  desired: {
    nickname: string | null;
    givenName: string | null;
    familyName: string | null;
    phoneNumber: string | null;
    emailAddress: string | null;
  },
): Record<string, string> {
  const patch: Record<string, string> = {};

  if (desired.nickname && desired.nickname !== (existing.nickname ?? "").trim()) {
    patch.nickname = desired.nickname;
  }
  if (desired.givenName && desired.givenName !== (existing.given_name ?? "").trim()) {
    patch.given_name = desired.givenName;
  }
  if (desired.familyName && desired.familyName !== (existing.family_name ?? "").trim()) {
    patch.family_name = desired.familyName;
  }
  if (desired.phoneNumber && desired.phoneNumber !== (existing.phone_number ?? "").trim()) {
    patch.phone_number = desired.phoneNumber;
  }
  if (desired.emailAddress && desired.emailAddress !== (existing.email_address ?? "").trim()) {
    patch.email_address = desired.emailAddress;
  }

  return patch;
}

async function updateSquareCustomer(
  externalCustomerId: string,
  updatePatch: Record<string, string>,
  context: SquareContext,
): Promise<void> {
  const response = await squareRequest(
    `/v2/customers/${encodeURIComponent(externalCustomerId)}`,
    {
      method: "PUT",
      body: JSON.stringify(updatePatch),
    },
    context,
  );

  let data: SquareCreateOrUpdateResponse | SquareErrorResponse = {};
  try {
    data = (await response.json()) as SquareCreateOrUpdateResponse | SquareErrorResponse;
  } catch {
    // ignore parse errors and handle generically
  }

  if (!response.ok) {
    throw new SyncEndpointError(
      `Square customer update failed: ${parseSquareErrorMessage(data)}`,
      502,
    );
  }
}

async function createSquareCustomer(
  clientExternal: ClientExternalRecord,
  context: SquareContext,
): Promise<{
  id: string;
  phoneNumber: string | null;
  givenName: string | null;
  familyName: string | null;
  nickname: string | null;
}> {
  const desired = buildDesiredCustomerPayload(clientExternal);
  assertSquareRequiredIdentity(desired);

  const body: Record<string, string> = {
    idempotency_key: deterministicCreateIdempotencyKey(clientExternal.recordId),
    reference_id: clientExternal.recordId,
  };

  if (desired.nickname) body.nickname = desired.nickname;
  if (desired.givenName) body.given_name = desired.givenName;
  if (desired.familyName) body.family_name = desired.familyName;
  if (desired.phoneNumber) body.phone_number = desired.phoneNumber;
  if (desired.emailAddress) body.email_address = desired.emailAddress;

  const response = await squareRequest(
    "/v2/customers",
    {
      method: "POST",
      body: JSON.stringify(body),
    },
    context,
  );

  let data: SquareCreateOrUpdateResponse | SquareErrorResponse = {};
  try {
    data = (await response.json()) as SquareCreateOrUpdateResponse | SquareErrorResponse;
  } catch {
    // ignore parse errors and handle generically
  }

  if (!response.ok) {
    throw new SyncEndpointError(
      `Square customer create failed: ${parseSquareErrorMessage(data)}`,
      502,
    );
  }

  const createdCustomerId =
    "customer" in data && data.customer?.id ? data.customer.id : null;
  if (!createdCustomerId) {
    throw new SyncEndpointError("Square customer create returned no customer ID.", 502);
  }

  const createdPhone =
    "customer" in data ? normalizePhone(data.customer?.phone_number ?? null) : null;
  const createdGivenName =
    "customer" in data
      ? data.customer?.given_name?.trim() || null
      : null;
  const createdFamilyName =
    "customer" in data
      ? data.customer?.family_name?.trim() || null
      : null;
  const createdNickname =
    "customer" in data
      ? data.customer?.nickname?.trim() || null
      : null;

  return {
    id: createdCustomerId,
    phoneNumber: createdPhone ?? desired.phoneNumber ?? null,
    givenName: createdGivenName ?? desired.givenName ?? null,
    familyName: createdFamilyName ?? desired.familyName ?? null,
    nickname: createdNickname ?? desired.nickname ?? null,
  };
}

export async function syncSquareCustomer(
  clientExternal: ClientExternalRecord,
  context: SquareContext,
): Promise<SyncSquareCustomerResult> {
  const desired = buildDesiredCustomerPayload(clientExternal);
  assertSquareRequiredIdentity(desired);

  if (!clientExternal.externalCustomerId) {
    const created = await createSquareCustomer(clientExternal, context);
    return {
      externalCustomerId: created.id,
      mode: "created",
      path: "create",
      squarePhoneNumber: created.phoneNumber,
      squareGivenName: created.givenName,
      squareFamilyName: created.familyName,
      squareNickname: created.nickname,
    };
  }

  const existing = await retrieveSquareCustomer(clientExternal.externalCustomerId, context);
  const updatePatch = applyConservativeChanges(existing, desired);
  if (Object.keys(updatePatch).length === 0) {
    return {
      externalCustomerId: existing.id,
      mode: "verified",
      path: "verify",
      squarePhoneNumber: normalizePhone(existing.phone_number ?? null),
      squareGivenName: existing.given_name?.trim() || null,
      squareFamilyName: existing.family_name?.trim() || null,
      squareNickname: existing.nickname?.trim() || null,
    };
  }

  await updateSquareCustomer(existing.id, updatePatch, context);
  const squarePhoneAfterUpdate =
    normalizePhone(updatePatch.phone_number ?? null) ??
    normalizePhone(existing.phone_number ?? null);
  return {
    externalCustomerId: existing.id,
    mode: "updated",
    path: "update",
    squarePhoneNumber: squarePhoneAfterUpdate,
    squareGivenName:
      (updatePatch.given_name?.trim() || null) ?? (existing.given_name?.trim() || null),
    squareFamilyName:
      (updatePatch.family_name?.trim() || null) ?? (existing.family_name?.trim() || null),
    squareNickname:
      (updatePatch.nickname?.trim() || null) ?? (existing.nickname?.trim() || null),
  };
}
