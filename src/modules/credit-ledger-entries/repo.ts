import { airtableSchema } from "@/config/airtable-schema";
import { SyncEndpointError } from "@/lib/errors";
import {
  airtableRequest,
  escapeAirtableFormulaString,
  parseAirtableError,
} from "@/lib/airtable/client";
import type { CreditLedgerEntryType } from "./dto";

const CREDIT_LEDGER_ENTRIES_TABLE = airtableSchema.operations.tables.creditLedgerEntries;
const ORDERS_TABLE = airtableSchema.operations.tables.orders;
const ORDER_ITEMS_TABLE = airtableSchema.operations.tables.orderItems;
const LESSONS_TABLE = airtableSchema.operations.tables.lessons;
const CLIENT_PROFILES_TABLE = airtableSchema.operations.tables.clientProfiles;

type AirtableRecord = {
  id: string;
  fields?: Record<string, unknown>;
};

export type CreditLedgerEntryRecord = {
  recordId: string;
  creditAccountId: string | null;
  deltaCredits: number | null;
  entryType: CreditLedgerEntryType | null;
  occurredAt: string | null;
  orderItemId: string | null;
  lessonId: string | null;
  refundItemId: string | null;
};

export type CreateCreditLedgerEntryInput = {
  creditAccountRecordId: string;
  deltaCredits: number;
  entryType: CreditLedgerEntryType;
  occurredAt: string;
  notes?: string;
  createdVia?: string;
  orderItemRecordId?: string;
  lessonRecordId?: string;
  refundItemRecordId?: string;
};

export type OrderItemCreditsRecord = {
  recordId: string;
  creditsGrantedTotal: number | null;
};

export type LessonCreditsRecord = {
  recordId: string;
  status: string | null;
  clientProfileId: string | null;
  creditsCost: number | null;
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

function readNumberFromFields(fields: Record<string, unknown>, candidates: string[]): number | null {
  for (const key of candidates) {
    const parsed = readNumber(fields[key]);
    if (parsed != null) return parsed;
  }
  return null;
}

function toEntryType(value: unknown): CreditLedgerEntryType | null {
  const parsed = readString(value);
  if (
    parsed === "Purchase Credit" ||
    parsed === "Lesson Debit" ||
    parsed === "Refund Debit" ||
    parsed === "Adjustment"
  ) {
    return parsed;
  }
  return null;
}

function toCreditLedgerEntryRecord(record: AirtableRecord): CreditLedgerEntryRecord {
  const fields = record.fields ?? {};
  return {
    recordId: record.id,
    creditAccountId: readFirstLinkedId(fields["Credit Account"]),
    deltaCredits: readNumber(fields["Delta Credits"]),
    entryType: toEntryType(fields["Entry Type"]),
    occurredAt: readString(fields["Occurred At"]),
    orderItemId: readFirstLinkedId(fields["Order Item"]),
    lessonId: readFirstLinkedId(fields.Lesson),
    refundItemId: readFirstLinkedId(fields["Refund Item"]),
  };
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

function isUnknownOptionalFieldError(message: string, key: string): boolean {
  return (
    message.includes(`Unknown field name: "${key}"`) ||
    message.includes(`Unknown field names: ${key}`)
  );
}

export async function createCreditLedgerEntry(
  input: CreateCreditLedgerEntryInput,
): Promise<CreditLedgerEntryRecord> {
  let fields: Record<string, unknown> = {
    "Credit Account": [input.creditAccountRecordId],
    "Delta Credits": input.deltaCredits,
    "Entry Type": input.entryType,
    "Occurred At": input.occurredAt,
  };

  if (input.notes) fields.Notes = input.notes;
  if (input.createdVia) fields["Created Via"] = input.createdVia;
  if (input.orderItemRecordId) fields["Order Item"] = [input.orderItemRecordId];
  if (input.lessonRecordId) fields.Lesson = [input.lessonRecordId];
  if (input.refundItemRecordId) fields["Refund Item"] = [input.refundItemRecordId];

  const optionalFields = new Set(Object.keys(fields));
  while (true) {
    const response = await airtableRequest(`${encodeURIComponent(CREDIT_LEDGER_ENTRIES_TABLE)}`, {
      method: "POST",
      body: JSON.stringify({ fields }),
    });

    if (response.ok) {
      return toCreditLedgerEntryRecord((await response.json()) as AirtableRecord);
    }

    const message = await parseAirtableError(response);
    const optionalFieldToDrop = [...optionalFields].find(
      (key) => key in fields && isUnknownOptionalFieldError(message, key),
    );

    if (optionalFieldToDrop) {
      const nextFields: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(fields)) {
        if (key === optionalFieldToDrop) continue;
        nextFields[key] = value;
      }
      fields = nextFields;
      continue;
    }

    throw new SyncEndpointError(`Failed to create Credit Ledger Entry: ${message}`, 502);
  }
}

export async function findLedgerEntryBySource(input: {
  entryType: "Purchase Credit" | "Lesson Debit";
  orderItemRecordId?: string;
  lessonRecordId?: string;
}): Promise<CreditLedgerEntryRecord | null> {
  let formula = "";
  if (input.entryType === "Purchase Credit" && input.orderItemRecordId) {
    const escaped = escapeAirtableFormulaString(input.orderItemRecordId);
    formula = `AND({Entry Type}='Purchase Credit', FIND('${escaped}', ARRAYJOIN({Order Item})))`;
  } else if (input.entryType === "Lesson Debit" && input.lessonRecordId) {
    const escaped = escapeAirtableFormulaString(input.lessonRecordId);
    formula = `AND({Entry Type}='Lesson Debit', FIND('${escaped}', ARRAYJOIN({Lesson})))`;
  } else {
    return null;
  }

  const params = new URLSearchParams({
    maxRecords: "2",
    filterByFormula: formula,
  });
  const response = await airtableRequest(
    `${encodeURIComponent(CREDIT_LEDGER_ENTRIES_TABLE)}?${params.toString()}`,
    { method: "GET" },
  );
  if (!response.ok) {
    const message = await parseAirtableError(response);
    throw new SyncEndpointError(`Failed to find Credit Ledger Entry by source: ${message}`, 502);
  }

  const body = (await response.json()) as { records?: AirtableRecord[] };
  const rows = (body.records ?? []).map((record) => toCreditLedgerEntryRecord(record));
  if (rows.length === 0) return null;
  if (rows.length > 1) {
    throw new SyncEndpointError("Multiple Credit Ledger Entries found for immutable source.", 409);
  }
  return rows[0];
}

export async function getOrderItemCredits(
  orderItemRecordId: string,
): Promise<OrderItemCreditsRecord> {
  const record = await getRecord(ORDER_ITEMS_TABLE, orderItemRecordId, "Order Item");
  const fields = record.fields ?? {};
  return {
    recordId: record.id,
    creditsGrantedTotal: readNumberFromFields(fields, ["Credits Granted Total"]),
  };
}

export async function listOrderItemsForOrder(
  orderRecordId: string,
): Promise<OrderItemCreditsRecord[]> {
  const escapedOrderId = escapeAirtableFormulaString(orderRecordId);
  const formula = `FIND('${escapedOrderId}', ARRAYJOIN({Order}))`;
  let offset: string | undefined;
  const rows: OrderItemCreditsRecord[] = [];

  do {
    const params = new URLSearchParams({
      pageSize: "100",
      filterByFormula: formula,
    });
    if (offset) params.set("offset", offset);

    const response = await airtableRequest(
      `${encodeURIComponent(ORDER_ITEMS_TABLE)}?${params.toString()}`,
      { method: "GET" },
    );
    if (!response.ok) {
      const message = await parseAirtableError(response);
      throw new SyncEndpointError(`Failed to list Order Items for Order: ${message}`, 502);
    }

    const body = (await response.json()) as { records?: AirtableRecord[]; offset?: string };
    for (const record of body.records ?? []) {
      const fields = record.fields ?? {};
      rows.push({
        recordId: record.id,
        creditsGrantedTotal: readNumberFromFields(fields, ["Credits Granted Total"]),
      });
    }
    offset = body.offset;
  } while (offset);

  return rows;
}

export async function getOrderClientId(orderRecordId: string): Promise<string | null> {
  const record = await getRecord(ORDERS_TABLE, orderRecordId, "Order");
  const fields = record.fields ?? {};
  return readFirstLinkedId(fields.Client);
}

export async function findClientProfileByClientId(clientRecordId: string): Promise<string> {
  const escaped = escapeAirtableFormulaString(clientRecordId);
  const params = new URLSearchParams({
    maxRecords: "2",
    filterByFormula: `FIND('${escaped}', ARRAYJOIN({Client}))`,
  });

  const response = await airtableRequest(
    `${encodeURIComponent(CLIENT_PROFILES_TABLE)}?${params.toString()}`,
    { method: "GET" },
  );
  if (!response.ok) {
    const message = await parseAirtableError(response);
    throw new SyncEndpointError(`Failed to resolve Client Profile by Client: ${message}`, 502);
  }

  const body = (await response.json()) as { records?: AirtableRecord[] };
  const rows = body.records ?? [];
  if (rows.length === 0) {
    throw new SyncEndpointError("No Client Profile found for Order client.", 422);
  }
  if (rows.length > 1) {
    throw new SyncEndpointError("Multiple Client Profiles found for Order client.", 409);
  }
  return rows[0].id;
}

export async function getLessonCreditsRecord(
  lessonRecordId: string,
): Promise<LessonCreditsRecord> {
  const record = await getRecord(LESSONS_TABLE, lessonRecordId, "Lesson");
  const fields = record.fields ?? {};
  return {
    recordId: record.id,
    status: readString(fields.Status),
    clientProfileId: readFirstLinkedIdFromFields(fields, ["Client Profile", "Profile"]),
    creditsCost: readNumberFromFields(fields, [
      "Lesson Type::Credits Cost",
      "Credits Cost",
      "Credit Cost",
    ]),
  };
}
