import { parseRefundWebhookEvent } from "./schema";
import type { ProcessRefundWebhookEventInput } from "./dto";

export async function processRefundWebhookEvent(input: ProcessRefundWebhookEventInput) {
  return parseRefundWebhookEvent(input);
}
