import { SyncEndpointError } from "@/lib/errors";
import type { ProcessRefundExternalRequestDto } from "./dto";

function readOptionalTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function parseProcessRefundExternalBody(
  body: unknown,
): ProcessRefundExternalRequestDto {
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

  const force = typed.force === true;
  const retryExternalActionId = readOptionalTrimmedString(typed.retryExternalActionId);
  const idempotencyKey = readOptionalTrimmedString(typed.idempotencyKey);

  return {
    recordId,
    force,
    retryExternalActionId,
    idempotencyKey,
  };
}
