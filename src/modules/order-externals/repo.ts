import { airtableSchema } from "@/config/airtable-schema";
import { SyncEndpointError } from "@/lib/errors";
import {
  airtableRequest,
  escapeAirtableFormulaString,
  parseAirtableError,
} from "@/lib/airtable/client";
import type {
  CreateOrderExternalDto,
  FindOrderExternalByExternalIdsDto,
  OrderExternalRecordDto,
  UpdateOrderExternalDto,
} from "./dto";

const ORDER_EXTERNALS_TABLE = airtableSchema.operations.tables.orderExternals;
const ORDER_EXTERNAL_FIELDS = airtableSchema.operations.fields.orderExternals;

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
  const bool = readBoolean(value);
  if (bool != null) return bool;
  const num = readNumber(value);
  if (num != null) return num !== 0;
  return false;
}

function readLinkedIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const ids: string[] = [];
  for (const item of value) {
    if (typeof item === "string" && item.trim().length > 0) ids.push(item.trim());
  }
  return ids;
}

function readFirstLinkedId(value: unknown): string | null {
  const ids = readLinkedIds(value);
  return ids[0] ?? null;
}

function asSyncStatus(value: string | null): OrderExternalRecordDto["syncStatus"] {
  if (value === "Pending" || value === "Synced" || value === "Failed" || value === "Ignored") return value;
  return null;
}

function asWritebackStatus(value: string | null): OrderExternalRecordDto["writebackStatus"] {
  if (value === "Not Started" || value === "Pending" || value === "Succeeded" || value === "Failed") return value;
  return null;
}

function toRecord(record: AirtableRecord): OrderExternalRecordDto {
  const fields = record.fields ?? {};
  return {
    recordId: record.id,
    orderRecordId: readFirstLinkedId(fields[ORDER_EXTERNAL_FIELDS.order]),
    orgIntegrationRecordId: readFirstLinkedId(fields[ORDER_EXTERNAL_FIELDS.orgIntegration]),
    globalProviderAccountRecordId: readFirstLinkedId(fields[ORDER_EXTERNAL_FIELDS.globalProviderAccount]),
    externalActionIds: readLinkedIds(fields[ORDER_EXTERNAL_FIELDS.externalActions]),
    syncStatus: asSyncStatus(readString(fields[ORDER_EXTERNAL_FIELDS.syncStatus])),
    writebackStatus: asWritebackStatus(readString(fields[ORDER_EXTERNAL_FIELDS.writebackStatus])),
    currentExternalStatus: readString(fields[ORDER_EXTERNAL_FIELDS.currentExternalStatus]),
    lastProviderActivityAt: readString(fields[ORDER_EXTERNAL_FIELDS.lastProviderActivityAt]),
    lastSyncedAt: readString(fields[ORDER_EXTERNAL_FIELDS.lastSyncedAt]),
    syncError: readString(fields[ORDER_EXTERNAL_FIELDS.syncError]),
    writebackAt: readString(fields[ORDER_EXTERNAL_FIELDS.writebackAt]),
    writebackError: readString(fields[ORDER_EXTERNAL_FIELDS.writebackError]),
    notes: readString(fields[ORDER_EXTERNAL_FIELDS.notes]),
    externalOrderId: readString(fields[ORDER_EXTERNAL_FIELDS.externalOrderId]),
    externalPaymentId: readString(fields[ORDER_EXTERNAL_FIELDS.externalPaymentId]),
    externalInvoiceId: readString(fields[ORDER_EXTERNAL_FIELDS.externalInvoiceId]),
    externalPaymentStatusSnapshot: readString(fields[ORDER_EXTERNAL_FIELDS.externalPaymentStatusSnapshot]),
    externalInvoiceStatusSnapshot: readString(fields[ORDER_EXTERNAL_FIELDS.externalInvoiceStatusSnapshot]),
    externalInvoiceUrlSnapshot: readString(fields[ORDER_EXTERNAL_FIELDS.externalInvoiceUrlSnapshot]),
    externalInvoiceSentAtSnapshot: readString(fields[ORDER_EXTERNAL_FIELDS.externalInvoiceSentAtSnapshot]),
    externalInvoicePaidAtSnapshot: readString(fields[ORDER_EXTERNAL_FIELDS.externalInvoicePaidAtSnapshot]),
    customerIdSnapshot: readString(fields[ORDER_EXTERNAL_FIELDS.customerIdSnapshot]),
    cardIdSnapshot: readString(fields[ORDER_EXTERNAL_FIELDS.cardIdSnapshot]),
    amountSnapshotCents: readNumber(fields[ORDER_EXTERNAL_FIELDS.amountSnapshotCents]),
    rawPayloadSnapshot: readString(fields[ORDER_EXTERNAL_FIELDS.rawPayloadSnapshot]),
    provider: readString(fields[ORDER_EXTERNAL_FIELDS.provider]),
    organizationRecordId: readFirstLinkedId(fields[ORDER_EXTERNAL_FIELDS.orderOrganization]),
    clientProfileRecordId: readFirstLinkedId(fields[ORDER_EXTERNAL_FIELDS.clientProfile]),
    clientRecordId: readFirstLinkedId(fields[ORDER_EXTERNAL_FIELDS.client]),
    orderStatus: readString(fields[ORDER_EXTERNAL_FIELDS.orderStatus]),
    billingState: readString(fields[ORDER_EXTERNAL_FIELDS.billingState]),
    paymentCollectionMethod: readString(fields[ORDER_EXTERNAL_FIELDS.paymentCollectionMethod]),
    orderTotal: readNumber(fields[ORDER_EXTERNAL_FIELDS.orderTotal]),
    orderAmountPaid: readNumber(fields[ORDER_EXTERNAL_FIELDS.orderAmountPaid]),
    hasExternalIdentity: readFlag(fields[ORDER_EXTERNAL_FIELDS.hasExternalIdentity]),
    needsProviderReview: readFlag(fields[ORDER_EXTERNAL_FIELDS.needsProviderReview]),
    missingRequiredLinks: readFlag(fields[ORDER_EXTERNAL_FIELDS.missingRequiredLinks]),
    canonicalOrgMismatch:
      readFlag(fields[ORDER_EXTERNAL_FIELDS.orgIntegrationOrderOrgMismatch]) ||
      readFlag(fields["Canonical Org Mismatch"]),
    hasException: readFlag(fields[ORDER_EXTERNAL_FIELDS.hasException]),
    exceptionReason: readString(fields[ORDER_EXTERNAL_FIELDS.exceptionReason]),
  };
}

function toFields(input: Partial<CreateOrderExternalDto | UpdateOrderExternalDto>): Record<string, unknown> {
  const fields: Record<string, unknown> = {};

  if ("orderRecordId" in input && input.orderRecordId) fields[ORDER_EXTERNAL_FIELDS.order] = [input.orderRecordId];
  if (input.orgIntegrationRecordId) {
    fields[ORDER_EXTERNAL_FIELDS.orgIntegration] = [input.orgIntegrationRecordId];
  }
  if ("clientExternalRecordId" in input && input.clientExternalRecordId) {
    fields[ORDER_EXTERNAL_FIELDS.clientExternal] = [input.clientExternalRecordId];
  }
  if (input.globalProviderAccountRecordId) {
    fields[ORDER_EXTERNAL_FIELDS.globalProviderAccount] = [input.globalProviderAccountRecordId];
  }

  if (input.syncStatus) fields[ORDER_EXTERNAL_FIELDS.syncStatus] = input.syncStatus;
  if (input.writebackStatus) fields[ORDER_EXTERNAL_FIELDS.writebackStatus] = input.writebackStatus;
  if (input.currentExternalStatus != null) fields[ORDER_EXTERNAL_FIELDS.currentExternalStatus] = input.currentExternalStatus;
  if (input.lastProviderActivityAt) fields[ORDER_EXTERNAL_FIELDS.lastProviderActivityAt] = input.lastProviderActivityAt;
  if (input.lastSyncedAt) fields[ORDER_EXTERNAL_FIELDS.lastSyncedAt] = input.lastSyncedAt;
  if (input.syncError != null) fields[ORDER_EXTERNAL_FIELDS.syncError] = input.syncError;
  if (input.writebackAt) fields[ORDER_EXTERNAL_FIELDS.writebackAt] = input.writebackAt;
  if (input.writebackError != null) fields[ORDER_EXTERNAL_FIELDS.writebackError] = input.writebackError;
  if (input.notes != null) fields[ORDER_EXTERNAL_FIELDS.notes] = input.notes;

  if (input.externalOrderId != null) fields[ORDER_EXTERNAL_FIELDS.externalOrderId] = input.externalOrderId;
  if (input.externalPaymentId != null) fields[ORDER_EXTERNAL_FIELDS.externalPaymentId] = input.externalPaymentId;
  if (input.externalInvoiceId != null) fields[ORDER_EXTERNAL_FIELDS.externalInvoiceId] = input.externalInvoiceId;

  if (input.externalPaymentStatusSnapshot != null) {
    fields[ORDER_EXTERNAL_FIELDS.externalPaymentStatusSnapshot] = input.externalPaymentStatusSnapshot;
  }
  if (input.externalInvoiceStatusSnapshot != null) {
    fields[ORDER_EXTERNAL_FIELDS.externalInvoiceStatusSnapshot] = input.externalInvoiceStatusSnapshot;
  }
  if (input.externalInvoiceUrlSnapshot != null) {
    fields[ORDER_EXTERNAL_FIELDS.externalInvoiceUrlSnapshot] = input.externalInvoiceUrlSnapshot;
  }
  if (input.externalInvoiceSentAtSnapshot != null) {
    fields[ORDER_EXTERNAL_FIELDS.externalInvoiceSentAtSnapshot] = input.externalInvoiceSentAtSnapshot;
  }
  if (input.externalInvoicePaidAtSnapshot != null) {
    fields[ORDER_EXTERNAL_FIELDS.externalInvoicePaidAtSnapshot] = input.externalInvoicePaidAtSnapshot;
  }
  if (input.customerIdSnapshot != null) fields[ORDER_EXTERNAL_FIELDS.customerIdSnapshot] = input.customerIdSnapshot;
  if (input.cardIdSnapshot != null) fields[ORDER_EXTERNAL_FIELDS.cardIdSnapshot] = input.cardIdSnapshot;
  if (input.amountSnapshotCents != null) fields[ORDER_EXTERNAL_FIELDS.amountSnapshotCents] = input.amountSnapshotCents;
  if (input.rawPayloadSnapshot != null) fields[ORDER_EXTERNAL_FIELDS.rawPayloadSnapshot] = input.rawPayloadSnapshot;

  return fields;
}

async function createOrderExternal(input: CreateOrderExternalDto): Promise<OrderExternalRecordDto> {
  let fields = toFields(input);
  const response = await airtableRequest(encodeURIComponent(ORDER_EXTERNALS_TABLE), {
    method: "POST",
    body: JSON.stringify({ fields }),
  });

  if (!response.ok) {
    const message = await parseAirtableError(response);
    throw new SyncEndpointError(`Failed to create Order External: ${message}`, 502);
  }

  return toRecord((await response.json()) as AirtableRecord);
}

async function updateOrderExternal(input: UpdateOrderExternalDto): Promise<OrderExternalRecordDto> {
  const { recordId, ...rest } = input;
  let fields = toFields(rest);
  if (Object.keys(fields).length === 0) {
    return getOrderExternal(recordId);
  }

  const response = await airtableRequest(
    `${encodeURIComponent(ORDER_EXTERNALS_TABLE)}/${encodeURIComponent(recordId)}`,
    {
      method: "PATCH",
      body: JSON.stringify({ fields }),
    },
  );

  if (response.status === 404) {
    throw new SyncEndpointError("Order External not found.", 404);
  }
  if (!response.ok) {
    const message = await parseAirtableError(response);
    throw new SyncEndpointError(`Failed to update Order External: ${message}`, 502);
  }

  return toRecord((await response.json()) as AirtableRecord);
}

async function getOrderExternal(recordId: string): Promise<OrderExternalRecordDto> {
  const response = await airtableRequest(
    `${encodeURIComponent(ORDER_EXTERNALS_TABLE)}/${encodeURIComponent(recordId)}`,
    { method: "GET" },
  );

  if (response.status === 404) {
    throw new SyncEndpointError("Order External not found.", 404);
  }
  if (!response.ok) {
    const message = await parseAirtableError(response);
    throw new SyncEndpointError(`Failed to get Order External: ${message}`, 502);
  }

  return toRecord((await response.json()) as AirtableRecord);
}

async function findOrderExternalsByOrder(orderRecordId: string): Promise<OrderExternalRecordDto[]> {
  const escapedOrderId = escapeAirtableFormulaString(orderRecordId);
  const formula = `FIND('${escapedOrderId}', ARRAYJOIN({${ORDER_EXTERNAL_FIELDS.order}}))`;
  const rows: OrderExternalRecordDto[] = [];
  let offset: string | undefined;

  do {
    const params = new URLSearchParams({ pageSize: "100", filterByFormula: formula });
    if (offset) params.set("offset", offset);
    const response = await airtableRequest(
      `${encodeURIComponent(ORDER_EXTERNALS_TABLE)}?${params.toString()}`,
      { method: "GET" },
    );
    if (!response.ok) {
      const message = await parseAirtableError(response);
      throw new SyncEndpointError(`Failed to find Order Externals by Order: ${message}`, 502);
    }

    const body = (await response.json()) as { records?: AirtableRecord[]; offset?: string };
    for (const record of body.records ?? []) rows.push(toRecord(record));
    offset = body.offset;
  } while (offset);

  return rows;
}

async function findOrderExternalByExternalIds(
  input: FindOrderExternalByExternalIdsDto,
): Promise<OrderExternalRecordDto | null> {
  const conditions: string[] = [];
  if (input.externalOrderId) {
    conditions.push(
      `{${ORDER_EXTERNAL_FIELDS.externalOrderId}}='${escapeAirtableFormulaString(input.externalOrderId)}'`,
    );
  }
  if (input.externalPaymentId) {
    conditions.push(
      `{${ORDER_EXTERNAL_FIELDS.externalPaymentId}}='${escapeAirtableFormulaString(input.externalPaymentId)}'`,
    );
  }
  if (input.externalInvoiceId) {
    conditions.push(
      `{${ORDER_EXTERNAL_FIELDS.externalInvoiceId}}='${escapeAirtableFormulaString(input.externalInvoiceId)}'`,
    );
  }
  const formula = `OR(${conditions.join(",")})`;

  const params = new URLSearchParams({
    pageSize: "2",
    filterByFormula: formula,
  });
  const response = await airtableRequest(
    `${encodeURIComponent(ORDER_EXTERNALS_TABLE)}?${params.toString()}`,
    { method: "GET" },
  );

  if (!response.ok) {
    const message = await parseAirtableError(response);
    throw new SyncEndpointError(`Failed to find Order External by external IDs: ${message}`, 502);
  }

  const body = (await response.json()) as { records?: AirtableRecord[] };
  const records = body.records ?? [];
  if (records.length === 0) return null;
  if (records.length > 1) {
    throw new SyncEndpointError("Multiple Order Externals found for provided external IDs.", 409);
  }
  return toRecord(records[0]);
}

export const orderExternalsRepo = {
  createOrderExternal,
  updateOrderExternal,
  getOrderExternal,
  findOrderExternalsByOrder,
  findOrderExternalByExternalIds,
};
