import type { ProcessRefundWebhookEventInput, RefundEvent } from "./dto";
import { SyncEndpointError } from "@/lib/errors";
import type { ProcessRefundRequestDto } from "./dto";

export function parseRefundWebhookEvent(input: ProcessRefundWebhookEventInput): RefundEvent {
  if (input.eventType !== "refund.updated") {
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

function readOptionalTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function parseProcessRefundBody(body: unknown): ProcessRefundRequestDto {
  if (typeof body !== "object" || body == null || Array.isArray(body)) {
    throw new SyncEndpointError("Invalid request body.", 400);
  }

  const typed = body as {
    recordId?: unknown;
    force?: unknown;
    retryExternalActionId?: unknown;
    idempotencyKey?: unknown;
  };

  const recordId = readOptionalTrimmedString(typed.recordId) ?? "";
  if (!recordId) {
    throw new SyncEndpointError("Missing recordId.", 400);
  }

  return {
    recordId,
    force: typed.force === true,
    retryExternalActionId: readOptionalTrimmedString(typed.retryExternalActionId),
    idempotencyKey: readOptionalTrimmedString(typed.idempotencyKey),
  };
}
