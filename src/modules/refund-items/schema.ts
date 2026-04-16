import { SyncEndpointError } from "@/lib/errors";
import type {
  RefundItemDebitRequestDto,
  RefundItemRecordIdRequestDto,
} from "./dto";

function readOptionalTrimmedString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function parseRefundItemRecordIdBody(
  body: unknown,
): RefundItemRecordIdRequestDto {
  if (typeof body !== "object" || body == null || Array.isArray(body)) {
    throw new SyncEndpointError("Invalid request body.", 400);
  }

  const typed = body as { recordId?: unknown };
  const recordId = readOptionalTrimmedString(typed.recordId) ?? "";

  if (!recordId) {
    throw new SyncEndpointError("Missing recordId.", 400);
  }

  return { recordId };
}

export function parseRefundItemDebitBody(body: unknown): RefundItemDebitRequestDto {
  if (typeof body !== "object" || body == null || Array.isArray(body)) {
    throw new SyncEndpointError("Invalid request body.", 400);
  }

  const typed = body as {
    recordId?: unknown;
    refundItemRecordId?: unknown;
    idempotencyKey?: unknown;
  };
  const recordId =
    readOptionalTrimmedString(typed.recordId) ??
    readOptionalTrimmedString(typed.refundItemRecordId);

  if (!recordId) {
    throw new SyncEndpointError("Missing recordId.", 400);
  }

  return {
    recordId,
    idempotencyKey: readOptionalTrimmedString(typed.idempotencyKey),
  };
}
