import { BillingAction, SyncEndpointError } from "./response";

const ORDER_EXTERNALS_TABLE = "Order Externals";
const ORDERS_TABLE = "Orders";
const INVOICES_TABLE = "Invoices";
const INVOICE_EXTERNALS_TABLE = "Invoice Externals";
const ORG_INTEGRATIONS_TABLE = "Organization Integrations";
const ORDER_ITEMS_TABLE = "Order Items";
const CLIENT_EXTERNALS_TABLE = "Client Externals";
const CARD_EXTERNALS_TABLE = "Card Externals";

type AirtableRecord = {
  id: string;
  fields?: Record<string, unknown>;
};

type AirtableError = {
  error?: {
    type?: string;
    message?: string;
  };
};

export type OrderExternalRecord = {
  recordId: string;
  orderId: string | null;
  invoiceId: string | null;
  clientExternalId: string | null;
  externalAction: string | null;
  syncStatus: string | null;
  externalPaymentId: string | null;
  externalOrderId: string | null;
  externalInvoiceId: string | null;
  externalInvoiceUrl: string | null;
};

export type OrderRecord = {
  recordId: string;
  clientId: string | null;
  amountDue: number | null;
  currency: string | null;
  billingStatus: string | null;
};

export type InvoiceRecord = {
  recordId: string;
  orderId: string | null;
  status: string | null;
  amountDue: number | null;
  amountPaid: number | null;
  issuedAt: string | null;
  dueAt: string | null;
  paidAt: string | null;
};

export type OrgIntegrationRecord = {
  recordId: string;
  provider: string | null;
  providerAccountId: string | null;
  accessToken: string | null;
  externalLocationId: string | null;
};

export type ClientExternalRecord = {
  recordId: string;
  providerAccountId: string | null;
  externalCustomerId: string | null;
  activeCardCount: number | null;
};

export type CardExternalRecord = {
  recordId: string;
  externalCardId: string | null;
  modifiedAt: string | null;
};

export type InvoiceExternalRecord = {
  recordId: string;
  invoiceId: string | null;
  orderId: string | null;
  orgIntegrationId: string | null;
  externalInvoiceId: string | null;
  externalStatus: string | null;
  amountDue: number | null;
  amountPaid: number | null;
  issuedAt: string | null;
  dueAt: string | null;
  paidAt: string | null;
  hostedInvoiceUrl: string | null;
  lastSyncedAt: string | null;
  webhookReceivedAt: string | null;
  rawPayload: string | null;
  syncStatus: string | null;
  syncError: string | null;
};

export type OrderItem = {
  recordId: string;
  description: string | null;
  netAmount: number | null;
};

function readString(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const parsed = readString(item);
      if (parsed) return parsed;
    }
  }
  return null;
}

function readFirstLinkedId(value: unknown): string | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const [first] = value;
  return typeof first === "string" && first.trim().length > 0 ? first.trim() : null;
}

function readLinkedIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const ids: string[] = [];
  for (const item of value) {
    if (typeof item === "string" && item.trim().length > 0) ids.push(item.trim());
  }
  return ids;
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

function isEnabled(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "") return true;
    return normalized === "true" || normalized === "yes" || normalized === "enabled";
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return true;
    return value.some((item) => isEnabled(item));
  }
  if (typeof value === "object") {
    const asRecord = value as Record<string, unknown>;
    const name = readString(asRecord.name);
    if (name) return isEnabled(name);
    const id = readString(asRecord.id);
    if (id) return true;
  }
  return false;
}

function getAirtableConfig(): { token: string; baseId: string } {
  const token =
    readString(process.env.AIRTABLE_OPERATIONS_TOKEN) ?? readString(process.env.AIRTABLE_TOKEN);
  const baseId =
    readString(process.env.AIRTABLE_OPERATIONS_BASE_ID) ?? readString(process.env.AIRTABLE_BASE_ID);

  if (!token || !baseId) {
    throw new SyncEndpointError("Airtable configuration is missing.", 500, {
      exposeMessage: false,
    });
  }

  return { token, baseId };
}

async function parseAirtableError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as AirtableError;
    if (body.error?.message) return body.error.message;
  } catch {
    // fall through
  }
  return response.statusText || "Unknown Airtable error";
}

async function airtableRequest(path: string, init?: RequestInit): Promise<Response> {
  const { token, baseId } = getAirtableConfig();
  try {
    const response = await fetch(`https://api.airtable.com/v0/${baseId}/${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
      cache: "no-store",
    });
    return response;
  } catch (error) {
    throw new SyncEndpointError("Airtable request failed to reach upstream.", 502, {
      exposeMessage: true,
      rawPayload: error instanceof Error ? error.message : String(error),
    });
  }
}

function escapeAirtableFormulaString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

async function getRecord(
  tableName: string,
  recordId: string,
  resourceLabel: string,
): Promise<AirtableRecord> {
  const response = await airtableRequest(
    `${encodeURIComponent(tableName)}/${encodeURIComponent(recordId)}`,
    { method: "GET" },
  );

  if (response.status === 404) {
    throw new SyncEndpointError(`${resourceLabel} not found.`, 404);
  }

  if (!response.ok) {
    const message = await parseAirtableError(response);
    throw new SyncEndpointError(`Airtable request failed: ${message}`, 502);
  }

  return (await response.json()) as AirtableRecord;
}

export async function getOrderExternalRecord(recordId: string): Promise<OrderExternalRecord> {
  const record = await getRecord(ORDER_EXTERNALS_TABLE, recordId, "Order External");
  const fields = record.fields ?? {};

  return {
    recordId: record.id,
    orderId: readFirstLinkedId(fields.Order),
    invoiceId: readFirstLinkedId(fields.Invoice),
    clientExternalId: readFirstLinkedId(fields["Client External"]),
    externalAction: readString(fields["External Action"]),
    syncStatus: readString(fields["Sync Status"]),
    externalPaymentId: readString(fields["External Payment ID"]),
    externalOrderId: readString(fields["External Order ID"]),
    externalInvoiceId: readString(fields["External Invoice ID"]),
    externalInvoiceUrl: readString(fields["External Invoice URL"]),
  };
}

export async function getOrderRecord(recordId: string): Promise<OrderRecord> {
  const record = await getRecord(ORDERS_TABLE, recordId, "Order");
  const fields = record.fields ?? {};

  return {
    recordId: record.id,
    clientId: readFirstLinkedId(fields.Client),
    amountDue: readNumber(fields["Amount Due"]),
    currency: readString(fields.Currency),
    billingStatus: readString(fields["Billing Status"]),
  };
}

export async function getInvoiceRecord(recordId: string): Promise<InvoiceRecord> {
  const record = await getRecord(INVOICES_TABLE, recordId, "Invoice");
  const fields = record.fields ?? {};

  return {
    recordId: record.id,
    orderId: readFirstLinkedId(fields.Order),
    status: readString(fields.Status),
    amountDue: readNumber(fields["Amount Due"]),
    amountPaid: readNumber(fields["Amount Paid"]),
    issuedAt: readString(fields["Issued At"]),
    dueAt: readString(fields["Due At"]),
    paidAt: readString(fields["Paid At"]),
  };
}

export async function getOrgIntegrationRecord(recordId: string): Promise<OrgIntegrationRecord> {
  const record = await getRecord(ORG_INTEGRATIONS_TABLE, recordId, "Org Integration");
  const fields = record.fields ?? {};

  return {
    recordId: record.id,
    provider: readString(fields.Provider),
    providerAccountId: readFirstLinkedId(fields["Provider Account"]),
    accessToken: readString(fields["Access Token"]),
    externalLocationId: readString(fields["External Location ID"]),
  };
}

export async function findClientExternalByContext(
  clientId: string,
  providerAccountId: string,
): Promise<ClientExternalRecord | null> {
  const escapedClientId = escapeAirtableFormulaString(clientId);
  const escapedProviderAccountId = escapeAirtableFormulaString(providerAccountId);
  const formula = `AND(FIND('${escapedClientId}', ARRAYJOIN({Client})), FIND('${escapedProviderAccountId}', ARRAYJOIN({Provider Account})))`;
  const params = new URLSearchParams({
    maxRecords: "5",
    filterByFormula: formula,
  });

  const response = await airtableRequest(
    `${encodeURIComponent(CLIENT_EXTERNALS_TABLE)}?${params.toString()}`,
    { method: "GET" },
  );

  if (!response.ok) {
    const message = await parseAirtableError(response);
    throw new SyncEndpointError(`Failed to resolve Client External: ${message}`, 502);
  }

  const body = (await response.json()) as { records?: AirtableRecord[] };
  const record = body.records?.[0];
  if (!record) return null;
  const fields = record.fields ?? {};

  return {
    recordId: record.id,
    providerAccountId: readFirstLinkedId(fields["Provider Account"]),
    externalCustomerId: readString(fields["External Customer ID"]),
    activeCardCount: readNumber(fields["Active Card Count"]),
  };
}

export async function getClientExternalById(
  clientExternalRecordId: string,
): Promise<ClientExternalRecord> {
  const record = await getRecord(CLIENT_EXTERNALS_TABLE, clientExternalRecordId, "Client External");
  const fields = record.fields ?? {};

  return {
    recordId: record.id,
    providerAccountId: readFirstLinkedId(fields["Provider Account"]),
    externalCustomerId: readString(fields["External Customer ID"]),
    activeCardCount: readNumber(fields["Active Card Count"]),
  };
}

export async function findActiveCardExternalsByClientExternal(
  clientExternalRecordId: string,
): Promise<CardExternalRecord[]> {
  const rows: CardExternalRecord[] = [];

  // Preferred path: trust direct link graph Client Externals -> Card Externals.
  const clientExternal = await getRecord(
    CLIENT_EXTERNALS_TABLE,
    clientExternalRecordId,
    "Client External",
  );
  const linkedCardExternalIds = readLinkedIds((clientExternal.fields ?? {})["Card Externals"]);

  if (linkedCardExternalIds.length > 0) {
    for (const cardExternalId of linkedCardExternalIds) {
      const record = await getRecord(CARD_EXTERNALS_TABLE, cardExternalId, "Card External");
      const fields = record.fields ?? {};
      if (!isEnabled(fields.Enabled)) continue;
      rows.push({
        recordId: record.id,
        externalCardId: readString(fields["External Card ID"]),
        modifiedAt: readString(fields["Modified At"]),
      });
    }
  } else {
    // Fallback path for legacy rows where reverse links are missing.
    const escapedClientExternalId = escapeAirtableFormulaString(clientExternalRecordId);
    const formula = `FIND('${escapedClientExternalId}', ARRAYJOIN({Client External}))`;
    let offset: string | undefined;

    do {
      const params = new URLSearchParams({
        pageSize: "100",
        filterByFormula: formula,
      });
      if (offset) params.set("offset", offset);

      const response = await airtableRequest(
        `${encodeURIComponent(CARD_EXTERNALS_TABLE)}?${params.toString()}`,
        { method: "GET" },
      );
      if (!response.ok) {
        const message = await parseAirtableError(response);
        throw new SyncEndpointError(`Failed to resolve Card Externals: ${message}`, 502);
      }

      const body = (await response.json()) as {
        records?: AirtableRecord[];
        offset?: string;
      };

      for (const record of body.records ?? []) {
        const fields = record.fields ?? {};
        if (!isEnabled(fields.Enabled)) continue;
        rows.push({
          recordId: record.id,
          externalCardId: readString(fields["External Card ID"]),
          modifiedAt: readString(fields["Modified At"]),
        });
      }

      offset = body.offset;
    } while (offset);
  }

  rows.sort((a, b) => {
    const aTs = Date.parse(a.modifiedAt ?? "");
    const bTs = Date.parse(b.modifiedAt ?? "");
    const aValid = Number.isFinite(aTs) ? aTs : -1;
    const bValid = Number.isFinite(bTs) ? bTs : -1;
    if (bValid !== aValid) return bValid - aValid;
    return b.recordId.localeCompare(a.recordId);
  });

  return rows;
}

export async function listOrderItems(orderRecordId: string): Promise<OrderItem[]> {
  const escapedOrderId = escapeAirtableFormulaString(orderRecordId);

  async function queryByLinkField(linkField: string): Promise<OrderItem[] | null> {
    const formula = `FIND('${escapedOrderId}', ARRAYJOIN({${linkField}}))`;
    let offset: string | undefined;
    const rows: OrderItem[] = [];

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
        if (/Unknown field name/i.test(message) || /Unknown field names/i.test(message)) {
          return null;
        }
        throw new SyncEndpointError(`Failed to load Order Items: ${message}`, 502);
      }

      const body = (await response.json()) as {
        records?: AirtableRecord[];
        offset?: string;
      };

      for (const record of body.records ?? []) {
        const fields = record.fields ?? {};
        rows.push({
          recordId: record.id,
          description: readString(fields["Offering Description"]),
          netAmount: readNumber(fields["Net Amount"]),
        });
      }

      offset = body.offset;
    } while (offset);

    return rows;
  }

  for (const fieldName of ["Order", "Orders", "Parent Order"]) {
    const rows = await queryByLinkField(fieldName);
    if (rows && rows.length > 0) return rows;
  }

  // Final fallback: scan rows and match any linked-record array containing this order record ID.
  // This protects us from unusual link field names while keeping behavior deterministic.
  let offset: string | undefined;
  const scannedRows: OrderItem[] = [];
  do {
    const params = new URLSearchParams({
      pageSize: "100",
    });
    if (offset) params.set("offset", offset);

    const response = await airtableRequest(
      `${encodeURIComponent(ORDER_ITEMS_TABLE)}?${params.toString()}`,
      { method: "GET" },
    );
    if (!response.ok) {
      const message = await parseAirtableError(response);
      throw new SyncEndpointError(`Failed to load Order Items: ${message}`, 502);
    }

    const body = (await response.json()) as {
      records?: AirtableRecord[];
      offset?: string;
    };

    for (const record of body.records ?? []) {
      const fields = record.fields ?? {};
      const linksToOrder = Object.values(fields).some(
        (value) =>
          Array.isArray(value) &&
          value.some((item) => typeof item === "string" && item.trim() === orderRecordId),
      );
      if (!linksToOrder) continue;

      scannedRows.push({
        recordId: record.id,
        description: readString(fields["Offering Description"]),
        netAmount: readNumber(fields["Net Amount"]),
      });
    }

    offset = body.offset;
  } while (offset);

  if (scannedRows.length > 0) return scannedRows;

  return [];
}

function toInvoiceExternalRecord(record: AirtableRecord): InvoiceExternalRecord {
  const fields = record.fields ?? {};
  return {
    recordId: record.id,
    invoiceId: readFirstLinkedId(fields.Invoice),
    orderId: readFirstLinkedId(fields.Order),
    orgIntegrationId: readFirstLinkedId(fields["Org Integration"]),
    externalInvoiceId: readString(fields["External Invoice ID"]),
    externalStatus: readString(fields["External Status"]),
    amountDue: readNumber(fields["Amount Due"]),
    amountPaid: readNumber(fields["Amount Paid"]),
    issuedAt: readString(fields["Issued At"]),
    dueAt: readString(fields["Due At"]),
    paidAt: readString(fields["Paid At"]),
    hostedInvoiceUrl: readString(fields["Hosted Invoice URL"]),
    lastSyncedAt: readString(fields["Last Synced At"]),
    webhookReceivedAt: readString(fields["Webhook Received At"]),
    rawPayload: readString(fields["Raw Payload"]),
    syncStatus: readString(fields["Sync Status"]),
    syncError: readString(fields["Sync Error"]),
  };
}

export async function findInvoiceExternalByInvoiceAndOrgIntegration(
  invoiceRecordId: string,
  orgIntegrationRecordId: string,
): Promise<InvoiceExternalRecord | null> {
  const escapedInvoiceId = escapeAirtableFormulaString(invoiceRecordId);
  const escapedOrgIntegrationId = escapeAirtableFormulaString(orgIntegrationRecordId);
  const formula = `AND(FIND('${escapedInvoiceId}', ARRAYJOIN({Invoice})), FIND('${escapedOrgIntegrationId}', ARRAYJOIN({Org Integration})))`;
  const params = new URLSearchParams({
    maxRecords: "2",
    filterByFormula: formula,
  });

  const response = await airtableRequest(
    `${encodeURIComponent(INVOICE_EXTERNALS_TABLE)}?${params.toString()}`,
    { method: "GET" },
  );

  if (!response.ok) {
    const message = await parseAirtableError(response);
    throw new SyncEndpointError(`Failed to resolve Invoice External: ${message}`, 502);
  }

  const body = (await response.json()) as { records?: AirtableRecord[] };
  const records = body.records ?? [];
  if (records.length === 0) return null;
  if (records.length > 1) {
    throw new SyncEndpointError(
      "Multiple Invoice External rows found for the same Invoice and Org Integration.",
      409,
    );
  }

  return toInvoiceExternalRecord(records[0]);
}

type InvoiceExternalWriteFields = {
  Invoice?: string[];
  Order?: string[];
  "Org Integration"?: string[];
  "External Invoice ID"?: string;
  "External Status"?: string;
  "Amount Due"?: number;
  "Amount Paid"?: number;
  "Issued At"?: string;
  "Due At"?: string;
  "Paid At"?: string;
  "Hosted Invoice URL"?: string;
  "Last Synced At"?: string;
  "Webhook Received At"?: string;
  "Raw Payload"?: string;
  "Sync Status"?: "Synced" | "Failed";
  "Sync Error"?: string;
};

function isUnknownOptionalFieldError(message: string, key: string): boolean {
  return (
    message.includes(`Unknown field name: "${key}"`) ||
    message.includes(`Unknown field names: ${key}`)
  );
}

export async function createInvoiceExternal(
  fields: InvoiceExternalWriteFields,
): Promise<InvoiceExternalRecord> {
  const optionalFields = new Set(["Hosted Invoice URL", "Webhook Received At", "Raw Payload"]);
  let fieldsToWrite: InvoiceExternalWriteFields = { ...fields };

  while (true) {
    const response = await airtableRequest(`${encodeURIComponent(INVOICE_EXTERNALS_TABLE)}`, {
      method: "POST",
      body: JSON.stringify({ fields: fieldsToWrite }),
    });

    if (response.ok) {
      return toInvoiceExternalRecord((await response.json()) as AirtableRecord);
    }

    const message = await parseAirtableError(response);
    const optionalFieldToDrop = [...optionalFields].find(
      (key) => key in fieldsToWrite && isUnknownOptionalFieldError(message, key),
    );

    if (optionalFieldToDrop) {
      const nextFields: InvoiceExternalWriteFields = {};
      for (const [key, value] of Object.entries(fieldsToWrite)) {
        if (key === optionalFieldToDrop) continue;
        (nextFields as Record<string, unknown>)[key] = value;
      }
      fieldsToWrite = nextFields;
      continue;
    }

    throw new SyncEndpointError(`Failed to create Invoice External: ${message}`, 502);
  }
}

export async function updateInvoiceExternal(
  invoiceExternalRecordId: string,
  fields: InvoiceExternalWriteFields,
): Promise<void> {
  const optionalFields = new Set(["Hosted Invoice URL", "Webhook Received At", "Raw Payload"]);
  let fieldsToWrite: InvoiceExternalWriteFields = { ...fields };

  while (true) {
    const response = await airtableRequest(
      `${encodeURIComponent(INVOICE_EXTERNALS_TABLE)}/${encodeURIComponent(invoiceExternalRecordId)}`,
      {
        method: "PATCH",
        body: JSON.stringify({ fields: fieldsToWrite }),
      },
    );

    if (response.ok) return;

    const message = await parseAirtableError(response);
    const optionalFieldToDrop = [...optionalFields].find(
      (key) => key in fieldsToWrite && isUnknownOptionalFieldError(message, key),
    );

    if (optionalFieldToDrop) {
      const nextFields: InvoiceExternalWriteFields = {};
      for (const [key, value] of Object.entries(fieldsToWrite)) {
        if (key === optionalFieldToDrop) continue;
        (nextFields as Record<string, unknown>)[key] = value;
      }
      fieldsToWrite = nextFields;
      continue;
    }

    throw new SyncEndpointError(`Failed to update Invoice External: ${message}`, 502);
  }
}

export async function writeInvoiceExternalFailure(
  invoiceExternalRecordId: string,
  errorMessage: string,
  rawPayload?: string,
): Promise<void> {
  await updateInvoiceExternal(invoiceExternalRecordId, {
    "Sync Status": "Failed",
    "Sync Error": errorMessage,
    "Last Synced At": new Date().toISOString(),
    ...(rawPayload ? { "Raw Payload": rawPayload } : {}),
  });
}

type OrderExternalWritebackFields = {
  "Sync Status"?: "Synced" | "Failed";
  "Sync Error"?: string;
  "Last Synced At"?: string;
  "External Action"?: BillingAction;
  "External Payment ID"?: string;
  "External Order ID"?: string;
  "External Invoice ID"?: string;
  "External Invoice URL"?: string;
  "Customer ID Snapshot"?: string;
  "Card ID Snapshot"?: string;
  "Amount Snapshot"?: number;
  "Raw Payload"?: string;
};

export async function updateOrderExternal(
  orderExternalRecordId: string,
  fields: OrderExternalWritebackFields,
): Promise<void> {
  const path = `${encodeURIComponent(ORDER_EXTERNALS_TABLE)}/${encodeURIComponent(orderExternalRecordId)}`;
  const optionalFields = new Set(["Raw Payload", "External Invoice URL"]);
  let fieldsToWrite: OrderExternalWritebackFields = { ...fields };

  while (true) {
    const response = await airtableRequest(path, {
      method: "PATCH",
      body: JSON.stringify({ fields: fieldsToWrite }),
    });
    if (response.ok) return;

    const message = await parseAirtableError(response);
    const missingFieldMatch = message.match(/Unknown field name: "([^"]+)"/);
    const missingField = missingFieldMatch?.[1];

    // Backward-compatible behavior: if optional fields aren't present in this base, retry without them.
    if (missingField && optionalFields.has(missingField) && missingField in fieldsToWrite) {
      const nextFields: OrderExternalWritebackFields = {};
      for (const [key, value] of Object.entries(fieldsToWrite)) {
        if (key === missingField) continue;
        (nextFields as Record<string, unknown>)[key] = value;
      }
      fieldsToWrite = nextFields;
      continue;
    }

    throw new SyncEndpointError(`Failed to update Order External: ${message}`, 502);
  }
}

export async function updateOrderBillingStatus(
  orderRecordId: string,
  billingStatus: "Processing" | "Paid" | "Payment Pending" | "Failed",
): Promise<void> {
  const response = await airtableRequest(
    `${encodeURIComponent(ORDERS_TABLE)}/${encodeURIComponent(orderRecordId)}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        fields: {
          "Billing Status": billingStatus,
        },
      }),
    },
  );

  if (!response.ok) {
    const message = await parseAirtableError(response);
    throw new SyncEndpointError(`Failed to update Order billing status: ${message}`, 502);
  }
}

export async function writeOrderExternalFailure(
  orderExternalRecordId: string,
  action: BillingAction,
  errorMessage: string,
  rawPayload?: string,
): Promise<void> {
  await updateOrderExternal(orderExternalRecordId, {
    "Sync Status": "Failed",
    "Sync Error": errorMessage,
    "Last Synced At": new Date().toISOString(),
    "External Action": action,
    ...(rawPayload ? { "Raw Payload": rawPayload } : {}),
  });
}
