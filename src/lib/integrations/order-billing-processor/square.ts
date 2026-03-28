import { OrderItem } from "./airtable";
import { SyncEndpointError } from "./response";
import { ProviderContext } from "./provider-context";

const DEFAULT_SQUARE_BASE_URL = "https://connect.squareup.com";
const DEFAULT_SQUARE_VERSION = "2024-06-04";

type SquareErrorResponse = {
  errors?: Array<{
    category?: string;
    code?: string;
    detail?: string;
  }>;
};

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

function parseSquareErrorMessage(body: unknown): string {
  const data = body as SquareErrorResponse;
  const first = data.errors?.[0];
  return first?.detail || first?.code || "Square request failed.";
}

function amountToMinorUnits(amount: number): bigint {
  return BigInt(Math.round(amount * 100));
}

function minorUnitsToNumber(amount: bigint): number {
  return Number(amount);
}

function normalizeCurrency(currency: string): string {
  return currency.trim().toUpperCase();
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return "{}";
  }
}

async function squarePost(
  path: string,
  body: unknown,
  context: ProviderContext,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(`${getSquareBaseUrl()}${path}`, {
      method: "POST",
      headers: squareHeaders(context.accessToken),
      body: JSON.stringify(body),
      cache: "no-store",
    });
  } catch (error) {
    throw new SyncEndpointError("Failed to reach provider API.", 502, {
      rawPayload: error instanceof Error ? error.message : String(error),
    });
  }

  let parsed: unknown = {};
  try {
    parsed = await response.json();
  } catch {
    // handled below if not ok
  }

  if (!response.ok) {
    const parsedMessage = parseSquareErrorMessage(parsed);
    const authHint =
      response.status === 401 || parsedMessage.toLowerCase().includes("unauthorized")
        ? ` Check Access Token alias mapping and merchant/location ownership. alias=${context.accessTokenAlias}, locationId=${context.externalLocationId}.`
        : "";

    throw new SyncEndpointError(
      `Square API error (${response.status}): ${parsedMessage}.${authHint}`.trim(),
      502,
      { rawPayload: safeStringify(parsed) },
    );
  }

  return parsed;
}

async function squareGet(path: string, context: ProviderContext): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(`${getSquareBaseUrl()}${path}`, {
      method: "GET",
      headers: squareHeaders(context.accessToken),
      cache: "no-store",
    });
  } catch (error) {
    throw new SyncEndpointError("Failed to reach provider API.", 502, {
      rawPayload: error instanceof Error ? error.message : String(error),
    });
  }

  let parsed: unknown = {};
  try {
    parsed = await response.json();
  } catch {
    // handled below if not ok
  }

  if (!response.ok) {
    const parsedMessage = parseSquareErrorMessage(parsed);
    throw new SyncEndpointError(`Square API error (${response.status}): ${parsedMessage}.`, 502, {
      rawPayload: safeStringify(parsed),
    });
  }

  return parsed;
}

export async function chargeWithCardOnFile(input: {
  context: ProviderContext;
  orderExternalRecordId: string;
  externalCustomerId: string;
  externalCardId: string;
  amountDue: number;
  currency: string;
}): Promise<{
  externalPaymentId: string;
  externalOrderId: string | null;
  rawPayload: string;
}> {
  const payload = {
    idempotency_key: `${input.orderExternalRecordId}:Charge`,
    source_id: input.externalCardId,
    customer_id: input.externalCustomerId,
    location_id: input.context.externalLocationId,
    amount_money: {
      amount: minorUnitsToNumber(amountToMinorUnits(input.amountDue)),
      currency: normalizeCurrency(input.currency),
    },
    autocomplete: true,
  };

  const response = (await squarePost("/v2/payments", payload, input.context)) as {
    payment?: { id?: string; order_id?: string };
  };

  const externalPaymentId = response.payment?.id;
  if (!externalPaymentId) {
    throw new SyncEndpointError("Square charge succeeded without payment ID.", 502, {
      rawPayload: safeStringify(response),
    });
  }

  return {
    externalPaymentId,
    externalOrderId: response.payment?.order_id ?? null,
    rawPayload: safeStringify(response),
  };
}

function buildInvoiceDueDateIso(daysFromToday: number): string {
  const now = new Date();
  now.setUTCDate(now.getUTCDate() + daysFromToday);
  return now.toISOString().slice(0, 10);
}

export async function createInvoiceFromOrderItems(input: {
  context: ProviderContext;
  orderExternalRecordId: string;
  externalCustomerId: string;
  orderItems: OrderItem[];
  currency: string;
}): Promise<{
  externalOrderId: string;
  externalInvoiceId: string;
  externalInvoiceUrl: string | null;
  rawPayload: string;
}> {
  const currency = normalizeCurrency(input.currency);
  const lineItems = input.orderItems.map((item) => ({
    name: item.description,
    quantity: "1",
    base_price_money: {
      amount: minorUnitsToNumber(amountToMinorUnits(item.netAmount ?? 0)),
      currency,
    },
  }));

  const orderPayload = {
    idempotency_key: `${input.orderExternalRecordId}:Invoice:Order`,
    order: {
      location_id: input.context.externalLocationId,
      customer_id: input.externalCustomerId,
      line_items: lineItems,
    },
  };

  const orderResponse = (await squarePost("/v2/orders", orderPayload, input.context)) as {
    order?: { id?: string };
  };

  const externalOrderId = orderResponse.order?.id;
  if (!externalOrderId) {
    throw new SyncEndpointError("Square invoice order creation returned no order ID.", 502, {
      rawPayload: safeStringify(orderResponse),
    });
  }

  const invoicePayload = {
    idempotency_key: `${input.orderExternalRecordId}:Invoice:Invoice`,
    invoice: {
      location_id: input.context.externalLocationId,
      order_id: externalOrderId,
      delivery_method: "SHARE_MANUALLY",
      primary_recipient: {
        customer_id: input.externalCustomerId,
      },
      accepted_payment_methods: {
        card: true,
      },
      payment_requests: [
        {
          request_type: "BALANCE",
          due_date: buildInvoiceDueDateIso(7),
        },
      ],
    },
  };

  const invoiceResponse = (await squarePost("/v2/invoices", invoicePayload, input.context)) as {
    invoice?: { id?: string; public_url?: string };
  };

  const externalInvoiceId = invoiceResponse.invoice?.id;
  if (!externalInvoiceId) {
    throw new SyncEndpointError("Square invoice creation returned no invoice ID.", 502, {
      rawPayload: safeStringify(invoiceResponse),
    });
  }

  const retrieveResponse = (await squareGet(
    `/v2/invoices/${encodeURIComponent(externalInvoiceId)}`,
    input.context,
  )) as {
    invoice?: { public_url?: string };
  };

  const externalInvoiceUrl =
    invoiceResponse.invoice?.public_url ?? retrieveResponse.invoice?.public_url ?? null;

  return {
    externalOrderId,
    externalInvoiceId,
    externalInvoiceUrl,
    rawPayload: safeStringify({
      order: orderResponse,
      invoice: invoiceResponse,
      invoice_retrieve: retrieveResponse,
    }),
  };
}

export async function createOrderFromOrderItems(input: {
  context: ProviderContext;
  orderExternalRecordId: string;
  externalCustomerId: string;
  orderItems: OrderItem[];
  currency: string;
}): Promise<{
  externalOrderId: string;
  rawPayload: string;
}> {
  const currency = normalizeCurrency(input.currency);
  const lineItems = input.orderItems.map((item) => ({
    name: item.description,
    quantity: "1",
    base_price_money: {
      amount: minorUnitsToNumber(amountToMinorUnits(item.netAmount ?? 0)),
      currency,
    },
  }));

  const orderPayload = {
    idempotency_key: `${input.orderExternalRecordId}:CreateOrder`,
    order: {
      location_id: input.context.externalLocationId,
      customer_id: input.externalCustomerId,
      line_items: lineItems,
    },
  };

  const orderResponse = (await squarePost("/v2/orders", orderPayload, input.context)) as {
    order?: { id?: string };
  };

  const externalOrderId = orderResponse.order?.id;
  if (!externalOrderId) {
    throw new SyncEndpointError("Square order creation returned no order ID.", 502, {
      rawPayload: safeStringify(orderResponse),
    });
  }

  return {
    externalOrderId,
    rawPayload: safeStringify(orderResponse),
  };
}

export async function getInvoicePublicUrl(input: {
  context: ProviderContext;
  externalInvoiceId: string;
}): Promise<string | null> {
  const retrieveResponse = (await squareGet(
    `/v2/invoices/${encodeURIComponent(input.externalInvoiceId)}`,
    input.context,
  )) as {
    invoice?: { public_url?: string };
  };

  const url = retrieveResponse.invoice?.public_url;
  return typeof url === "string" && url.trim().length > 0 ? url.trim() : null;
}

export async function getInvoiceDetails(input: {
  context: ProviderContext;
  externalInvoiceId: string;
}): Promise<{
  externalInvoiceId: string;
  status: string | null;
  version: number | null;
  externalOrderId: string | null;
  publicUrl: string | null;
  rawPayload: string;
}> {
  const retrieveResponse = (await squareGet(
    `/v2/invoices/${encodeURIComponent(input.externalInvoiceId)}`,
    input.context,
  )) as {
    invoice?: {
      id?: string;
      status?: string;
      version?: number;
      order_id?: string;
      public_url?: string;
    };
  };

  return {
    externalInvoiceId: retrieveResponse.invoice?.id ?? input.externalInvoiceId,
    status: retrieveResponse.invoice?.status ?? null,
    version:
      typeof retrieveResponse.invoice?.version === "number"
        ? retrieveResponse.invoice.version
        : null,
    externalOrderId: retrieveResponse.invoice?.order_id ?? null,
    publicUrl: retrieveResponse.invoice?.public_url ?? null,
    rawPayload: safeStringify(retrieveResponse),
  };
}

export async function cancelInvoice(input: {
  context: ProviderContext;
  externalInvoiceId: string;
  version: number;
}): Promise<{ rawPayload: string }> {
  const response = await squarePost(
    `/v2/invoices/${encodeURIComponent(input.externalInvoiceId)}/cancel`,
    {
      version: input.version,
    },
    input.context,
  );

  return {
    rawPayload: safeStringify(response),
  };
}
