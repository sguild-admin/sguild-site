import { airtableSchema } from "@/config/airtable-schema";
import { airtableRequest, escapeAirtableFormulaString, parseAirtableError } from "@/lib/airtable/client";
import { SyncEndpointError } from "@/lib/errors";

type AirtableRecord = {
  id: string;
  fields?: Record<string, unknown>;
};

const REFUND_EXTERNALS_TABLE = airtableSchema.operations.tables.refundExternals;
const REFUNDS_TABLE = airtableSchema.operations.tables.refunds;
const ORDERS_TABLE = airtableSchema.operations.tables.orders;
const ORG_INTEGRATIONS_TABLE = airtableSchema.operations.tables.organizationIntegrations;
const PROVIDER_ACCOUNTS_TABLE = airtableSchema.operations.tables.providerAccounts;
const EXTERNAL_ACTIONS_TABLE = airtableSchema.operations.tables.externalActions;

const REFUND_EXTERNAL_FIELDS = airtableSchema.operations.fields.refundExternals;
const REFUND_FIELDS = airtableSchema.operations.fields.refunds;
const ORDER_FIELDS = airtableSchema.operations.fields.orders;
const PROVIDER_ACCOUNT_FIELDS = airtableSchema.operations.fields.providerAccounts;
const EXTERNAL_ACTION_FIELDS = airtableSchema.operations.fields.externalActions;

export type RefundExternalProcessRecord = {
  recordId: string;
  syncStatus: string | null;
  writebackStatus: string | null;
  externalRefundId: string | null;
  currentExternalStatus: string | null;
  lastProviderActivityAt: string | null;
  syncError: string | null;
  hasException: boolean;
  canonicalOrgMismatch: boolean;
  refundId: string | null;
  orgIntegrationId: string | null;
  provider: string | null;
  providerAccountId: string | null;
  organization: string | null;
  refundOrganization: string | null;
  refundStatus: string | null;
  refundAmount: number | null;
  creditsRevoked: number | null;
  orderId: string | null;
};

export type RefundRecord = {
  recordId: string;
  status: string | null;
  refundAmount: number | null;
  creditsRevoked: number | null;
  orderId: string | null;
};

export type OrderRecord = {
  recordId: string;
  status: string | null;
  amountPaid: number | null;
  paymentCollectionMethod: string | null;
  currency: string | null;
  organizationId: string | null;
};

export type OrgIntegrationRecord = {
  recordId: string;
  provider: string | null;
  organization: string | null;
  providerAccountId: string | null;
};

export type ProviderAccountRecord = {
  recordId: string;
  provider: string | null;
  status: string | null;
  apiBaseUrl: string | null;
  apiCredentialAlias: string | null;
};

export type RefundExternalActionRecord = {
  recordId: string;
  actionType: string | null;
  status: string | null;
  direction: string | null;
  attemptNumber: number | null;
  occurredAt: string | null;
  writebackStatus: string | null;
  notes: string | null;
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
  return parsed ?? false;
}

function readFirstLinkedId(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.startsWith("rec") ? trimmed : null;
  }
  if (!Array.isArray(value) || value.length === 0) return null;
  const first = value[0];
  if (typeof first === "string" && first.trim().length > 0) return first.trim();
  if (typeof first === "object" && first != null) {
    const typed = first as { id?: unknown };
    if (typeof typed.id === "string" && typed.id.trim().length > 0) {
      return typed.id.trim();
    }
  }
  return null;
}

function hasLinkedRecordId(value: unknown): boolean {
  if (!Array.isArray(value)) return false;
  return value.some((item) => typeof item === "string" && item.trim().startsWith("rec"));
}

function removableFieldName(message: string): string | null {
  const missingFieldMatch = message.match(/Unknown field name: "([^"]+)"/);
  if (missingFieldMatch?.[1]) return missingFieldMatch[1];
  const computedFieldMatch = message.match(/Field "([^"]+)" cannot accept a value because the field is computed/i);
  if (computedFieldMatch?.[1]) return computedFieldMatch[1];
  return null;
}

function isLikelyRefundExternalRecord(record: AirtableRecord): boolean {
  const fields = record.fields ?? {};
  const hasSyncOrWritebackField =
    Object.prototype.hasOwnProperty.call(fields, REFUND_EXTERNAL_FIELDS.syncStatus) ||
    Object.prototype.hasOwnProperty.call(fields, REFUND_EXTERNAL_FIELDS.externalRefundId) ||
    Object.prototype.hasOwnProperty.call(fields, REFUND_EXTERNAL_FIELDS.writebackStatus);
  const hasRefundLink =
    hasLinkedRecordId(fields[REFUND_EXTERNAL_FIELDS.refund]) ||
    hasLinkedRecordId(fields["Refund"]);
  return hasSyncOrWritebackField && hasRefundLink;
}

function isLikelyRefundRecord(record: AirtableRecord): boolean {
  const fields = record.fields ?? {};
  const hasOrderLink = hasLinkedRecordId(fields[REFUND_FIELDS.order]) || hasLinkedRecordId(fields["Order"]);
  const hasRefundExternalSyncField = Object.prototype.hasOwnProperty.call(
    fields,
    REFUND_EXTERNAL_FIELDS.syncStatus,
  );
  return hasOrderLink && !hasRefundExternalSyncField;
}

async function getRecord(tableName: string, recordId: string, resourceLabel: string): Promise<AirtableRecord> {
  const response = await airtableRequest(
    `${encodeURIComponent(tableName)}/${encodeURIComponent(recordId)}`,
    { method: "GET" },
  );
  if (response.status === 404) {
    throw new SyncEndpointError(`${resourceLabel} not found.`, 404);
  }
  if (!response.ok) {
    const message = await parseAirtableError(response);
    throw new SyncEndpointError(`Failed to load ${resourceLabel}: ${message}`, 502);
  }
  return (await response.json()) as AirtableRecord;
}

async function patchRecord(
  tableName: string,
  recordId: string,
  fields: Record<string, unknown>,
  optionalFieldNames: Set<string>,
  resourceLabel: string,
): Promise<void> {
  if (Object.keys(fields).length === 0) return;
  const path = `${encodeURIComponent(tableName)}/${encodeURIComponent(recordId)}`;
  let nextFields = { ...fields };

  while (true) {
    const response = await airtableRequest(path, {
      method: "PATCH",
      body: JSON.stringify({ fields: nextFields }),
    });
    if (response.ok) return;

    const message = await parseAirtableError(response);
    const removableField = removableFieldName(message);
    if (removableField && optionalFieldNames.has(removableField) && removableField in nextFields) {
      const reduced: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(nextFields)) {
        if (key === removableField) continue;
        reduced[key] = value;
      }
      nextFields = reduced;
      if (Object.keys(nextFields).length === 0) return;
      continue;
    }

    throw new SyncEndpointError(`Failed to update ${resourceLabel}: ${message}`, 502);
  }
}

function toRefundExternalProcessRecord(record: AirtableRecord): RefundExternalProcessRecord {
  const fields = record.fields ?? {};
  return {
    recordId: record.id,
    syncStatus: readString(fields[REFUND_EXTERNAL_FIELDS.syncStatus]),
    writebackStatus: readString(fields[REFUND_EXTERNAL_FIELDS.writebackStatus]),
    externalRefundId: readString(fields[REFUND_EXTERNAL_FIELDS.externalRefundId]),
    currentExternalStatus: readString(fields[REFUND_EXTERNAL_FIELDS.currentExternalStatus]),
    lastProviderActivityAt: readString(fields[REFUND_EXTERNAL_FIELDS.lastProviderActivityAt]),
    syncError: readString(fields[REFUND_EXTERNAL_FIELDS.syncError]),
    hasException: readFlag(fields[REFUND_EXTERNAL_FIELDS.hasException]),
    canonicalOrgMismatch: readFlag(fields[REFUND_EXTERNAL_FIELDS.canonicalOrgMismatch]),
    refundId:
      readFirstLinkedId(fields[REFUND_EXTERNAL_FIELDS.refund]) ??
      readFirstLinkedId(fields["Refund"]) ??
      readFirstLinkedId(fields["Refunds"]),
    orgIntegrationId:
      readFirstLinkedId(fields[REFUND_EXTERNAL_FIELDS.orgIntegration]),
    provider: readString(fields[REFUND_EXTERNAL_FIELDS.provider]),
    providerAccountId: readFirstLinkedId(fields[REFUND_EXTERNAL_FIELDS.providerAccount]),
    organization: readString(fields[REFUND_EXTERNAL_FIELDS.organization]),
    refundOrganization: readString(fields[REFUND_EXTERNAL_FIELDS.refundOrganization]),
    refundStatus: readString(fields[REFUND_EXTERNAL_FIELDS.refundStatus]),
    refundAmount: readNumber(fields[REFUND_EXTERNAL_FIELDS.refundAmount]),
    creditsRevoked: readNumber(fields[REFUND_EXTERNAL_FIELDS.creditsRevoked]),
    orderId: readFirstLinkedId(fields[REFUND_EXTERNAL_FIELDS.orderFromRefund]),
  };
}

function toRefundRecord(record: AirtableRecord): RefundRecord {
  const fields = record.fields ?? {};
  return {
    recordId: record.id,
    status: readString(fields[REFUND_FIELDS.status]),
    refundAmount: readNumber(fields[REFUND_FIELDS.refundAmount]),
    creditsRevoked: readNumber(fields[REFUND_FIELDS.creditsRevoked]),
    orderId: readFirstLinkedId(fields[REFUND_FIELDS.order]),
  };
}

function toOrderRecord(record: AirtableRecord): OrderRecord {
  const fields = record.fields ?? {};
  return {
    recordId: record.id,
    status: readString(fields[ORDER_FIELDS.status]),
    amountPaid: readNumber(fields[ORDER_FIELDS.amountPaid]),
    paymentCollectionMethod: readString(fields[ORDER_FIELDS.paymentCollectionMethod]),
    currency: readString(fields[ORDER_FIELDS.currency]),
    organizationId: readFirstLinkedId(fields[ORDER_FIELDS.organization]),
  };
}

function toOrgIntegrationRecord(record: AirtableRecord): OrgIntegrationRecord {
  const fields = record.fields ?? {};
  return {
    recordId: record.id,
    provider: readString(fields.Provider),
    organization:
      readString(fields.Organization) ??
      readString(fields["Organization Name"]),
    providerAccountId:
      readFirstLinkedId(fields["Provider Account"]) ??
      readFirstLinkedId(fields["Global Provider Account"]),
  };
}

function toProviderAccountRecord(record: AirtableRecord): ProviderAccountRecord {
  const fields = record.fields ?? {};
  return {
    recordId: record.id,
    provider: readString(fields[PROVIDER_ACCOUNT_FIELDS.provider]),
    status: readString(fields[PROVIDER_ACCOUNT_FIELDS.status]),
    apiBaseUrl: readString(fields[PROVIDER_ACCOUNT_FIELDS.apiBaseUrl]),
    apiCredentialAlias:
      readString(fields[PROVIDER_ACCOUNT_FIELDS.apiCredentialAlias]) ??
      readString(fields[PROVIDER_ACCOUNT_FIELDS.accessTokenAlias]),
  };
}

function toRefundExternalActionRecord(record: AirtableRecord): RefundExternalActionRecord {
  const fields = record.fields ?? {};
  return {
    recordId: record.id,
    actionType: readString(fields[EXTERNAL_ACTION_FIELDS.actionType]),
    status: readString(fields[EXTERNAL_ACTION_FIELDS.status]),
    direction: readString(fields[EXTERNAL_ACTION_FIELDS.direction]),
    attemptNumber: readNumber(fields[EXTERNAL_ACTION_FIELDS.attemptNumber]),
    occurredAt: readString(fields[EXTERNAL_ACTION_FIELDS.occurredAt]),
    writebackStatus: readString(fields[EXTERNAL_ACTION_FIELDS.writebackStatus]),
    notes: readString(fields[EXTERNAL_ACTION_FIELDS.notes]),
  };
}

async function getRefundExternalForProcess(recordId: string): Promise<RefundExternalProcessRecord> {
  const record = await getRecord(REFUND_EXTERNALS_TABLE, recordId, "Refund External");
  if (!isLikelyRefundExternalRecord(record)) {
    throw new SyncEndpointError("Refund External not found.", 404);
  }
  return toRefundExternalProcessRecord(record);
}

async function findRefundExternalByExternalRefundId(
  externalRefundId: string,
): Promise<RefundExternalProcessRecord | null> {
  const escaped = escapeAirtableFormulaString(externalRefundId);
  const formula = `{${REFUND_EXTERNAL_FIELDS.externalRefundId}}='${escaped}'`;
  const params = new URLSearchParams({
    pageSize: "2",
    filterByFormula: formula,
  });

  const response = await airtableRequest(
    `${encodeURIComponent(REFUND_EXTERNALS_TABLE)}?${params.toString()}`,
    { method: "GET" },
  );
  if (!response.ok) {
    const message = await parseAirtableError(response);
    if (/Unknown field name/i.test(message) || /Unknown field names/i.test(message)) {
      return null;
    }
    throw new SyncEndpointError(`Failed to find Refund External by External Refund ID: ${message}`, 502);
  }

  const body = (await response.json()) as { records?: AirtableRecord[] };
  const records = body.records ?? [];
  if (records.length === 0) return null;
  if (records.length > 1) {
    throw new SyncEndpointError(
      "Multiple Refund Externals found for External Refund ID. Ambiguous refund writeback target.",
      409,
    );
  }

  return toRefundExternalProcessRecord(records[0]);
}

async function resolveRefundExternalForProcessByAnyId(inputRecordId: string): Promise<{
  refundExternalRecordId: string;
  refundExternal: RefundExternalProcessRecord;
}> {
  try {
    const refundExternal = await getRefundExternalForProcess(inputRecordId);
    return { refundExternalRecordId: refundExternal.recordId, refundExternal };
  } catch (error) {
    if (!(error instanceof SyncEndpointError) || error.status !== 404) throw error;
  }

  const refundRecord = await getRecord(REFUNDS_TABLE, inputRecordId, "Refund");
  const refundFields = refundRecord.fields ?? {};
  const rawLink =
    refundFields["Refund External"] ??
    refundFields["Refund Externals"] ??
    refundFields["Refund Externals"];

  const linkedIds = Array.isArray(rawLink)
    ? rawLink.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];

  if (linkedIds.length === 0) {
    throw new SyncEndpointError(
      "Refund is linked, but no Refund External record is connected yet.",
      422,
    );
  }
  if (linkedIds.length > 1) {
    throw new SyncEndpointError(
      "Refund has multiple linked Refund Externals. Cannot determine target deterministically.",
      409,
    );
  }

  const refundExternal = await getRefundExternalForProcess(linkedIds[0]);
  return { refundExternalRecordId: refundExternal.recordId, refundExternal };
}

async function findRefundRecordIdByRefundExternalId(
  refundExternalRecordId: string,
): Promise<string | null> {
  const escaped = escapeAirtableFormulaString(refundExternalRecordId);
  const formulas = [
    `FIND('${escaped}', ARRAYJOIN({Refund External}))`,
    `FIND('${escaped}', ARRAYJOIN({Refund Externals}))`,
  ];

  for (const formula of formulas) {
    const params = new URLSearchParams({
      pageSize: "2",
      filterByFormula: formula,
    });
    const response = await airtableRequest(
      `${encodeURIComponent(REFUNDS_TABLE)}?${params.toString()}`,
      { method: "GET" },
    );
    if (!response.ok) {
      const message = await parseAirtableError(response);
      if (/Unknown field name/i.test(message) || /Unknown field names/i.test(message)) {
        continue;
      }
      throw new SyncEndpointError(`Failed reverse lookup of Refund by Refund External: ${message}`, 502);
    }

    const body = (await response.json()) as { records?: AirtableRecord[] };
    const records = body.records ?? [];
    if (records.length === 0) continue;
    if (records.length > 1) {
      throw new SyncEndpointError(
        "Multiple Refund records reference this Refund External. Ambiguous canonical refund.",
        409,
      );
    }
    return records[0].id;
  }

  return null;
}

async function getRefundRecord(recordId: string): Promise<RefundRecord> {
  const record = await getRecord(REFUNDS_TABLE, recordId, "Refund");
  if (!isLikelyRefundRecord(record)) {
    throw new SyncEndpointError("Refund not found.", 404);
  }
  return toRefundRecord(record);
}

async function getOrderRecord(recordId: string): Promise<OrderRecord> {
  return toOrderRecord(await getRecord(ORDERS_TABLE, recordId, "Order"));
}

async function getOrgIntegrationRecord(recordId: string): Promise<OrgIntegrationRecord> {
  return toOrgIntegrationRecord(
    await getRecord(ORG_INTEGRATIONS_TABLE, recordId, "Organization Integration"),
  );
}

async function getProviderAccountRecord(recordId: string): Promise<ProviderAccountRecord> {
  return toProviderAccountRecord(
    await getRecord(PROVIDER_ACCOUNTS_TABLE, recordId, "Provider Account"),
  );
}

async function listCreateActionsByRefundExternal(
  refundExternalRecordId: string,
): Promise<RefundExternalActionRecord[]> {
  const escapedRefundExternalId = escapeAirtableFormulaString(refundExternalRecordId);
  const linkFieldCandidates = Array.from(
    new Set([EXTERNAL_ACTION_FIELDS.refundExternal, "Refund External", "Refund Externals"]),
  );

  for (const linkField of linkFieldCandidates) {
    const formula =
      `AND(` +
      `FIND('${escapedRefundExternalId}', ARRAYJOIN({${linkField}})),` +
      `{${EXTERNAL_ACTION_FIELDS.direction}}='Outbound',` +
      `{${EXTERNAL_ACTION_FIELDS.actionType}}='Create'` +
      `)`;

    let offset: string | undefined;
    const rows: RefundExternalActionRecord[] = [];
    let unknownFieldForCandidate = false;

    do {
      const params = new URLSearchParams({
        pageSize: "100",
        filterByFormula: formula,
        "sort[0][field]": EXTERNAL_ACTION_FIELDS.occurredAt,
        "sort[0][direction]": "asc",
      });
      if (offset) params.set("offset", offset);

      const response = await airtableRequest(
        `${encodeURIComponent(EXTERNAL_ACTIONS_TABLE)}?${params.toString()}`,
        { method: "GET" },
      );
      if (!response.ok) {
        const message = await parseAirtableError(response);
        if (/Unknown field name/i.test(message) || /Unknown field names/i.test(message)) {
          unknownFieldForCandidate = true;
          break;
        }
        throw new SyncEndpointError(`Failed to list Refund External actions: ${message}`, 502);
      }

      const body = (await response.json()) as { records?: AirtableRecord[]; offset?: string };
      for (const record of body.records ?? []) {
        rows.push(toRefundExternalActionRecord(record));
      }
      offset = body.offset;
    } while (offset);

    if (unknownFieldForCandidate) continue;
    return rows;
  }

  return [];
}

async function findLatestCreateActionByRefundExternalToken(
  refundExternalRecordId: string,
): Promise<RefundExternalActionRecord | null> {
  const escapedToken = escapeAirtableFormulaString(`refundExternalRecordId=${refundExternalRecordId}`);
  const formula = `AND(` +
    `FIND('${escapedToken}', {${EXTERNAL_ACTION_FIELDS.notes}}),` +
    `{${EXTERNAL_ACTION_FIELDS.direction}}='Outbound',` +
    `{${EXTERNAL_ACTION_FIELDS.actionType}}='Create'` +
  `)`;

  const params = new URLSearchParams({
    pageSize: "1",
    filterByFormula: formula,
    "sort[0][field]": EXTERNAL_ACTION_FIELDS.occurredAt,
    "sort[0][direction]": "desc",
  });
  const response = await airtableRequest(
    `${encodeURIComponent(EXTERNAL_ACTIONS_TABLE)}?${params.toString()}`,
    { method: "GET" },
  );
  if (!response.ok) {
    const message = await parseAirtableError(response);
    if (/Unknown field name/i.test(message) || /Unknown field names/i.test(message)) {
      return null;
    }
    throw new SyncEndpointError(`Failed to locate External Action by refund token: ${message}`, 502);
  }

  const body = (await response.json()) as { records?: AirtableRecord[] };
  const first = body.records?.[0];
  return first ? toRefundExternalActionRecord(first) : null;
}

async function listRefundExternalsByOrder(orderId: string): Promise<RefundExternalProcessRecord[]> {
  const escapedOrderId = escapeAirtableFormulaString(orderId);
  const formulas = [
    `FIND('${escapedOrderId}', ARRAYJOIN({${REFUND_EXTERNAL_FIELDS.orderFromRefund}}))`,
    `FIND('${escapedOrderId}', ARRAYJOIN({Order (from Refund)}))`,
    `FIND('${escapedOrderId}', ARRAYJOIN({Order}))`,
  ];

  for (const formula of formulas) {
    const params = new URLSearchParams({
      pageSize: "100",
      filterByFormula: formula,
    });
    const response = await airtableRequest(
      `${encodeURIComponent(REFUND_EXTERNALS_TABLE)}?${params.toString()}`,
      { method: "GET" },
    );
    if (!response.ok) {
      const message = await parseAirtableError(response);
      if (/Unknown field name/i.test(message) || /Unknown field names/i.test(message)) {
        continue;
      }
      throw new SyncEndpointError(`Failed to list Refund Externals by Order: ${message}`, 502);
    }

    const body = (await response.json()) as { records?: AirtableRecord[] };
    const records = (body.records ?? []).filter((record) => isLikelyRefundExternalRecord(record));
    if (records.length > 0) {
      return records.map((record) => toRefundExternalProcessRecord(record));
    }
  }

  return [];
}

async function getRefundIdFromRefundExternalRecord(recordId: string): Promise<string | null> {
  const response = await airtableRequest(
    `${encodeURIComponent(REFUND_EXTERNALS_TABLE)}/${encodeURIComponent(recordId)}`,
    { method: "GET" },
  );
  if (!response.ok) return null;

  const record = (await response.json()) as AirtableRecord;
  const fields = record.fields ?? {};

  const refundId =
    readFirstLinkedId(fields[REFUND_EXTERNAL_FIELDS.refund]) ??
    readFirstLinkedId(fields["Refund"]) ??
    readFirstLinkedId(fields["Refunds"]);

  if (!refundId) {
    // Diagnostic: log every field the API returned so we can identify the correct field name.
    const fieldSummary: Record<string, string> = {};
    for (const [key, value] of Object.entries(fields)) {
      if (Array.isArray(value)) {
        fieldSummary[key] = `array(${value.length}): ${JSON.stringify(value.slice(0, 2))}`;
      } else if (value != null) {
        fieldSummary[key] = `${typeof value}: ${JSON.stringify(value).slice(0, 80)}`;
      }
    }
    console.error("getRefundIdFromRefundExternalRecord: no refundId found in fresh GET", {
      recordId,
      fieldSummary,
    });
  }

  return refundId;
}

async function updateRefundExternalRecord(recordId: string, fields: Record<string, unknown>): Promise<void> {
  const nextFields: Record<string, unknown> = { ...fields };
  await patchRecord(
    REFUND_EXTERNALS_TABLE,
    recordId,
    nextFields,
    new Set([
      REFUND_EXTERNAL_FIELDS.orgIntegration,
      REFUND_EXTERNAL_FIELDS.syncStatus,
      REFUND_EXTERNAL_FIELDS.writebackStatus,
      REFUND_EXTERNAL_FIELDS.externalRefundId,
      REFUND_EXTERNAL_FIELDS.currentExternalStatus,
      REFUND_EXTERNAL_FIELDS.lastProviderActivityAt,
      REFUND_EXTERNAL_FIELDS.lastSyncedAt,
      REFUND_EXTERNAL_FIELDS.syncError,
      REFUND_EXTERNAL_FIELDS.writebackAt,
      REFUND_EXTERNAL_FIELDS.writebackError,
    ]),
    "Refund External",
  );
}

export const refundExternalsRepo = {
  getRefundExternalForProcess,
  findRefundExternalByExternalRefundId,
  resolveRefundExternalForProcessByAnyId,
  findRefundRecordIdByRefundExternalId,
  getRefundIdFromRefundExternalRecord,
  getRefundRecord,
  getOrderRecord,
  getOrgIntegrationRecord,
  getProviderAccountRecord,
  listCreateActionsByRefundExternal,
  findLatestCreateActionByRefundExternalToken,
  listRefundExternalsByOrder,
  updateRefundExternalRecord,
};
