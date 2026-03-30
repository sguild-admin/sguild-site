export type RefundEvent = {
  provider: "Square";
  eventType: "invoice.refunded" | "refund.updated";
  providerEventId: string;
  merchantId: string | null;
  occurredAt: string | null;
  payloadJson: string;
};

export function parseRefundWebhookEvent(input: {
  eventType: string;
  providerEventId: string;
  merchantId: string | null;
  occurredAt: string | null;
  payloadJson: string;
}): RefundEvent {
  if (input.eventType !== "invoice.refunded" && input.eventType !== "refund.updated") {
    throw new Error("Unsupported refund event type.");
  }

  return {
    provider: "Square",
    eventType: input.eventType,
    providerEventId: input.providerEventId,
    merchantId: input.merchantId,
    occurredAt: input.occurredAt,
    payloadJson: input.payloadJson,
  };
}
