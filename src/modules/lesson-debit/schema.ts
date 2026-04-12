import { SyncEndpointError } from "@/lib/errors";
import type { LessonDebitRequestDto } from "./dto";

type LessonDebitBody = {
  recordId?: unknown;
  lessonRecordId?: unknown;
  idempotencyKey?: unknown;
};

function readOptionalTrimmedString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function parseLessonDebitBody(body: unknown): LessonDebitRequestDto {
  if (typeof body !== "object" || body == null || Array.isArray(body)) {
    throw new SyncEndpointError("Invalid request body.", 400);
  }

  const typed = body as LessonDebitBody;
  const recordId =
    readOptionalTrimmedString(typed.recordId) ??
    readOptionalTrimmedString(typed.lessonRecordId);

  if (!recordId) {
    throw new SyncEndpointError("Missing recordId.", 400);
  }

  return {
    recordId,
    idempotencyKey: readOptionalTrimmedString(typed.idempotencyKey),
  };
}
