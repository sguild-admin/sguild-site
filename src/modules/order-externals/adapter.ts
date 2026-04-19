import { SyncEndpointError } from "@/lib/errors";
import {
  amountToMinorUnits,
  minorUnitsToNumber,
  normalizeCurrency,
  parseSquareErrorMessage,
  safeStringify,
  squareRawRequest,
} from "@/lib/providers/square/client";
import type { SquareProviderContext } from "@/lib/providers/square/types";

export type GetProviderPaymentResult = {
  status: string;
  amountCents: number;
  currency: string;
  completedAt: string | null;
};

export async function getProviderPayment(input: {
  provider: string;
  context: SquareProviderContext;
  externalPaymentId: string;
}): Promise<GetProviderPaymentResult> {
  const provider = input.provider.trim().toLowerCase();
  if (provider !== "square") {
    throw new SyncEndpointError(`Unsupported provider '${input.provider}'.`, 422);
  }

  const response = await squareRawRequest(
    `/v2/payments/${encodeURIComponent(input.externalPaymentId)}`,
    { method: "GET" },
    input.context,
  );

  const parsedBody = await readJsonBody(response);
  if (!response.ok) {
    const message = parseSquareErrorMessage(parsedBody);
    throw new SyncEndpointError(
      `Square get payment failed (${response.status}): ${message}`,
      response.status || 502,
      { rawPayload: safeStringify(parsedBody) },
    );
  }

  const payment = (parsedBody as {
    payment?: {
      status?: unknown;
      amount_money?: { amount?: unknown; currency?: unknown };
      updated_at?: unknown;
      created_at?: unknown;
    };
  }).payment;

  const amountRaw = payment?.amount_money?.amount;
  const amountCents = typeof amountRaw === "number" ? amountRaw : 0;

  return {
    status: asNonEmptyString(payment?.status) ?? "UNKNOWN",
    amountCents,
    currency: asNonEmptyString(payment?.amount_money?.currency) ?? "USD",
    completedAt: parseIsoString(payment?.updated_at) ?? parseIsoString(payment?.created_at),
  };
}

export type CreateProviderChargeInput = {
  provider: string;
  context: SquareProviderContext;
  externalCustomerId: string;
  externalCardId: string;
  amount: number;
  currency: string;
  idempotencyKey: string;
  referenceId: string;
  note?: string;
};

export type CreateProviderChargeResult = {
  result: "succeeded";
  externalPaymentId: string;
  externalOrderId: string | null;
  externalStatus: string;
  providerReferenceId: string;
  httpStatusCode: number;
  responsePayload: string;
  activityAt: string | null;
};

async function readJsonBody(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseIsoString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function unsupportedProvider(provider: string): never {
  throw new SyncEndpointError(`Unsupported provider '${provider}'.`, 422);
}

export async function createProviderCharge(
  input: CreateProviderChargeInput,
): Promise<CreateProviderChargeResult> {
  const provider = input.provider.trim().toLowerCase();
  if (provider !== "square") unsupportedProvider(input.provider);

  const response = await squareRawRequest(
    "/v2/payments",
    {
      method: "POST",
      body: JSON.stringify({
        idempotency_key: input.idempotencyKey,
        source_id: input.externalCardId,
        customer_id: input.externalCustomerId,
        location_id: input.context.externalLocationId,
        reference_id: input.referenceId,
        note: input.note,
        amount_money: {
          amount: minorUnitsToNumber(amountToMinorUnits(input.amount)),
          currency: normalizeCurrency(input.currency),
        },
        autocomplete: true,
      }),
    },
    input.context,
  );

  const parsedBody = await readJsonBody(response);
  if (!response.ok) {
    const message = parseSquareErrorMessage(parsedBody);
    throw new SyncEndpointError(
      `Square charge failed (${response.status}): ${message}`,
      response.status || 502,
      { rawPayload: safeStringify(parsedBody) },
    );
  }

  const payment = (parsedBody as {
    payment?: {
      id?: unknown;
      order_id?: unknown;
      status?: unknown;
      updated_at?: unknown;
      created_at?: unknown;
    };
  }).payment;

  const externalPaymentId = asNonEmptyString(payment?.id);
  if (!externalPaymentId) {
    throw new SyncEndpointError("Square charge succeeded without payment ID.", 502, {
      rawPayload: safeStringify(parsedBody),
    });
  }

  return {
    result: "succeeded",
    externalPaymentId,
    externalOrderId: asNonEmptyString(payment?.order_id),
    externalStatus: asNonEmptyString(payment?.status) ?? "COMPLETED",
    providerReferenceId: externalPaymentId,
    httpStatusCode: response.status || 200,
    responsePayload: safeStringify(parsedBody),
    activityAt: parseIsoString(payment?.updated_at) ?? parseIsoString(payment?.created_at),
  };
}
