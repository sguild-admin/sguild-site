import type { ProcessRefundWebhookEventInput, RefundEvent } from "./dto";

export function parseRefundWebhookEvent(input: ProcessRefundWebhookEventInput): RefundEvent {
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
