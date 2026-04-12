import crypto from "crypto";

import { SyncEndpointError } from "@/lib/errors";
import { parseSquareErrorMessage, squareRawRequest } from "./client";
import type {
  SquareAuthContext,
  SquareCustomerSyncInput,
  SquareCustomerSyncResult,
} from "./types";
import type { SquareCustomer } from "./schema";

type SquareRetrieveCustomerResponse = {
  customer?: SquareCustomer;
};

type SquareCreateOrUpdateResponse = {
  customer?: SquareCustomer;
};

type SquareSearchCustomersResponse = {
  customers?: SquareCustomer[];
};

function normalizePhone(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;

  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (trimmed.startsWith("+") && digits.length >= 8) return `+${digits}`;
  return trimmed;
}

function digitsOnly(value: string | null): string {
  return (value ?? "").replace(/\D/g, "");
}

function normalizeNameForMatch(value: string | null): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function nameTokens(value: string): string[] {
  if (!value) return [];
  return value.split(" ").filter((token) => token.length > 0);
}

function deterministicCreateIdempotencyKey(recordReferenceId: string): string {
  const digest = crypto
    .createHash("sha256")
    .update(`${recordReferenceId}:square:create`)
    .digest("hex");
  return `cex_${digest.slice(0, 28)}`;
}

function buildDesiredCustomerPayload(input: SquareCustomerSyncInput): {
  nickname: string | null;
  givenName: string | null;
  familyName: string | null;
  phoneNumber: string | null;
  emailAddress: string | null;
} {
  const canonicalFirstName = input.canonicalFirstName?.trim() || null;
  const canonicalLastName = input.canonicalLastName?.trim() || null;
  const snapshotName = input.nameSnapshot?.trim() || null;

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
    phoneNumber: normalizePhone(input.phoneSnapshot ?? input.matchPhoneNormalized),
    emailAddress: input.emailSnapshot?.trim() || null,
  };
}

function getDesiredComparableName(desired: {
  nickname: string | null;
  givenName: string | null;
  familyName: string | null;
}): string {
  const combined = [desired.givenName, desired.familyName]
    .filter((part): part is string => Boolean(part))
    .join(" ")
    .trim();
  return normalizeNameForMatch(combined || desired.nickname || null);
}

function getSquareCustomerComparableName(customer: SquareCustomer): string {
  const combined = [customer.given_name?.trim(), customer.family_name?.trim()]
    .filter((part): part is string => Boolean(part))
    .join(" ")
    .trim();
  return normalizeNameForMatch(combined || customer.nickname || null);
}

function fuzzyNameScore(desiredName: string, candidateName: string): number {
  if (!desiredName || !candidateName) return 0;
  if (desiredName === candidateName) return 1;
  if (desiredName.includes(candidateName) || candidateName.includes(desiredName)) {
    return 0.9;
  }

  const desiredTokens = nameTokens(desiredName);
  const candidateTokens = nameTokens(candidateName);
  if (desiredTokens.length === 0 || candidateTokens.length === 0) return 0;

  const desiredSet = new Set(desiredTokens);
  const candidateSet = new Set(candidateTokens);
  let overlap = 0;
  for (const token of desiredSet) {
    if (candidateSet.has(token)) overlap += 1;
  }

  const denominator = Math.max(desiredSet.size, candidateSet.size);
  return denominator === 0 ? 0 : overlap / denominator;
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
  context: SquareAuthContext,
): Promise<SquareCustomer> {
  const response = await squareRawRequest(
    `/v2/customers/${encodeURIComponent(externalCustomerId)}`,
    { method: "GET" },
    context,
  );

  if (response.status === 404) {
    throw new SyncEndpointError(
      "Stored external customer ID does not exist in Square.",
      422,
    );
  }

  let data: SquareRetrieveCustomerResponse | Record<string, unknown> = {};
  try {
    data = (await response.json()) as SquareRetrieveCustomerResponse | Record<string, unknown>;
  } catch {
    // ignore parse errors and handle with generic text
  }

  if (!response.ok) {
    throw new SyncEndpointError(
      `Square customer lookup failed: ${parseSquareErrorMessage(data)}`,
      502,
    );
  }

  if (!("customer" in data) || !(data as SquareRetrieveCustomerResponse).customer?.id) {
    throw new SyncEndpointError("Square customer lookup returned no customer.", 502);
  }

  return (data as SquareRetrieveCustomerResponse).customer as SquareCustomer;
}

export async function getSquareCustomerContactIdentity(
  externalCustomerId: string,
  context: SquareAuthContext,
): Promise<{
  emailAddress: string | null;
  phoneNumber: string | null;
}> {
  const customer = await retrieveSquareCustomer(externalCustomerId, context);
  return {
    emailAddress: customer.email_address?.trim() || null,
    phoneNumber: normalizePhone(customer.phone_number ?? null),
  };
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
  const existingPhone = normalizePhone(existing.phone_number ?? null);

  if (desired.nickname && desired.nickname !== (existing.nickname ?? "").trim()) {
    patch.nickname = desired.nickname;
  }
  if (desired.givenName && desired.givenName !== (existing.given_name ?? "").trim()) {
    patch.given_name = desired.givenName;
  }
  if (desired.familyName && desired.familyName !== (existing.family_name ?? "").trim()) {
    patch.family_name = desired.familyName;
  }
  if (desired.phoneNumber && desired.phoneNumber !== existingPhone) {
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
  context: SquareAuthContext,
): Promise<void> {
  const response = await squareRawRequest(
    `/v2/customers/${encodeURIComponent(externalCustomerId)}`,
    {
      method: "PUT",
      body: JSON.stringify(updatePatch),
    },
    context,
  );

  let data: SquareCreateOrUpdateResponse | Record<string, unknown> = {};
  try {
    data = (await response.json()) as SquareCreateOrUpdateResponse | Record<string, unknown>;
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
  input: SquareCustomerSyncInput,
  context: SquareAuthContext,
): Promise<{
  id: string;
  phoneNumber: string | null;
  givenName: string | null;
  familyName: string | null;
  nickname: string | null;
}> {
  const desired = buildDesiredCustomerPayload(input);
  assertSquareRequiredIdentity(desired);

  const body: Record<string, string> = {
    idempotency_key: deterministicCreateIdempotencyKey(input.recordReferenceId),
    reference_id: input.recordReferenceId,
  };

  if (desired.nickname) body.nickname = desired.nickname;
  if (desired.givenName) body.given_name = desired.givenName;
  if (desired.familyName) body.family_name = desired.familyName;
  if (desired.phoneNumber) body.phone_number = desired.phoneNumber;
  if (desired.emailAddress) body.email_address = desired.emailAddress;

  const response = await squareRawRequest(
    "/v2/customers",
    {
      method: "POST",
      body: JSON.stringify(body),
    },
    context,
  );

  let data: SquareCreateOrUpdateResponse | Record<string, unknown> = {};
  try {
    data = (await response.json()) as SquareCreateOrUpdateResponse | Record<string, unknown>;
  } catch {
    // ignore parse errors and handle generically
  }

  if (!response.ok) {
    throw new SyncEndpointError(
      `Square customer create failed: ${parseSquareErrorMessage(data)}`,
      502,
    );
  }

  const createdCustomer = (data as SquareCreateOrUpdateResponse).customer;
  if (!createdCustomer?.id) {
    throw new SyncEndpointError("Square customer create returned no customer ID.", 502);
  }
  const createdCustomerId = createdCustomer.id;

  const createdPhone = normalizePhone(createdCustomer.phone_number ?? null);
  const createdGivenName = createdCustomer.given_name?.trim() || null;
  const createdFamilyName = createdCustomer.family_name?.trim() || null;
  const createdNickname = createdCustomer.nickname?.trim() || null;

  return {
    id: createdCustomerId,
    phoneNumber: createdPhone ?? desired.phoneNumber ?? null,
    givenName: createdGivenName ?? desired.givenName ?? null,
    familyName: createdFamilyName ?? desired.familyName ?? null,
    nickname: createdNickname ?? desired.nickname ?? null,
  };
}

async function findExistingSquareCustomerByPhoneAndName(
  desired: {
    nickname: string | null;
    givenName: string | null;
    familyName: string | null;
    phoneNumber: string | null;
  },
  context: SquareAuthContext,
): Promise<SquareCustomer | null> {
  if (!desired.phoneNumber) return null;

  const response = await squareRawRequest(
    "/v2/customers/search",
    {
      method: "POST",
      body: JSON.stringify({
        limit: 100,
        query: {
          filter: {
            phone_number: {
              exact: desired.phoneNumber,
            },
          },
        },
      }),
    },
    context,
  );

  let data: SquareSearchCustomersResponse | Record<string, unknown> = {};
  try {
    data = (await response.json()) as SquareSearchCustomersResponse | Record<string, unknown>;
  } catch {
    return null;
  }

  if (!response.ok) {
    // Duplicate prevention helper should not hard-fail sync when search is unavailable.
    return null;
  }

  const customers = (data as SquareSearchCustomersResponse).customers;
  if (!Array.isArray(customers) || customers.length === 0) {
    return null;
  }

  const desiredComparableName = getDesiredComparableName(desired);
  const desiredDigits = digitsOnly(desired.phoneNumber);

  let best: { customer: SquareCustomer; score: number } | null = null;

  for (const candidate of customers) {
    const candidateDigits = digitsOnly(candidate.phone_number ?? null);
    if (!candidateDigits || candidateDigits !== desiredDigits) continue;

    const candidateComparableName = getSquareCustomerComparableName(candidate);
    const score = fuzzyNameScore(desiredComparableName, candidateComparableName);
    if (!best || score > best.score) {
      best = { customer: candidate, score };
    }
  }

  if (!best) return null;
  return best.score >= 0.5 ? best.customer : null;
}

export async function syncSquareCustomer(
  input: SquareCustomerSyncInput,
  context: SquareAuthContext,
): Promise<SquareCustomerSyncResult> {
  const desired = buildDesiredCustomerPayload(input);
  assertSquareRequiredIdentity(desired);

  if (!input.externalCustomerId) {
    const existingByPhoneAndName = await findExistingSquareCustomerByPhoneAndName(desired, context);
    if (existingByPhoneAndName) {
      const updatePatch = applyConservativeChanges(existingByPhoneAndName, desired);
      if (Object.keys(updatePatch).length > 0) {
        await updateSquareCustomer(existingByPhoneAndName.id, updatePatch, context);
      }

      return {
        externalCustomerId: existingByPhoneAndName.id,
        mode: Object.keys(updatePatch).length > 0 ? "updated" : "verified",
        path: "matched",
        squarePhoneNumber:
          normalizePhone(updatePatch.phone_number ?? null) ??
          normalizePhone(existingByPhoneAndName.phone_number ?? null),
        squareGivenName:
          (updatePatch.given_name?.trim() || null) ??
          (existingByPhoneAndName.given_name?.trim() || null),
        squareFamilyName:
          (updatePatch.family_name?.trim() || null) ??
          (existingByPhoneAndName.family_name?.trim() || null),
        squareNickname:
          (updatePatch.nickname?.trim() || null) ??
          (existingByPhoneAndName.nickname?.trim() || null),
      };
    }

    const created = await createSquareCustomer(input, context);
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

  const existing = await retrieveSquareCustomer(input.externalCustomerId, context);
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
