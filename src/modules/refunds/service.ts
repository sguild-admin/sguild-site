import { parseRefundWebhookEvent } from "./schema";

export async function processRefundWebhookEvent(input: {
  eventType: string;
  providerEventId: string;
  merchantId: string | null;
  occurredAt: string | null;
  payloadJson: string;
}) {
  return parseRefundWebhookEvent(input);
}
