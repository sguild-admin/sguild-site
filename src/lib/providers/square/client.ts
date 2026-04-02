import { SyncEndpointError } from "@/lib/errors";
import type { SquareAuthContext } from "./types";
import type { SquareErrorResponse } from "./schema";

const DEFAULT_SQUARE_BASE_URL = "https://connect.squareup.com";
const DEFAULT_SQUARE_VERSION = "2024-06-04";

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

export function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return "{}";
  }
}

export function parseSquareErrorMessage(body: unknown): string {
  const data = body as SquareErrorResponse;
  const first = data.errors?.[0];
  return first?.detail || first?.code || "Square request failed.";
}

export function amountToMinorUnits(amount: number): bigint {
  return BigInt(Math.round(amount * 100));
}

export function minorUnitsToNumber(amount: bigint): number {
  return Number(amount);
}

export function normalizeCurrency(currency: string): string {
  return currency.trim().toUpperCase();
}

export async function squareRawRequest(
  path: string,
  init: RequestInit,
  context: SquareAuthContext,
): Promise<Response> {
  try {
    return await fetch(`${getSquareBaseUrl()}${path}`, {
      ...init,
      headers: {
        ...squareHeaders(context.accessToken),
        ...(init.headers ?? {}),
      },
      cache: "no-store",
    });
  } catch (error) {
    throw new SyncEndpointError("Failed to reach provider API.", 502, {
      rawPayload: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function squareRequest(
  path: string,
  init: RequestInit,
  context: SquareAuthContext,
): Promise<unknown> {
  const response = await squareRawRequest(path, init, context);
  let parsed: unknown = {};
  try {
    parsed = await response.json();
  } catch {
    // parsed body stays empty for non-json responses
  }

  if (!response.ok) {
    const parsedMessage = parseSquareErrorMessage(parsed);
    const authHint =
      response.status === 401 || parsedMessage.toLowerCase().includes("unauthorized")
        ? ` Check access token alias mapping and merchant ownership. alias=${context.accessTokenAlias}.`
        : "";

    throw new SyncEndpointError(
      `Square API error (${response.status}): ${parsedMessage}.${authHint}`.trim(),
      502,
      { rawPayload: safeStringify(parsed) },
    );
  }

  return parsed;
}

export async function squareGet(path: string, context: SquareAuthContext): Promise<unknown> {
  return squareRequest(path, { method: "GET" }, context);
}

export async function squarePost(
  path: string,
  body: unknown,
  context: SquareAuthContext,
): Promise<unknown> {
  return squareRequest(
    path,
    {
      method: "POST",
      body: JSON.stringify(body),
    },
    context,
  );
}

export async function squarePut(
  path: string,
  body: unknown,
  context: SquareAuthContext,
): Promise<unknown> {
  return squareRequest(
    path,
    {
      method: "PUT",
      body: JSON.stringify(body),
    },
    context,
  );
}
