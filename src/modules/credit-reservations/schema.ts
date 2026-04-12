import { SyncEndpointError } from "@/lib/errors";
import type {
  CreateCreditReservationRequestDto,
  ReservationReleaseRequestDto,
  ReservationReleaseResolutionReason,
  ReservationLockRequestDto,
  ReservationVoidRequestDto,
} from "./dto";

type CreateCreditReservationBody = {
  recordId?: unknown;
  lessonRecordId?: unknown;
  idempotencyKey?: unknown;
};

type ReservationLockBody = {
  recordId?: unknown;
  creditReservationRecordId?: unknown;
  idempotencyKey?: unknown;
};

type ReservationReleaseBody = {
  recordId?: unknown;
  creditReservationRecordId?: unknown;
  resolutionReason?: unknown;
  notes?: unknown;
  idempotencyKey?: unknown;
};

type ReservationVoidBody = {
  recordId?: unknown;
  creditReservationRecordId?: unknown;
  notes?: unknown;
  force?: unknown;
  idempotencyKey?: unknown;
};

const RELEASE_REASONS: ReservationReleaseResolutionReason[] = [
  "Lesson Canceled",
  "Policy Release",
];

function readOptionalTrimmedString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeAirtableRecordId(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const match = value.match(/rec[a-zA-Z0-9]{14}/);
  if (match) return match[0];
  return value;
}

export function parseCreateCreditReservationBody(
  body: unknown,
): CreateCreditReservationRequestDto {
  if (typeof body !== "object" || body == null || Array.isArray(body)) {
    throw new SyncEndpointError("Invalid request body.", 400);
  }

  const typed = body as CreateCreditReservationBody;
  const recordId = normalizeAirtableRecordId(
    readOptionalTrimmedString(typed.recordId) ??
      readOptionalTrimmedString(typed.lessonRecordId),
  );
  if (!recordId) {
    throw new SyncEndpointError("Missing recordId.", 400);
  }

  return {
    recordId,
    idempotencyKey: readOptionalTrimmedString(typed.idempotencyKey),
  };
}

export function parseReservationLockBody(body: unknown): ReservationLockRequestDto {
  if (typeof body !== "object" || body == null || Array.isArray(body)) {
    throw new SyncEndpointError("Invalid request body.", 400);
  }

  const typed = body as ReservationLockBody;
  const recordId = normalizeAirtableRecordId(
    readOptionalTrimmedString(typed.recordId) ??
      readOptionalTrimmedString(typed.creditReservationRecordId),
  );
  if (!recordId) {
    throw new SyncEndpointError("Missing recordId.", 400);
  }

  return {
    recordId,
    idempotencyKey: readOptionalTrimmedString(typed.idempotencyKey),
  };
}

function parseReleaseReason(value: unknown): ReservationReleaseResolutionReason {
  if (typeof value !== "string") {
    throw new SyncEndpointError("Missing resolutionReason.", 400);
  }
  const normalized = value.trim();
  if (!RELEASE_REASONS.includes(normalized as ReservationReleaseResolutionReason)) {
    throw new SyncEndpointError("Invalid resolutionReason.", 400);
  }
  return normalized as ReservationReleaseResolutionReason;
}

function parseOptionalBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "1" || normalized === "yes") return true;
    if (normalized === "false" || normalized === "0" || normalized === "no") return false;
  }
  return undefined;
}

export function parseReservationReleaseBody(
  body: unknown,
): ReservationReleaseRequestDto {
  if (typeof body !== "object" || body == null || Array.isArray(body)) {
    throw new SyncEndpointError("Invalid request body.", 400);
  }

  const typed = body as ReservationReleaseBody;
  const recordId = normalizeAirtableRecordId(
    readOptionalTrimmedString(typed.recordId) ??
      readOptionalTrimmedString(typed.creditReservationRecordId),
  );
  if (!recordId) {
    throw new SyncEndpointError("Missing recordId.", 400);
  }

  return {
    recordId,
    resolutionReason: parseReleaseReason(typed.resolutionReason),
    notes: readOptionalTrimmedString(typed.notes),
    idempotencyKey: readOptionalTrimmedString(typed.idempotencyKey),
  };
}

export function parseReservationVoidBody(body: unknown): ReservationVoidRequestDto {
  if (typeof body !== "object" || body == null || Array.isArray(body)) {
    throw new SyncEndpointError("Invalid request body.", 400);
  }

  const typed = body as ReservationVoidBody;
  const recordId = normalizeAirtableRecordId(
    readOptionalTrimmedString(typed.recordId) ??
      readOptionalTrimmedString(typed.creditReservationRecordId),
  );
  if (!recordId) {
    throw new SyncEndpointError("Missing recordId.", 400);
  }

  return {
    recordId,
    notes: readOptionalTrimmedString(typed.notes),
    force: parseOptionalBoolean(typed.force),
    idempotencyKey: readOptionalTrimmedString(typed.idempotencyKey),
  };
}
