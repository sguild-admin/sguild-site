import { SyncEndpointError } from "@/lib/errors";
import type {
  AppendCreditLedgerEntryRequestDto,
  AppendLessonDebitRequestDto,
  CreditLedgerEntryType,
} from "./dto";

type AppendCreditLedgerEntryBody = {
  creditAccountRecordId?: unknown;
  deltaCredits?: unknown;
  entryType?: unknown;
  occurredAt?: unknown;
  notes?: unknown;
  orderItemRecordId?: unknown;
  lessonRecordId?: unknown;
  refundItemRecordId?: unknown;
  creditReservationRecordId?: unknown;
};

type AppendLessonDebitBody = {
  lessonRecordId?: unknown;
  recordId?: unknown;
  creditAccountRecordId?: unknown;
  clientProfileRecordId?: unknown;
  occurredAt?: unknown;
  notes?: unknown;
};

const ENTRY_TYPES = new Set<CreditLedgerEntryType>([
  "Purchase Credit",
  "Lesson Debit",
  "Refund Debit",
  "Reservation Lock Debit",
  "Adjustment",
]);

function readOptionalTrimmedString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function readInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    if (Number.isInteger(parsed)) return parsed;
  }
  return null;
}

function parseOccurredAt(value: unknown): string | undefined {
  const occurredAt = readOptionalTrimmedString(value);
  if (!occurredAt) return undefined;
  const parsed = new Date(occurredAt);
  if (Number.isNaN(parsed.getTime())) {
    throw new SyncEndpointError("Invalid occurredAt.", 400);
  }
  return parsed.toISOString();
}

export function parseAppendCreditLedgerEntryBody(
  body: unknown,
): AppendCreditLedgerEntryRequestDto {
  if (typeof body !== "object" || body == null || Array.isArray(body)) {
    throw new SyncEndpointError("Invalid request body.", 400);
  }

  const typed = body as AppendCreditLedgerEntryBody;
  const creditAccountRecordId = readOptionalTrimmedString(typed.creditAccountRecordId) ?? "";
  if (!creditAccountRecordId) {
    throw new SyncEndpointError("Missing creditAccountRecordId.", 400);
  }

  const deltaCredits = readInteger(typed.deltaCredits);
  if (deltaCredits == null) {
    throw new SyncEndpointError("deltaCredits must be an integer.", 400);
  }

  const entryTypeRaw = readOptionalTrimmedString(typed.entryType) ?? "";
  if (!ENTRY_TYPES.has(entryTypeRaw as CreditLedgerEntryType)) {
    throw new SyncEndpointError("Invalid entryType.", 400);
  }
  const entryType = entryTypeRaw as CreditLedgerEntryType;

  return {
    creditAccountRecordId,
    deltaCredits,
    entryType,
    occurredAt: parseOccurredAt(typed.occurredAt),
    notes: readOptionalTrimmedString(typed.notes),
    orderItemRecordId: readOptionalTrimmedString(typed.orderItemRecordId),
    lessonRecordId: readOptionalTrimmedString(typed.lessonRecordId),
    refundItemRecordId: readOptionalTrimmedString(typed.refundItemRecordId),
    creditReservationRecordId: readOptionalTrimmedString(typed.creditReservationRecordId),
  };
}

export function parseAppendLessonDebitBody(body: unknown): AppendLessonDebitRequestDto {
  if (typeof body !== "object" || body == null || Array.isArray(body)) {
    throw new SyncEndpointError("Invalid request body.", 400);
  }

  const typed = body as AppendLessonDebitBody;
  const lessonRecordId =
    readOptionalTrimmedString(typed.lessonRecordId) ??
    readOptionalTrimmedString(typed.recordId) ??
    "";
  if (!lessonRecordId) {
    throw new SyncEndpointError("Missing lessonRecordId.", 400);
  }

  return {
    lessonRecordId,
    creditAccountRecordId: readOptionalTrimmedString(typed.creditAccountRecordId),
    clientProfileRecordId: readOptionalTrimmedString(typed.clientProfileRecordId),
    occurredAt: parseOccurredAt(typed.occurredAt),
    notes: readOptionalTrimmedString(typed.notes),
  };
}
