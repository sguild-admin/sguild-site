import crypto from "crypto";
import {
  createWebhookDelivery,
  createWebhookEvent,
  findWebhookEventByEventKey,
  updateWebhookEvent,
  validateSquareSignature,
} from "./ports";

export {
  createWebhookDelivery,
  createWebhookEvent,
  findWebhookEventByEventKey,
  updateWebhookEvent,
  validateSquareSignature,
};

export function createMetaSignature(rawBody: string, appSecret: string): string {
  return "sha256=" + crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex");
}

export function timingSafeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}
