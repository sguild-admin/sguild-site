import { SyncEndpointError } from "@/lib/errors";
import { airtableSchema } from "@/config/airtable-schema";
import {
  airtableRequest,
  escapeAirtableFormulaString,
  parseAirtableError,
} from "@/lib/airtable/client";
import { createCreditLedgerEntry } from "@/modules/credit-ledger-entries";
import type {
  RefundItemDebitLedgerEntryDto,
  RefundItemDebitRecordDto,
  RefundItemScaffoldRecordDto,
} from "./dto";

type AirtableRecord = {
  id: string;
  fields?: Record<string, unknown>;
};

const REFUND_ITEMS_TABLE = airtableSchema.operations.tables.refundItems;
const ORDERS_TABLE = airtableSchema.operations.tables.orders;
const CREDIT_LEDGER_ENTRIES_TABLE = airtableSchema.operations.tables.creditLedgerEntries;
const REFUND_ITEM_FIELDS = airtableSchema.operations.fields.refundItems;
const ORDER_FIELDS = airtableSchema.operations.fields.orders;
const CREDIT_LEDGER_ENTRY_FIELDS = airtableSchema.operations.fields.creditLedgerEntries;

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
  return typeof first === "string" && first.trim().length > 0
    ? first.trim()
    : null;
}

function readLinkedIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
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

function readNumberFromFields(
  fields: Record<string, unknown>,
  candidates: string[],
): number | null {
  for (const key of candidates) {
    const parsed = readNumber(fields[key]);
    if (parsed != null) return parsed;
  }
  return null;
}

function readFlagFromFields(
  fields: Record<string, unknown>,
  candidates: string[],
): boolean {
  for (const key of candidates) {
    if (!(key in fields)) continue;
    return readFlag(fields[key]);
  }
  return false;
}

function toRefundItemScaffoldRecord(record: AirtableRecord): RefundItemScaffoldRecordDto {
  const fields = record.fields ?? {};
  return {
    recordId: record.id,
    refundAmount: readNumber(fields[REFUND_ITEM_FIELDS.refundAmount]),
    creditsRevoked: readNumber(fields[REFUND_ITEM_FIELDS.creditsRevoked]),
    refundId: readFirstLinkedId(fields[REFUND_ITEM_FIELDS.refund]),
    orderItemId: readFirstLinkedId(fields[REFUND_ITEM_FIELDS.orderItem]),
    refundStatus: readString(fields[REFUND_ITEM_FIELDS.refundStatus]),
    organization: readString(fields[REFUND_ITEM_FIELDS.organization]),
  };
}

function toRefundItemDebitRecord(record: AirtableRecord): RefundItemDebitRecordDto {
  const fields = record.fields ?? {};
  return {
    recordId: record.id,
    refundAmount: readNumber(fields[REFUND_ITEM_FIELDS.refundAmount]),
    creditsRevoked: readNumber(fields[REFUND_ITEM_FIELDS.creditsRevoked]),
    refundId: readFirstLinkedId(fields[REFUND_ITEM_FIELDS.refund]),
    orderItemId: readFirstLinkedId(fields[REFUND_ITEM_FIELDS.orderItem]),
    creditLedgerEntryIds: readLinkedIds(fields[REFUND_ITEM_FIELDS.creditLedgerEntries]),
    refundStatus: readString(fields[REFUND_ITEM_FIELDS.refundStatus]),
    organization: readString(fields[REFUND_ITEM_FIELDS.organization]),
    clientProfileId: readFirstLinkedId(fields[REFUND_ITEM_FIELDS.clientProfile]),
    clientId: readFirstLinkedId(fields["Client"]),
    orderId:
      readFirstLinkedId(fields[REFUND_ITEM_FIELDS.orderFromRefund]) ??
      readFirstLinkedId(fields["Order (from Refund)"]) ??
      readFirstLinkedId(fields["Order"]),
    orderItemCreditsGrantedTotal: readNumber(fields[REFUND_ITEM_FIELDS.orderItemCreditsGrantedTotal]),
    hasRefundDebit: readFlagFromFields(fields, [REFUND_ITEM_FIELDS.hasRefundDebit]),
    hasRefundImpactingException: readFlagFromFields(fields, [
      REFUND_ITEM_FIELDS.hasRefundImpactingException,
    ]),
    refundDebitEligible: readFlagFromFields(fields, [REFUND_ITEM_FIELDS.refundDebitEligible]),
    expectedRefundDebitCredits: readNumber(fields[REFUND_ITEM_FIELDS.expectedRefundDebitCredits]),
  };
}

function toRefundDebitLedgerEntry(record: AirtableRecord): RefundItemDebitLedgerEntryDto {
  const fields = record.fields ?? {};
  return {
    recordId: record.id,
    entryType: readString(fields[CREDIT_LEDGER_ENTRY_FIELDS.entryType]),
    deltaCredits: readNumber(fields[CREDIT_LEDGER_ENTRY_FIELDS.deltaCredits]),
    refundItemId: readFirstLinkedId(fields[CREDIT_LEDGER_ENTRY_FIELDS.refundItem]),
    refundDebitSourceKey: readString(fields[CREDIT_LEDGER_ENTRY_FIELDS.refundDebitSourceKey]),
  };
}

function isUnknownFieldError(message: string): boolean {
  return /Unknown field name/i.test(message) || /Unknown field names/i.test(message);
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

export async function getRefundItemById(
  recordId: string,
): Promise<RefundItemScaffoldRecordDto> {
  const record = await getRecord(REFUND_ITEMS_TABLE, recordId, "Refund Item");
  return toRefundItemScaffoldRecord(record);
}

export async function getRefundItemDebitRecord(
  recordId: string,
): Promise<RefundItemDebitRecordDto> {
  const record = await getRecord(REFUND_ITEMS_TABLE, recordId, "Refund Item");
  return toRefundItemDebitRecord(record);
}

export async function getOrderClientProfileId(orderRecordId: string): Promise<string | null> {
  const record = await getRecord(ORDERS_TABLE, orderRecordId, "Order");
  const fields = record.fields ?? {};
  return readFirstLinkedId(fields[ORDER_FIELDS.clientProfile]);
}

export async function findRefundDebitBySourceKey(
  sourceKey: string,
): Promise<RefundItemDebitLedgerEntryDto | null> {
  const escaped = escapeAirtableFormulaString(sourceKey);
  const params = new URLSearchParams({
    maxRecords: "2",
    filterByFormula: `{${CREDIT_LEDGER_ENTRY_FIELDS.refundDebitSourceKey}}='${escaped}'`,
  });

  const response = await airtableRequest(
    `${encodeURIComponent(CREDIT_LEDGER_ENTRIES_TABLE)}?${params.toString()}`,
    { method: "GET" },
  );
  if (!response.ok) {
    const message = await parseAirtableError(response);
    if (isUnknownFieldError(message)) return null;
    throw new SyncEndpointError(`Failed to find Refund Debit by source key: ${message}`, 502);
  }

  const body = (await response.json()) as { records?: AirtableRecord[] };
  const rows = (body.records ?? []).map((record) => toRefundDebitLedgerEntry(record));
  if (rows.length === 0) return null;
  if (rows.length > 1) {
    throw new SyncEndpointError("Multiple Refund Debit entries found for source key.", 409);
  }
  return rows[0];
}

export async function listRefundDebitEntriesForRefundItem(
  refundItemRecordId: string,
): Promise<RefundItemDebitLedgerEntryDto[]> {
  const escaped = escapeAirtableFormulaString(refundItemRecordId);
  const params = new URLSearchParams({
    pageSize: "100",
    filterByFormula:
      `AND({${CREDIT_LEDGER_ENTRY_FIELDS.entryType}}='Refund Debit', ` +
      `FIND('${escaped}', ARRAYJOIN({${CREDIT_LEDGER_ENTRY_FIELDS.refundItem}})))`,
  });

  const response = await airtableRequest(
    `${encodeURIComponent(CREDIT_LEDGER_ENTRIES_TABLE)}?${params.toString()}`,
    { method: "GET" },
  );
  if (!response.ok) {
    const message = await parseAirtableError(response);
    throw new SyncEndpointError(
      `Failed to list Refund Debit entries for Refund Item: ${message}`,
      502,
    );
  }

  const body = (await response.json()) as { records?: AirtableRecord[] };
  return (body.records ?? []).map((record) => toRefundDebitLedgerEntry(record));
}

export async function createRefundDebitEntry(input: {
  refundItemRecordId: string;
  creditAccountRecordId: string;
  deltaCredits: number;
}): Promise<RefundItemDebitLedgerEntryDto> {
  const created = await createCreditLedgerEntry({
    creditAccountRecordId: input.creditAccountRecordId,
    deltaCredits: input.deltaCredits,
    entryType: "Refund Debit",
    refundItemRecordId: input.refundItemRecordId,
    occurredAt: new Date().toISOString(),
    createdVia: "Refund Job",
  });

  return {
    recordId: created.recordId,
    entryType: created.entryType,
    deltaCredits: created.deltaCredits,
    refundItemId: created.refundItemId,
    refundDebitSourceKey: created.refundItemId ? `REFUND | ${created.refundItemId}` : null,
  };
}

export const refundItemsRepo = {
  getRefundItemById,
  getRefundItemDebitRecord,
  getOrderClientProfileId,
  findRefundDebitBySourceKey,
  listRefundDebitEntriesForRefundItem,
  createRefundDebitEntry,
};
