import { SyncEndpointError } from "@/lib/errors";
import {
  amountToMinorUnits,
  minorUnitsToNumber,
  normalizeCurrency,
  parseSquareErrorMessage,
  safeStringify,
  squareRawRequest,
} from "@/lib/providers/square/client";
import { resolveSquareAuthContextFromAlias } from "@/lib/providers/square/provider-context";

export type CreateRefundAdapterInput = {
  provider: string;
  apiCredentialAlias: string;
  amount: number;
  currency: string;
  externalPaymentId: string | null;
  externalInvoiceId: string | null;
  idempotencyKey: string;
  metadata?: Record<string, string>;
};

export type CreateRefundAdapterResult = {
  result: "succeeded" | "noop";
  externalRefundId: string;
  externalStatus: string;
  providerReferenceId: string;
  httpStatusCode: number;
  responsePayload: string;
};

function isAlreadyRefundedMessage(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("already refunded") ||
    normalized.includes("payment has already been refunded") ||
    normalized.includes("duplicate")
  );
}

function isAmountExceedsAvailableMessage(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("exceeds the amount available to refund") ||
    normalized.includes("amount available to refund")
  );
}

function isPaymentNotFoundMessage(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("could not find payment with id") ||
    normalized.includes("payment with id") && normalized.includes("not found")
  );
}

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

function unique(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

async function findExistingSquareRefundByAmount(input: {
  accessTokenAlias: string;
  paymentId: string;
  amountMinor: number;
  currency: string;
}): Promise<{
  externalRefundId: string;
  externalStatus: string;
  responsePayload: string;
  httpStatusCode: number;
} | null> {
  const authContext = resolveSquareAuthContextFromAlias(input.accessTokenAlias);
  const params = new URLSearchParams({
    payment_id: input.paymentId,
    sort_order: "DESC",
  });
  const response = await squareRawRequest(
    `/v2/refunds?${params.toString()}`,
    { method: "GET" },
    authContext,
  );
  const parsedBody = await readJsonBody(response);
  if (!response.ok) return null;

  const targetCurrency = normalizeCurrency(input.currency).toUpperCase();
  const refunds =
    (parsedBody as {
      refunds?: Array<{
        id?: unknown;
        status?: unknown;
        amount_money?: { amount?: unknown; currency?: unknown };
      }>;
    }).refunds ?? [];

  for (const refund of refunds) {
    const refundId = asNonEmptyString(refund.id);
    if (!refundId) continue;
    const amount = typeof refund.amount_money?.amount === "number"
      ? refund.amount_money.amount
      : Number(refund.amount_money?.amount ?? NaN);
    if (!Number.isFinite(amount)) continue;
    const currency = asNonEmptyString(refund.amount_money?.currency)?.toUpperCase() ?? "";
    if (amount !== input.amountMinor || currency !== targetCurrency) continue;
    return {
      externalRefundId: refundId,
      externalStatus: asNonEmptyString(refund.status) ?? "pending",
      responsePayload: safeStringify(parsedBody),
      httpStatusCode: response.status || 200,
    };
  }

  return null;
}

async function resolveSquarePaymentId(input: {
  accessTokenAlias: string;
  externalPaymentId: string | null;
  externalInvoiceId: string | null;
}): Promise<string> {
  const authContext = resolveSquareAuthContextFromAlias(input.accessTokenAlias);
  if (input.externalPaymentId) {
    const verifyResponse = await squareRawRequest(
      `/v2/payments/${encodeURIComponent(input.externalPaymentId)}`,
      { method: "GET" },
      authContext,
    );
    if (verifyResponse.ok) return input.externalPaymentId;

    const verifyBody = await readJsonBody(verifyResponse);
    const verifyMessage = parseSquareErrorMessage(verifyBody);
    if (!(verifyResponse.status === 404 && input.externalInvoiceId)) {
      throw new SyncEndpointError(
        `Square payment lookup failed (${verifyResponse.status}): ${verifyMessage}`,
        verifyResponse.status || 502,
        { rawPayload: safeStringify(verifyBody) },
      );
    }
  }

  if (!input.externalInvoiceId) {
    throw new SyncEndpointError("Order External is missing External Payment ID or External Invoice ID.", 422);
  }

  const invoiceResponse = await squareRawRequest(
    `/v2/invoices/${encodeURIComponent(input.externalInvoiceId)}`,
    { method: "GET" },
    authContext,
  );
  const invoiceBody = await readJsonBody(invoiceResponse);
  if (!invoiceResponse.ok) {
    const message = parseSquareErrorMessage(invoiceBody);
    throw new SyncEndpointError(
      `Square invoice lookup failed (${invoiceResponse.status}): ${message}`,
      invoiceResponse.status || 502,
      { rawPayload: safeStringify(invoiceBody) },
    );
  }

  const orderId =
    asNonEmptyString((invoiceBody as { invoice?: { order_id?: unknown } }).invoice?.order_id) ??
    asNonEmptyString((invoiceBody as { order_id?: unknown }).order_id);
  if (!orderId) {
    throw new SyncEndpointError("Square invoice did not include a resolvable order ID.", 409);
  }

  // Prefer direct order retrieval first; this avoids environments where /v2/payments/search is unavailable.
  const orderResponse = await squareRawRequest(
    `/v2/orders/${encodeURIComponent(orderId)}`,
    { method: "GET" },
    authContext,
  );
  const orderBody = await readJsonBody(orderResponse);
  if (orderResponse.ok) {
    const orderPaymentIds = unique(
      (
        (orderBody as { order?: { tenders?: Array<{ payment_id?: unknown }> } }).order?.tenders ?? []
      ).map((tender) => asNonEmptyString(tender.payment_id)),
    );
    if (orderPaymentIds.length === 1) return orderPaymentIds[0];
    if (orderPaymentIds.length > 1) {
      throw new SyncEndpointError("Multiple payment IDs were found on the provider order. Ambiguous refund target.", 409);
    }
  }

  const searchResponse = await squareRawRequest(
    "/v2/payments/search",
    {
      method: "POST",
      body: JSON.stringify({
        query: {
          filter: {
            order_ids: [orderId],
          },
          sort: {
            sort_field: "CREATED_AT",
            sort_order: "DESC",
          },
        },
        limit: 10,
      }),
    },
    authContext,
  );
  const searchBody = await readJsonBody(searchResponse);
  if (!searchResponse.ok) {
    const message = parseSquareErrorMessage(searchBody);
    throw new SyncEndpointError(
      `Square payment search failed (${searchResponse.status}): ${message}.`,
      searchResponse.status || 502,
      { rawPayload: safeStringify(searchBody) },
    );
  }

  const payments = (searchBody as { payments?: Array<{ id?: string; status?: string }> }).payments ?? [];
  const completed = payments.filter((payment) => {
    const id = asNonEmptyString(payment.id);
    if (!id) return false;
    const status = asNonEmptyString(payment.status)?.toUpperCase();
    return !status || status === "COMPLETED";
  });

  if (completed.length === 0) {
    throw new SyncEndpointError("No completed provider payment was found for the resolved invoice order.", 422);
  }

  const uniquePaymentIds = Array.from(
    new Set(completed.map((payment) => asNonEmptyString(payment.id)).filter((id): id is string => Boolean(id))),
  );
  if (uniquePaymentIds.length !== 1) {
    throw new SyncEndpointError(
      "Multiple provider payments found for invoice order. Ambiguous refund target.",
      409,
    );
  }

  return uniquePaymentIds[0];
}

export async function createProviderRefund(input: CreateRefundAdapterInput): Promise<CreateRefundAdapterResult> {
  const provider = input.provider.trim().toLowerCase();
  if (provider !== "square") {
    throw new SyncEndpointError("Provider is not supported for refund external processing.", 422);
  }

  if (!(input.amount > 0)) {
    throw new SyncEndpointError("Refund Amount must be greater than zero.", 422);
  }

  const context = resolveSquareAuthContextFromAlias(input.apiCredentialAlias);
  const paymentId = await resolveSquarePaymentId({
    accessTokenAlias: input.apiCredentialAlias,
    externalPaymentId: input.externalPaymentId,
    externalInvoiceId: input.externalInvoiceId,
  });

  const executeSquareRefundCreate = async (targetPaymentId: string): Promise<CreateRefundAdapterResult> => {
    const amountMinor = minorUnitsToNumber(amountToMinorUnits(input.amount));
    const normalizedCurrency = normalizeCurrency(input.currency);
    const payload = {
      idempotency_key: input.idempotencyKey,
      payment_id: targetPaymentId,
      amount_money: {
        amount: amountMinor,
        currency: normalizedCurrency,
      },
      ...(input.metadata && Object.keys(input.metadata).length > 0 ? { metadata: input.metadata } : {}),
    };

    const response = await squareRawRequest(
      "/v2/refunds",
      {
        method: "POST",
        headers: {
          "Idempotency-Key": input.idempotencyKey,
        },
        body: JSON.stringify(payload),
      },
      context,
    );

    const parsedBody = await readJsonBody(response);
    const responsePayload = safeStringify(parsedBody);

    const refundId = asNonEmptyString(
      (parsedBody as { refund?: { id?: unknown } }).refund?.id,
    );
    const externalStatus =
      asNonEmptyString((parsedBody as { refund?: { status?: unknown } }).refund?.status) ?? "pending";

    if (!response.ok) {
      const message = parseSquareErrorMessage(parsedBody);
      if (isAlreadyRefundedMessage(message) && refundId) {
        return {
          result: "noop",
          externalRefundId: refundId,
          externalStatus,
          providerReferenceId: refundId,
          httpStatusCode: response.status || 409,
          responsePayload,
        };
      }
      if (isAmountExceedsAvailableMessage(message)) {
        const existingRefund = await findExistingSquareRefundByAmount({
          accessTokenAlias: input.apiCredentialAlias,
          paymentId: targetPaymentId,
          amountMinor,
          currency: normalizedCurrency,
        });
        if (existingRefund) {
          return {
            result: "noop",
            externalRefundId: existingRefund.externalRefundId,
            externalStatus: existingRefund.externalStatus,
            providerReferenceId: existingRefund.externalRefundId,
            httpStatusCode: existingRefund.httpStatusCode,
            responsePayload: existingRefund.responsePayload,
          };
        }
      }

      throw new SyncEndpointError(
        `Square refund create failed (${response.status}): ${message}`,
        response.status || 502,
        { rawPayload: responsePayload },
      );
    }

    if (!refundId) {
      throw new SyncEndpointError("Square refund response did not include refund ID.", 502, {
        rawPayload: responsePayload,
      });
    }

    return {
      result: "succeeded",
      externalRefundId: refundId,
      externalStatus,
      providerReferenceId: refundId,
      httpStatusCode: response.status || 200,
      responsePayload,
    };
  };

  try {
    return await executeSquareRefundCreate(paymentId);
  } catch (error) {
    if (
      error instanceof SyncEndpointError &&
      error.status === 404 &&
      input.externalInvoiceId &&
      isPaymentNotFoundMessage(error.message)
    ) {
      const invoiceResolvedPaymentId = await resolveSquarePaymentId({
        accessTokenAlias: input.apiCredentialAlias,
        externalPaymentId: null,
        externalInvoiceId: input.externalInvoiceId,
      });
      if (invoiceResolvedPaymentId !== paymentId) {
        return executeSquareRefundCreate(invoiceResolvedPaymentId);
      }
    }
    throw error;
  }
}
