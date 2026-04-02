export type ProcessRefundWebhookEventInput = {
  eventType: string;
  providerEventId: string;
  merchantId: string | null;
  occurredAt: string | null;
  payloadJson: string;
};

export type RefundEvent = {
  provider: "Square";
  eventType: "invoice.refunded" | "refund.updated";
  providerEventId: string;
  merchantId: string | null;
  occurredAt: string | null;
  payloadJson: string;
};

