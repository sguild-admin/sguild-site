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
  phoneNumber: string | null;
  emailAddress: string | null;
} {
  return {
    nickname: clientExternal.nameSnapshot?.trim() || null,
    phoneNumber: normalizePhone(clientExternal.phoneSnapshot ?? clientExternal.matchPhoneNormalized),
    emailAddress: clientExternal.emailSnapshot?.trim() || null,
  };
}

function requireUsableName(name: string | null): string {
  if (!name) {
    throw new SyncEndpointError("Missing customer name for Square sync.", 422);
  }
  return name;
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
  desired: { nickname: string | null; phoneNumber: string | null; emailAddress: string | null },
): Record<string, string> {
  const patch: Record<string, string> = {};

  if (desired.nickname && desired.nickname !== (existing.nickname ?? "").trim()) {
    patch.nickname = desired.nickname;
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
): Promise<string> {
  const desired = buildDesiredCustomerPayload(clientExternal);
  const nickname = requireUsableName(desired.nickname);

  const body: Record<string, string> = {
    idempotency_key: deterministicCreateIdempotencyKey(clientExternal.recordId),
    nickname,
    reference_id: clientExternal.recordId,
  };

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

  return createdCustomerId;
}

export async function syncSquareCustomer(
  clientExternal: ClientExternalRecord,
  context: SquareContext,
): Promise<SyncSquareCustomerResult> {
  const desired = buildDesiredCustomerPayload(clientExternal);
  requireUsableName(desired.nickname);

  if (!clientExternal.externalCustomerId) {
    const externalCustomerId = await createSquareCustomer(clientExternal, context);
    return { externalCustomerId, mode: "created", path: "create" };
  }

  const existing = await retrieveSquareCustomer(clientExternal.externalCustomerId, context);
  const updatePatch = applyConservativeChanges(existing, desired);
  if (Object.keys(updatePatch).length === 0) {
    return {
      externalCustomerId: existing.id,
      mode: "verified",
      path: "verify",
    };
  }

  await updateSquareCustomer(existing.id, updatePatch, context);
  return {
    externalCustomerId: existing.id,
    mode: "updated",
    path: "update",
  };
}

