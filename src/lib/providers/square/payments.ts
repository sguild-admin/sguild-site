import { SyncEndpointError } from "@/lib/errors";
import {
  amountToMinorUnits,
  minorUnitsToNumber,
  normalizeCurrency,
  safeStringify,
  squarePost,
} from "./client";
import type {
  SquareCreateOrderInput,
  SquareCreateOrderResult,
  SquareCreatePaymentInput,
  SquareCreatePaymentResult,
} from "./types";

function toSquareLineItemName(description: string | null, index: number): string {
  const trimmed = typeof description === "string" ? description.trim() : "";
  if (trimmed.length > 0) return trimmed;
  return `Order Item ${index + 1}`;
}

export async function createOrderFromOrderItems(
  input: SquareCreateOrderInput,
): Promise<SquareCreateOrderResult> {
  const currency = normalizeCurrency(input.currency);
  const lineItems = input.orderItems.map((item, index) => ({
    name: toSquareLineItemName(item.description, index),
    quantity: "1",
    base_price_money: {
      amount: minorUnitsToNumber(amountToMinorUnits(item.netAmount ?? 0)),
      currency,
    },
  }));

  const orderPayload = {
    idempotency_key: input.idempotencyKey,
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

export async function chargeWithCardOnFile(
  input: SquareCreatePaymentInput,
): Promise<SquareCreatePaymentResult> {
  const currency = normalizeCurrency(input.currency);
  let createdOrderId: string | null = null;
  let orderResponse: { order?: { id?: string } } | null = null;

  const usableItems = (input.lineItems ?? []).filter(
    (item) => (item.netAmount ?? 0) > 0,
  );

  if (usableItems.length > 0) {
    const lineItems = usableItems.map((item, index) => ({
      name: toSquareLineItemName(item.description, index),
      quantity: "1",
      base_price_money: {
        amount: minorUnitsToNumber(amountToMinorUnits(item.netAmount ?? 0)),
        currency,
      },
    }));

    const orderPayload = {
      idempotency_key: `${input.idempotencyKeyPrefix}:Order`,
      order: {
        location_id: input.context.externalLocationId,
        customer_id: input.externalCustomerId,
        line_items: lineItems,
      },
    };

    orderResponse = (await squarePost("/v2/orders", orderPayload, input.context)) as {
      order?: { id?: string };
    };
    createdOrderId = orderResponse.order?.id ?? null;
    if (!createdOrderId) {
      throw new SyncEndpointError("Square charge order creation returned no order ID.", 502, {
        rawPayload: safeStringify(orderResponse),
      });
    }
  }

  const payload = {
    idempotency_key: `${input.idempotencyKeyPrefix}:Payment`,
    source_id: input.externalCardId,
    customer_id: input.externalCustomerId,
    location_id: input.context.externalLocationId,
    ...(createdOrderId
      ? { order_id: createdOrderId }
      : {
          amount_money: {
            amount: minorUnitsToNumber(amountToMinorUnits(input.amountDue)),
            currency,
          },
        }),
    autocomplete: true,
  };

  const paymentResponse = (await squarePost("/v2/payments", payload, input.context)) as {
    payment?: { id?: string; order_id?: string };
  };

  const externalPaymentId = paymentResponse.payment?.id;
  if (!externalPaymentId) {
    throw new SyncEndpointError("Square charge succeeded without payment ID.", 502, {
      rawPayload: safeStringify(paymentResponse),
    });
  }

  return {
    externalPaymentId,
    externalOrderId: paymentResponse.payment?.order_id ?? createdOrderId,
    rawPayload: safeStringify({
      order: orderResponse,
      payment: paymentResponse,
    }),
  };
}
