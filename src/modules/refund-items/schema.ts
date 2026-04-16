import { SyncEndpointError } from "@/lib/errors";
import type { RefundItemRecordIdRequestDto } from "./dto";

export function parseRefundItemRecordIdBody(
  body: unknown,
): RefundItemRecordIdRequestDto {
  if (typeof body !== "object" || body == null || Array.isArray(body)) {
    throw new SyncEndpointError("Invalid request body.", 400);
  }

  const typed = body as { recordId?: unknown };
  const recordId =
    typeof typed.recordId === "string" ? typed.recordId.trim() : "";

  if (!recordId) {
    throw new SyncEndpointError("Missing recordId.", 400);
  }

  return { recordId };
}
