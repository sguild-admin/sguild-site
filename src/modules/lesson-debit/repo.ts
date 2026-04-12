import { airtableSchema } from "@/config/airtable-schema";
import { SyncEndpointError } from "@/lib/errors";
import {
  airtableRequest,
  escapeAirtableFormulaString,
  parseAirtableError,
} from "@/lib/airtable/client";
import { createCreditLedgerEntry } from "@/modules/credit-ledger-entries";
import type { LessonDebitLedgerEntryDto, LessonDebitLessonRecordDto } from "./dto";

const LESSONS_TABLE = airtableSchema.operations.tables.lessons;
const CREDIT_LEDGER_ENTRIES_TABLE = airtableSchema.operations.tables.creditLedgerEntries;

type AirtableRecord = {
  id: string;
  fields?: Record<string, unknown>;
};

function readString(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (Array.isArray(value)) {
    for (const item of value) {
      const parsed = readString(item);
      if (parsed) return parsed;
    }
  }
  return null;
}

function readNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const parsed = readNumber(item);
      if (parsed != null) return parsed;
    }
  }
  return null;
}

function readBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return null;
    if (normalized === "true" || normalized === "yes" || normalized === "1") return true;
    if (normalized === "false" || normalized === "no" || normalized === "0") return false;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const parsed = readBoolean(item);
      if (parsed != null) return parsed;
    }
  }
  return null;
}

function readFlag(value: unknown): boolean {
  const parsed = readBoolean(value);
  if (parsed != null) return parsed;
  const num = readNumber(value);
  if (num != null) return num !== 0;
  return false;
}

function readFirstLinkedId(value: unknown): string | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const first = value[0];
  return typeof first === "string" && first.trim().length > 0 ? first.trim() : null;
}

function readNumberFromFields(fields: Record<string, unknown>, candidates: string[]): number | null {
  for (const key of candidates) {
    const parsed = readNumber(fields[key]);
    if (parsed != null) return parsed;
  }
  return null;
}

function readFirstLinkedIdFromFields(
  fields: Record<string, unknown>,
  candidates: string[],
): string | null {
  for (const key of candidates) {
    const parsed = readFirstLinkedId(fields[key]);
    if (parsed) return parsed;
  }
  return null;
}

function readFlagFromFields(fields: Record<string, unknown>, candidates: string[]): boolean {
  for (const key of candidates) {
    if (!(key in fields)) continue;
    return readFlag(fields[key]);
  }
  return false;
}

async function getRecord(
  tableName: string,
  recordId: string,
  label: string,
): Promise<AirtableRecord> {
  const response = await airtableRequest(
    `${encodeURIComponent(tableName)}/${encodeURIComponent(recordId)}`,
    { method: "GET" },
  );

  if (response.status === 404) {
    throw new SyncEndpointError(`${label} not found.`, 404);
  }
  if (!response.ok) {
    const message = await parseAirtableError(response);
    throw new SyncEndpointError(`Failed to load ${label}: ${message}`, 502);
  }

  return (await response.json()) as AirtableRecord;
}

function toLessonDebitLedgerEntry(record: AirtableRecord): LessonDebitLedgerEntryDto {
  const fields = record.fields ?? {};
  return {
    recordId: record.id,
    entryType: readString(fields["Entry Type"]),
    deltaCredits: readNumber(fields["Delta Credits"]),
    lessonDebitSourceKey: readString(fields["Lesson Debit Source Key"]),
  };
}

export async function getLessonDebitLessonRecord(
  recordId: string,
): Promise<LessonDebitLessonRecordDto> {
  const record = await getRecord(LESSONS_TABLE, recordId, "Lesson");
  const fields = record.fields ?? {};

  return {
    recordId: record.id,
    status: readString(fields.Status),
    expectedLessonCreditCost: readNumberFromFields(fields, [
      "Expected Lesson Credit Cost",
      "Lesson Type::Credits Cost",
      "Credits Cost",
      "Credit Cost",
    ]),
    expectedDebitCredits: readNumberFromFields(fields, ["Expected Debit Credits"]),
    payingCreditAccountId: readFirstLinkedIdFromFields(fields, ["Paying Credit Account"]),
    hasLessonDebit: readFlagFromFields(fields, ["Has Lesson Debit"]),
    hasLockDebitViaReservation: readFlagFromFields(fields, ["Has Lock Debit Via Reservation"]),
    hasCreditLedgerImpactingException: readFlagFromFields(fields, [
      "Has Credit Ledger Impacting Exception",
    ]),
  };
}

function isUnknownFieldError(message: string): boolean {
  return /Unknown field name/i.test(message) || /Unknown field names/i.test(message);
}

export async function findLessonDebitBySourceKey(
  sourceKey: string,
): Promise<LessonDebitLedgerEntryDto | null> {
  const escaped = escapeAirtableFormulaString(sourceKey);
  const params = new URLSearchParams({
    maxRecords: "2",
    filterByFormula: `{Lesson Debit Source Key}='${escaped}'`,
  });

  const response = await airtableRequest(
    `${encodeURIComponent(CREDIT_LEDGER_ENTRIES_TABLE)}?${params.toString()}`,
    { method: "GET" },
  );
  if (!response.ok) {
    const message = await parseAirtableError(response);
    if (isUnknownFieldError(message)) return null;
    throw new SyncEndpointError(`Failed to find Lesson Debit by source key: ${message}`, 502);
  }

  const body = (await response.json()) as { records?: AirtableRecord[] };
  const rows = (body.records ?? []).map((record) => toLessonDebitLedgerEntry(record));
  if (rows.length === 0) return null;
  if (rows.length > 1) {
    throw new SyncEndpointError("Multiple Lesson Debit entries found for source key.", 409);
  }
  return rows[0];
}

export async function listLessonDebitEntriesForLesson(
  lessonRecordId: string,
): Promise<LessonDebitLedgerEntryDto[]> {
  const escaped = escapeAirtableFormulaString(lessonRecordId);
  const params = new URLSearchParams({
    pageSize: "100",
    filterByFormula: `AND({Entry Type}='Lesson Debit', FIND('${escaped}', ARRAYJOIN({Lesson})))`,
  });

  const response = await airtableRequest(
    `${encodeURIComponent(CREDIT_LEDGER_ENTRIES_TABLE)}?${params.toString()}`,
    { method: "GET" },
  );
  if (!response.ok) {
    const message = await parseAirtableError(response);
    throw new SyncEndpointError(`Failed to list Lesson Debit entries for Lesson: ${message}`, 502);
  }

  const body = (await response.json()) as { records?: AirtableRecord[] };
  return (body.records ?? []).map((record) => toLessonDebitLedgerEntry(record));
}

export async function createLessonDebitEntry(input: {
  lessonRecordId: string;
  creditAccountRecordId: string;
  deltaCredits: number;
}): Promise<LessonDebitLedgerEntryDto> {
  const created = await createCreditLedgerEntry({
    creditAccountRecordId: input.creditAccountRecordId,
    deltaCredits: input.deltaCredits,
    entryType: "Lesson Debit",
    lessonRecordId: input.lessonRecordId,
    occurredAt: new Date().toISOString(),
    createdVia: "Lesson Completion Job",
  });

  return {
    recordId: created.recordId,
    entryType: created.entryType,
    deltaCredits: created.deltaCredits,
    lessonDebitSourceKey: created.lessonId ? `LESSON | ${created.lessonId}` : null,
  };
}

export async function allocateDebitAcrossOpenLots(_input: {
  lessonRecordId: string;
  creditAccountRecordId: string;
  ledgerEntryRecordId: string;
  debitCredits: number;
}): Promise<void> {
  // Lots are intentionally not modeled yet, so debit allocation is a no-op.
  // The ledger entry remains authoritative and downstream cleanup can detect missing allocations.
  return;
}
