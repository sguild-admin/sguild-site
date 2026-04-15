import { airtableSchema } from "@/config/airtable-schema";
import { SyncEndpointError } from "@/lib/errors";
import { airtableRequest, parseAirtableError } from "@/lib/airtable/client";
import type { LessonCancellationReason } from "./dto";

const LESSONS_TABLE = airtableSchema.operations.tables.lessons;

type AirtableRecord = {
  id: string;
  fields?: Record<string, unknown>;
};

export type LessonOutcomeRecordDto = {
  recordId: string;
  status: string | null;
  futureStartAt: boolean | null;
  isTerminalLesson: boolean | null;
  hasException: boolean | null;
  hasCreditLedgerImpactingException: boolean | null;
  missingRequiredLinks: boolean | null;
  payingCreditAccountId: string | null;
  hasActiveReservation: boolean | null;
  outcomeNotes: string | null;
  cancellationReason: string | null;
  notes: string | null;
  requestOutcome: boolean | null;
  requestedOutcome: string | null;
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

function readFirstLinkedId(value: unknown): string | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const first = value[0];
  return typeof first === "string" && first.trim().length > 0 ? first.trim() : null;
}

function readBooleanFromFields(
  fields: Record<string, unknown>,
  candidates: string[],
): boolean | null {
  for (const key of candidates) {
    if (!(key in fields)) continue;
    return readBoolean(fields[key]);
  }
  return null;
}

async function getLessonRecord(recordId: string): Promise<AirtableRecord> {
  const response = await airtableRequest(
    `${encodeURIComponent(LESSONS_TABLE)}/${encodeURIComponent(recordId)}`,
    { method: "GET" },
  );
  if (response.status === 404) {
    throw new SyncEndpointError("Lesson not found.", 404);
  }
  if (!response.ok) {
    const message = await parseAirtableError(response);
    throw new SyncEndpointError(`Failed to load Lesson: ${message}`, 502);
  }
  return (await response.json()) as AirtableRecord;
}

export async function getLessonForOutcome(recordId: string): Promise<LessonOutcomeRecordDto> {
  const record = await getLessonRecord(recordId);
  const fields = record.fields ?? {};
  return {
    recordId: record.id,
    status: readString(fields.Status),
    futureStartAt: readBooleanFromFields(fields, ["Future Start At"]),
    isTerminalLesson: readBooleanFromFields(fields, ["Is Terminal Lesson"]),
    hasException: readBooleanFromFields(fields, ["Has Exception"]),
    hasCreditLedgerImpactingException: readBooleanFromFields(fields, [
      "Has Credit Ledger Impacting Exception",
    ]),
    missingRequiredLinks: readBooleanFromFields(fields, ["Missing Required Links"]),
    payingCreditAccountId: readFirstLinkedId(fields["Paying Credit Account"]),
    hasActiveReservation: readBooleanFromFields(fields, ["Has Active Reservation"]),
    outcomeNotes: readString(fields["Outcome Notes"]),
    cancellationReason: readString(fields["Cancellation Reason"]),
    notes: readString(fields.Notes),
    requestOutcome: readBooleanFromFields(fields, ["Request Outcome"]),
    requestedOutcome: readString(fields["Requested Outcome"]),
  };
}

export async function updateLessonToCompleted(input: {
  lessonRecordId: string;
  outcomeNotes?: string;
  resolutionStatus?: "Consumed" | "Released" | "Forfeited" | "Active";
}): Promise<void> {
  const fields: Record<string, unknown> = { Status: "Completed" };
  if (input.outcomeNotes) fields["Outcome Notes"] = input.outcomeNotes;
  if (input.resolutionStatus) fields["Resolution Status"] = input.resolutionStatus;

  const response = await airtableRequest(
    `${encodeURIComponent(LESSONS_TABLE)}/${encodeURIComponent(input.lessonRecordId)}`,
    { method: "PATCH", body: JSON.stringify({ fields }) },
  );
  if (!response.ok) {
    const message = await parseAirtableError(response);
    throw new SyncEndpointError(`Failed to update Lesson: ${message}`, 502);
  }
}

export async function updateLessonToCanceled(input: {
  lessonRecordId: string;
  cancellationReason: LessonCancellationReason;
  notes?: string;
  resolutionStatus?: "Consumed" | "Released" | "Forfeited" | "Active";
}): Promise<void> {
  const fields: Record<string, unknown> = {
    Status: "Canceled",
    "Cancellation Reason": input.cancellationReason,
    "Canceled At": new Date().toISOString(),
  };
  if (input.notes) fields.Notes = input.notes;
  if (input.resolutionStatus) fields["Resolution Status"] = input.resolutionStatus;

  const response = await airtableRequest(
    `${encodeURIComponent(LESSONS_TABLE)}/${encodeURIComponent(input.lessonRecordId)}`,
    { method: "PATCH", body: JSON.stringify({ fields }) },
  );
  if (!response.ok) {
    const message = await parseAirtableError(response);
    throw new SyncEndpointError(`Failed to update Lesson: ${message}`, 502);
  }
}

export async function updateLessonToNoShow(input: {
  lessonRecordId: string;
  notes?: string;
  resolutionStatus?: "Consumed" | "Released" | "Forfeited" | "Active";
}): Promise<void> {
  const fields: Record<string, unknown> = { Status: "No-Show" };
  if (input.notes) fields.Notes = input.notes;
  if (input.resolutionStatus) fields["Resolution Status"] = input.resolutionStatus;

  const response = await airtableRequest(
    `${encodeURIComponent(LESSONS_TABLE)}/${encodeURIComponent(input.lessonRecordId)}`,
    { method: "PATCH", body: JSON.stringify({ fields }) },
  );
  if (!response.ok) {
    const message = await parseAirtableError(response);
    throw new SyncEndpointError(`Failed to update Lesson: ${message}`, 502);
  }
}
