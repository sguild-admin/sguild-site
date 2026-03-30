import { readString } from "@/lib/utils/strings";

export type SquareWebhookPayload = {
  merchant_id?: string;
  type?: string;
  event_id?: string;
  created_at?: string;
};

export type MetaWebhookPayload = {
  entry?: Array<{
    id?: string;
    changes?: Array<{
      field?: string;
      value?: { leadgen_id?: string; page_id?: string };
    }>;
  }>;
};

export const SUPPORTED_SQUARE_WEBHOOK_EVENTS = new Set([
  "invoice.payment_made",
  "invoice.canceled",
  "invoice.refunded",
  "refund.updated",
]);

export { readString };
