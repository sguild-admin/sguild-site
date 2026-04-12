import { airtableSchema } from "@/config/airtable-schema";
import { SyncEndpointError } from "@/lib/errors";
import {
  airtableRequest,
  escapeAirtableFormulaString,
  parseAirtableError,
} from "@/lib/airtable/client";
import {
  appendCreditLedgerEntry,
  createCreditLedgerEntry,
} from "@/modules/credit-ledger-entries";
import type {
  CreditReservationResolutionReason,
  CreditReservationStatus,
} from "./dto";

const CREDIT_RESERVATIONS_TABLE = airtableSchema.operations.tables.creditReservations;
const CREDIT_LEDGER_ENTRIES_TABLE = airtableSchema.operations.tables.creditLedgerEntries;
const LESSONS_TABLE = airtableSchema.operations.tables.lessons;
const CREDIT_ACCOUNTS_TABLE = airtableSchema.operations.tables.creditAccounts;

const CREDIT_RESERVATION_FIELDS = airtableSchema.operations.fields.creditReservations;
const CREDIT_LEDGER_ENTRY_FIELDS = airtableSchema.operations.fields.creditLedgerEntries;

type AirtableRecord = {
  id: string;
  fields?: Record<string, unknown>;
};

export type CreditReservationRecordDto = {
  recordId: string;
  status: CreditReservationStatus | null;
  reservedCredits: number | null;
  reservedAt: string | null;
  resolvedAt: string | null;
  resolutionReason: CreditReservationResolutionReason | null;
  creditAccountId: string | null;
  lessonId: string | null;
  creditAccountStatus: string | null;
  lessonStatus: string | null;
  lockDebitCount: number;
};

export type ReservationLockLedgerEntryDto = {
  recordId: string;
  deltaCredits: number | null;
};

export type LessonReservationCreateRecordDto = {
  recordId: string;
  status: string | null;
  startAt: string | null;
  payingCreditAccountId: string | null;
  expectedLessonCreditCost: number | null;
  futureStartAtFlag: boolean | null;
  hasActiveReservation: boolean | null;
  hasNoCriticalErrors: boolean | null;
  hasPayingCreditAccount: boolean | null;
};

export type CreditAccountReservationCreateRecordDto = {
  recordId: string;
  status: string | null;
  balanceCredits: number | null;
  reservedCredits: number | null;
  availableCredits: number | null;
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

function readFirstLinkedId(value: unknown): string | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const first = value[0];
  return typeof first === "string" && first.trim().length > 0 ? first.trim() : null;
}

function readBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
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

function toStatus(value: unknown): CreditReservationStatus | null {
  const parsed = readString(value);
  if (
    parsed === "Reserved" ||
    parsed === "Locked" ||
    parsed === "Consumed" ||
    parsed === "Released" ||
    parsed === "Voided"
  ) {
    return parsed;
  }
  return null;
}

function toResolutionReason(value: unknown): CreditReservationResolutionReason | null {
  const parsed = readString(value);
  if (
    parsed === "Lesson Completed" ||
    parsed === "Lesson Canceled" ||
    parsed === "Lesson No-Show" ||
    parsed === "Policy Release" ||
    parsed === "Administrative Void"
  ) {
    return parsed;
  }
  return null;
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

function toCreditReservationRecord(record: AirtableRecord): CreditReservationRecordDto {
  const fields = record.fields ?? {};
  return {
    recordId: record.id,
    status: toStatus(fields[CREDIT_RESERVATION_FIELDS.status]),
    reservedCredits: readNumberFromFields(fields, [CREDIT_RESERVATION_FIELDS.reservedCredits]),
    reservedAt: readString(fields[CREDIT_RESERVATION_FIELDS.reservedAt]),
    resolvedAt: readString(fields[CREDIT_RESERVATION_FIELDS.resolvedAt]),
    resolutionReason: toResolutionReason(fields[CREDIT_RESERVATION_FIELDS.resolutionReason]),
    creditAccountId: readFirstLinkedIdFromFields(fields, [CREDIT_RESERVATION_FIELDS.creditAccount]),
    lessonId: readFirstLinkedIdFromFields(fields, [CREDIT_RESERVATION_FIELDS.lesson]),
    creditAccountStatus: readString(fields[CREDIT_RESERVATION_FIELDS.creditAccountStatus]),
    lessonStatus: readString(fields[CREDIT_RESERVATION_FIELDS.lessonStatus]),
    lockDebitCount: readNumberFromFields(fields, [CREDIT_RESERVATION_FIELDS.lockDebitCount]) ?? 0,
  };
}

export async function getCreditReservationById(
  creditReservationRecordId: string,
): Promise<CreditReservationRecordDto> {
  const record = await getRecord(
    CREDIT_RESERVATIONS_TABLE,
    creditReservationRecordId,
    "Credit Reservation",
  );
  return toCreditReservationRecord(record);
}

export async function getLessonForReservationCreate(
  lessonRecordId: string,
): Promise<LessonReservationCreateRecordDto> {
  const record = await getRecord(LESSONS_TABLE, lessonRecordId, "Lesson");
  const fields = record.fields ?? {};
  return {
    recordId: record.id,
    status: readString(fields.Status),
    startAt: readString(fields["Start At"]),
    payingCreditAccountId: readFirstLinkedIdFromFields(fields, ["Paying Credit Account"]),
    expectedLessonCreditCost: readNumberFromFields(fields, [
      "Expected Lesson Credit Cost",
      "Lesson Type::Credits Cost",
      "Credits Cost",
      "Credit Cost",
    ]),
    futureStartAtFlag: readBooleanFromFields(fields, ["Future Start At"]),
    hasActiveReservation: readBooleanFromFields(fields, ["Has Active Reservation"]),
    hasNoCriticalErrors: readBooleanFromFields(fields, ["Has No Critical Errors"]),
    hasPayingCreditAccount: readBooleanFromFields(fields, ["Has Paying Credit Account"]),
  };
}

export async function getCreditAccountForReservationCreate(
  creditAccountRecordId: string,
): Promise<CreditAccountReservationCreateRecordDto> {
  const record = await getRecord(CREDIT_ACCOUNTS_TABLE, creditAccountRecordId, "Credit Account");
  const fields = record.fields ?? {};
  return {
    recordId: record.id,
    status: readString(fields.Status),
    balanceCredits: readNumber(fields["Balance Credits"]),
    reservedCredits: readNumber(fields["Reserved Credits"]),
    availableCredits: readNumber(fields["Available Credits"]),
  };
}

function toLedgerEntry(record: AirtableRecord): ReservationLockLedgerEntryDto {
  const fields = record.fields ?? {};
  return {
    recordId: record.id,
    deltaCredits: readNumber(fields["Delta Credits"]),
  };
}

export async function listReservationLockEntries(
  creditReservationRecordId: string,
): Promise<ReservationLockLedgerEntryDto[]> {
  const escaped = escapeAirtableFormulaString(creditReservationRecordId);
  const formula =
    "AND(" +
    `{${CREDIT_LEDGER_ENTRY_FIELDS.entryType}}='Reservation Lock Debit', ` +
    `FIND('${escaped}', ARRAYJOIN({${CREDIT_LEDGER_ENTRY_FIELDS.creditReservation}}))` +
    ")";
  
  console.log(`[LIST_RESERVATION_LOCK_ENTRIES] reservationId=${creditReservationRecordId} formula=${formula}`);
  
  const params = new URLSearchParams({
    pageSize: "10",
    filterByFormula: formula,
  });

  const response = await airtableRequest(
    `${encodeURIComponent(CREDIT_LEDGER_ENTRIES_TABLE)}?${params.toString()}`,
    { method: "GET" },
  );
  if (!response.ok) {
    const message = await parseAirtableError(response);
    throw new SyncEndpointError(
      `Failed to list Reservation Lock entries by reservation: ${message}`,
      502,
    );
  }

  const body = (await response.json()) as { records?: AirtableRecord[] };
  const formulaResults = (body.records ?? []).map((record) => toLedgerEntry(record));
  console.log(`[LIST_RESERVATION_LOCK_ENTRIES] Formula found ${formulaResults.length} lock entries`);
  
  // If formula found results, return them
  if (formulaResults.length > 0) {
    return formulaResults;
  }
  
  // If formula found 0 results, try fallback: fetch all ledger entries and filter in-memory
  console.log(`[LIST_RESERVATION_LOCK_ENTRIES] Formula found 0 results. Trying fallback for reservation ${creditReservationRecordId}...`);
  let offset: string | undefined;
  const allRows: ReservationLockLedgerEntryDto[] = [];
  let totalChecked = 0;
  let reservationLockDebitsFound = 0;
  
  do {
    const allParams = new URLSearchParams({
      pageSize: "100",
    });
    if (offset) allParams.set("offset", offset);
    
    const allResponse = await airtableRequest(
      `${encodeURIComponent(CREDIT_LEDGER_ENTRIES_TABLE)}?${allParams.toString()}`,
      { method: "GET" },
    );
    
    if (!allResponse.ok) {
      const message = await parseAirtableError(allResponse);
      throw new SyncEndpointError(
        `Failed to list all Credit Ledger entries: ${message}`,
        502,
      );
    }
    
    const allBody = (await allResponse.json()) as { records?: AirtableRecord[]; offset?: string };
    for (const record of allBody.records ?? []) {
      totalChecked++;
      const fullRecord = record.fields ?? {};
      const entryType = readString(fullRecord[CREDIT_LEDGER_ENTRY_FIELDS.entryType]);
      const linkedReservations = (fullRecord[CREDIT_LEDGER_ENTRY_FIELDS.creditReservation] ?? []) as string[];
      
      // Check if this is a Reservation Lock Debit
      if (entryType === "Reservation Lock Debit") {
        reservationLockDebitsFound++;
        console.log(`[LIST_RESERVATION_LOCK_ENTRIES] Found Reservation Lock Debit entry ${record.id}, linkedReservations=${JSON.stringify(linkedReservations)}, looking for ${creditReservationRecordId}`);
        
        // Check if it's linked to our reservation
        if (linkedReservations.includes(creditReservationRecordId)) {
          console.log(`[LIST_RESERVATION_LOCK_ENTRIES] MATCH! Entry ${record.id} is linked to reservation ${creditReservationRecordId}`);
          const entry = toLedgerEntry(record);
          allRows.push(entry);
        }
      }
    }
    offset = allBody.offset;
  } while (offset);
  
  console.log(`[LIST_RESERVATION_LOCK_ENTRIES] Fallback summary: checked ${totalChecked} total entries, found ${reservationLockDebitsFound} Reservation Lock Debit entries, matched ${allRows.length} for reservation ${creditReservationRecordId}`);
  return allRows;
}

export async function listReservationsForLesson(
  lessonRecordId: string,
): Promise<CreditReservationRecordDto[]> {
  const escaped = escapeAirtableFormulaString(lessonRecordId);
  const fieldName = CREDIT_RESERVATION_FIELDS.lesson;
  const formula = `FIND('${escaped}', ARRAYJOIN({${fieldName}}))`;
  console.log(`[LIST_RESERVATIONS_FOR_LESSON] lessonRecordId=${lessonRecordId} fieldName=${fieldName} formula=${formula}`);
  
  const params = new URLSearchParams({
    pageSize: "100",
    filterByFormula: formula,
  });

  const url = `${encodeURIComponent(CREDIT_RESERVATIONS_TABLE)}?${params.toString()}`;
  console.log(`[LIST_RESERVATIONS_FOR_LESSON] Querying with formula: ${url.substring(url.indexOf("filter"))}`);
  
  const response = await airtableRequest(url, { method: "GET" });
  if (!response.ok) {
    const message = await parseAirtableError(response);
    console.error(`[LIST_RESERVATIONS_FOR_LESSON] Query failed: ${message}`);
    throw new SyncEndpointError(`Failed to list Credit Reservations for Lesson: ${message}`, 502);
  }

  const body = (await response.json()) as { records?: AirtableRecord[] };
  const formulaResults = (body.records ?? []).map((record) => toCreditReservationRecord(record));
  console.log(`[LIST_RESERVATIONS_FOR_LESSON] Formula query found ${formulaResults.length} reservations`);
  
  // If formula found results, return them
  if (formulaResults.length > 0) {
    console.log(`[LIST_RESERVATIONS_FOR_LESSON] Returning formula results: ${formulaResults.map((r) => `${r.recordId}(${r.status})`).join(", ")}`);
    return formulaResults;
  }
  
  // If formula found 0 results, try fallback: fetch ALL reservations and filter in-memory
  console.log(`[LIST_RESERVATIONS_FOR_LESSON] Formula found 0 results. Trying fallback: fetch all reservations and filter in-memory...`);
  let offset: string | undefined;
  const allRows: CreditReservationRecordDto[] = [];
  
  do {
    const allParams = new URLSearchParams({
      pageSize: "100",
    });
    if (offset) allParams.set("offset", offset);
    
    const allUrl = `${encodeURIComponent(CREDIT_RESERVATIONS_TABLE)}?${allParams.toString()}`;
    const allResponse = await airtableRequest(allUrl, { method: "GET" });
    
    if (!allResponse.ok) {
      const message = await parseAirtableError(allResponse);
      console.error(`[LIST_RESERVATIONS_FOR_LESSON] Fallback query failed: ${message}`);
      throw new SyncEndpointError(`Failed to list all Credit Reservations: ${message}`, 502);
    }
    
    const allBody = (await allResponse.json()) as { records?: AirtableRecord[]; offset?: string };
    for (const record of allBody.records ?? []) {
      allRows.push(toCreditReservationRecord(record));
    }
    offset = allBody.offset;
  } while (offset);
  
  console.log(`[LIST_RESERVATIONS_FOR_LESSON] Fetched ${allRows.length} total reservations from all records`);
  
  // Filter in-memory for matching lesson
  const matchingRows = allRows.filter((r) => r.lessonId === lessonRecordId);
  console.log(`[LIST_RESERVATIONS_FOR_LESSON] Filtered to ${matchingRows.length} matching the lesson ${lessonRecordId}`);
  
  // Log details of what we found
  if (matchingRows.length > 0) {
    console.log(`[LIST_RESERVATIONS_FOR_LESSON] Found matching reservations: ${matchingRows.map((r) => `${r.recordId}(${r.status})`).join(", ")}`);
  } else {
    // Log all reservation's lesson IDs for debugging
    const sampleReservations = allRows.slice(0, 5);
    console.log(`[LIST_RESERVATIONS_FOR_LESSON] No matching reservations. Sample of all reservations:`, 
      sampleReservations.map((r) => ({ id: r.recordId, lessonId: r.lessonId, status: r.status }))
    );
  }
  
  return matchingRows;
}

export async function createCreditReservation(input: {
  lessonRecordId: string;
  creditAccountRecordId: string;
  reservedCredits: number;
}): Promise<CreditReservationRecordDto> {
  const response = await airtableRequest(`${encodeURIComponent(CREDIT_RESERVATIONS_TABLE)}`, {
    method: "POST",
    body: JSON.stringify({
      fields: {
        [CREDIT_RESERVATION_FIELDS.lesson]: [input.lessonRecordId],
        [CREDIT_RESERVATION_FIELDS.creditAccount]: [input.creditAccountRecordId],
        [CREDIT_RESERVATION_FIELDS.status]: "Reserved",
        [CREDIT_RESERVATION_FIELDS.reservedCredits]: input.reservedCredits,
        [CREDIT_RESERVATION_FIELDS.reservedAt]: new Date().toISOString(),
      },
    }),
  });

  if (!response.ok) {
    const message = await parseAirtableError(response);
    throw new SyncEndpointError(`Failed to create Credit Reservation: ${message}`, 502);
  }

  return toCreditReservationRecord((await response.json()) as AirtableRecord);
}

export async function createReservationLockEntry(input: {
  creditAccountRecordId: string;
  creditReservationRecordId: string;
  deltaCredits: number;
  notes?: string;
}): Promise<ReservationLockLedgerEntryDto> {
  const result = await appendCreditLedgerEntry({
    creditAccountRecordId: input.creditAccountRecordId,
    creditReservationRecordId: input.creditReservationRecordId,
    deltaCredits: input.deltaCredits,
    entryType: "Reservation Lock Debit",
    notes: input.notes,
    createdVia: "Reservation Job",
  });

  return {
    recordId: result.creditLedgerEntryRecordId,
    deltaCredits: input.deltaCredits,
  };
}

export async function updateReservationStatusLocked(
  creditReservationRecordId: string,
): Promise<void> {
  const response = await airtableRequest(
    `${encodeURIComponent(CREDIT_RESERVATIONS_TABLE)}/${encodeURIComponent(creditReservationRecordId)}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        fields: {
          [CREDIT_RESERVATION_FIELDS.status]: "Locked",
        },
      }),
    },
  );
  if (!response.ok) {
    const message = await parseAirtableError(response);
    throw new SyncEndpointError(`Failed to update Credit Reservation: ${message}`, 502);
  }
}

export async function findReversalByTargetLedgerEntry(
  targetLedgerEntryId: string,
): Promise<{ recordId: string } | null> {
  const escaped = escapeAirtableFormulaString(targetLedgerEntryId);
  const params = new URLSearchParams({
    maxRecords: "2",
    filterByFormula: `FIND('${escaped}', ARRAYJOIN({${CREDIT_LEDGER_ENTRY_FIELDS.reversesCreditLedgerEntry}}))`,
  });

  const response = await airtableRequest(
    `${encodeURIComponent(CREDIT_LEDGER_ENTRIES_TABLE)}?${params.toString()}`,
    { method: "GET" },
  );
  if (!response.ok) {
    const message = await parseAirtableError(response);
    throw new SyncEndpointError(
      `Failed to find reversal by target ledger entry: ${message}`,
      502,
    );
  }

  const body = (await response.json()) as { records?: AirtableRecord[] };
  const rows = body.records ?? [];
  if (rows.length === 0) return null;
  if (rows.length > 1) {
    throw new SyncEndpointError(
      "Multiple reversal entries found for the same target ledger entry.",
      409,
    );
  }
  return { recordId: rows[0].id };
}

export async function updateReservationReleased(input: {
  creditReservationRecordId: string;
  resolutionReason: "Lesson Canceled" | "Policy Release";
  notes?: string;
}): Promise<void> {
  const fields: Record<string, unknown> = {
    [CREDIT_RESERVATION_FIELDS.status]: "Released",
    [CREDIT_RESERVATION_FIELDS.resolutionReason]: input.resolutionReason,
    [CREDIT_RESERVATION_FIELDS.resolvedAt]: new Date().toISOString(),
  };
  if (input.notes) fields[CREDIT_RESERVATION_FIELDS.notes] = input.notes;

  const response = await airtableRequest(
    `${encodeURIComponent(CREDIT_RESERVATIONS_TABLE)}/${encodeURIComponent(input.creditReservationRecordId)}`,
    {
      method: "PATCH",
      body: JSON.stringify({ fields }),
    },
  );
  if (!response.ok) {
    const message = await parseAirtableError(response);
    throw new SyncEndpointError(`Failed to update Credit Reservation: ${message}`, 502);
  }
}

export async function resolveReservationStatus(input: {
  creditReservationRecordId: string;
  status: "Released" | "Consumed";
  resolutionReason:
    | "Lesson Completed"
    | "Lesson Canceled"
    | "Lesson No-Show"
    | "Policy Release"
    | "Administrative Void";
  resolvedAt?: string;
  notes?: string;
}): Promise<void> {
  const fields: Record<string, unknown> = {
    [CREDIT_RESERVATION_FIELDS.status]: input.status,
    [CREDIT_RESERVATION_FIELDS.resolutionReason]: input.resolutionReason,
    [CREDIT_RESERVATION_FIELDS.resolvedAt]: input.resolvedAt ?? new Date().toISOString(),
  };
  if (input.notes) fields[CREDIT_RESERVATION_FIELDS.notes] = input.notes;

  console.info(
    `[RESOLVE_RESERVATION_STATUS] Updating reservation=${input.creditReservationRecordId} status=${input.status} reason=${input.resolutionReason}`,
  );

  const response = await airtableRequest(
    `${encodeURIComponent(CREDIT_RESERVATIONS_TABLE)}/${encodeURIComponent(input.creditReservationRecordId)}`,
    {
      method: "PATCH",
      body: JSON.stringify({ fields }),
    },
  );
  if (!response.ok) {
    const message = await parseAirtableError(response);
    console.error(
      `[RESOLVE_RESERVATION_STATUS] Failed to resolve: ${message}. Fields attempted: ${JSON.stringify(fields)}`,
    );
    throw new SyncEndpointError(`Failed to resolve Credit Reservation: ${message}`, 502);
  }

  console.info(`[RESOLVE_RESERVATION_STATUS] Success reservation=${input.creditReservationRecordId}`);
}

export async function createReservationLockReversal(input: {
  creditAccountRecordId: string;
  reversesLedgerEntryId: string;
  reversalDeltaCredits: number;
  reversalReason?: string;
}): Promise<{ recordId: string }> {
  const created = await createCreditLedgerEntry({
    creditAccountRecordId: input.creditAccountRecordId,
    reversesCreditLedgerEntryRecordId: input.reversesLedgerEntryId,
    reversalReason: input.reversalReason ?? "Lock Debit Reversal - Reservation Released",
    deltaCredits: input.reversalDeltaCredits,
    entryType: "Adjustment",
    occurredAt: new Date().toISOString(),
    createdVia: "Reservation Job",
  });
  return { recordId: created.recordId };
}

export async function updateReservationVoided(input: {
  creditReservationRecordId: string;
  notes?: string;
}): Promise<void> {
  const fields: Record<string, unknown> = {
    [CREDIT_RESERVATION_FIELDS.status]: "Voided",
    [CREDIT_RESERVATION_FIELDS.resolutionReason]: "Administrative Void",
    [CREDIT_RESERVATION_FIELDS.resolvedAt]: new Date().toISOString(),
  };
  if (input.notes) fields[CREDIT_RESERVATION_FIELDS.notes] = input.notes;

  const response = await airtableRequest(
    `${encodeURIComponent(CREDIT_RESERVATIONS_TABLE)}/${encodeURIComponent(input.creditReservationRecordId)}`,
    {
      method: "PATCH",
      body: JSON.stringify({ fields }),
    },
  );
  if (!response.ok) {
    const message = await parseAirtableError(response);
    throw new SyncEndpointError(`Failed to update Credit Reservation: ${message}`, 502);
  }
}
