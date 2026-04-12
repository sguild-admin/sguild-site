import { SyncEndpointError } from "@/lib/errors";
import { normalizeCurrency, safeStringify, squareGet, squarePost, squarePut } from "./client";
import type {
  SquareCreateInvoiceFromOrderInput,
  SquareCreateInvoiceFromOrderResult,
  SquareProviderContext,
} from "./types";

function buildInvoiceDueDateIso(daysFromToday: number): string {
  const now = new Date();
  now.setUTCDate(now.getUTCDate() + daysFromToday);
  return now.toISOString().slice(0, 10);
}

function toSquareDeliveryMethod(value: string | null | undefined): "EMAIL" | "SMS" | "SHARE_MANUALLY" {
  const normalized = (value ?? "").trim().toLowerCase();
  if (normalized === "email") return "EMAIL";
  if (normalized === "sms") return "SMS";
  if (normalized === "url") return "SHARE_MANUALLY";
  return "SHARE_MANUALLY";
}

function toSquareLineItemName(description: string | null, index: number): string {
  const trimmed = typeof description === "string" ? description.trim() : "";
  if (trimmed.length > 0) return trimmed;
  return `Order Item ${index + 1}`;
}

export async function createInvoiceFromOrderItems(
  input: SquareCreateInvoiceFromOrderInput,
): Promise<SquareCreateInvoiceFromOrderResult> {
  const currency = normalizeCurrency(input.currency);
  const positiveItems = input.orderItems.filter((item) => (item.netAmount ?? 0) > 0);
  const negativeItems = input.orderItems.filter((item) => (item.netAmount ?? 0) < 0);

  const lineItems = positiveItems.map((item, index) => ({
    name: toSquareLineItemName(item.description, index),
    quantity: "1",
    base_price_money: {
      amount: Math.round((item.netAmount ?? 0) * 100),
      currency,
    },
  }));

  if (lineItems.length === 0) {
    throw new SyncEndpointError("Invoice creation requires at least one positive line item.", 422);
  }

  const discounts = negativeItems.map((item, index) => ({
    uid: `promotion-discount-${index + 1}`,
    name:
      typeof item.description === "string" && item.description.trim().length > 0
        ? item.description.trim()
        : `Promotion Discount ${index + 1}`,
    scope: "ORDER" as const,
    type: "FIXED_AMOUNT" as const,
    amount_money: {
      amount: Math.round(Math.abs(item.netAmount ?? 0) * 100),
      currency,
    },
  }));

  const orderPayload = {
    idempotency_key: input.orderIdempotencyKey,
    order: {
      location_id: input.context.externalLocationId,
      customer_id: input.externalCustomerId,
      line_items: lineItems,
      ...(discounts.length > 0 ? { discounts } : {}),
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
    idempotency_key: input.invoiceIdempotencyKey,
    invoice: {
      location_id: input.context.externalLocationId,
      order_id: externalOrderId,
      delivery_method: toSquareDeliveryMethod(input.deliveryMethod),
      store_payment_method_enabled: input.saveCard ?? true,
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
          automatic_payment_source: "NONE",
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

export async function getInvoicePublicUrl(input: {
  context: SquareProviderContext;
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
  context: SquareProviderContext;
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
  context: SquareProviderContext;
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

export async function publishInvoice(input: {
  context: SquareProviderContext;
  externalInvoiceId: string;
  version: number;
  idempotencyKey: string;
}): Promise<{
  externalStatus: string | null;
  hostedInvoiceUrl: string | null;
  version: number | null;
  rawPayload: string;
}> {
  const response = (await squarePost(
    `/v2/invoices/${encodeURIComponent(input.externalInvoiceId)}/publish`,
    {
      version: input.version,
      idempotency_key: input.idempotencyKey,
    },
    input.context,
  )) as {
    invoice?: {
      status?: string;
      public_url?: string;
      version?: number;
    };
  };

  return {
    externalStatus: response.invoice?.status ?? null,
    hostedInvoiceUrl: response.invoice?.public_url ?? null,
    version: typeof response.invoice?.version === "number" ? response.invoice.version : null,
    rawPayload: safeStringify(response),
  };
}

export async function updateInvoiceSettings(input: {
  context: SquareProviderContext;
  externalInvoiceId: string;
  version: number;
  deliveryMethod?: string | null;
  saveCard: boolean;
  externalCustomerId?: string | null;
}): Promise<{
  externalStatus: string | null;
  hostedInvoiceUrl: string | null;
  version: number | null;
  rawPayload: string;
}> {
  const response = (await squarePut(
    `/v2/invoices/${encodeURIComponent(input.externalInvoiceId)}`,
    {
      invoice: {
        version: input.version,
        delivery_method: toSquareDeliveryMethod(input.deliveryMethod),
        store_payment_method_enabled: input.saveCard,
        ...(input.externalCustomerId
          ? {
              primary_recipient: {
                customer_id: input.externalCustomerId,
              },
            }
          : {}),
        accepted_payment_methods: {
          card: true,
        },
      },
    },
    input.context,
  )) as {
    invoice?: {
      status?: string;
      public_url?: string;
      version?: number;
    };
  };

  return {
    externalStatus: response.invoice?.status ?? null,
    hostedInvoiceUrl: response.invoice?.public_url ?? null,
    version: typeof response.invoice?.version === "number" ? response.invoice.version : null,
    rawPayload: safeStringify(response),
  };
}
