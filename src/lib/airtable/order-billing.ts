import { SyncEndpointError } from "@/lib/errors";
import type { BillingAction } from "@/lib/types/billing";

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
  amountSnapshot: number | null;
  externalPaymentId: string | null;
  externalOrderId: string | null;
  externalInvoiceId: string | null;
  externalInvoiceUrl: string | null;
};

export type OrderRecord = {
  recordId: string;
  clientId: string | null;
  amountDue: number | null;
  amountPaid: number | null;
  currency: string | null;
  billingStatus: string | null;
};

export type InvoiceRecord = {
  recordId: string;
  orderId: string | null;
  status: string | null;
  deliveryMethod: string | null;
  saveCard: boolean | null;
  paymentLink: string | null;
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
  externalOrderId: string | null;
  externalStatus: string | null;
  amountDue: number | null;
  amountPaid: number | null;
  amountRefunded: number | null;
  issuedAt: string | null;
  dueAt: string | null;
  paidAt: string | null;
  voidedAt: string | null;
  hostedInvoiceUrl: string | null;
  lastSyncedAt: string | null;
  lastSyncActivityAt: string | null;
  webhookReceivedAt: string | null;
  lastWebhookEventType: string | null;
  lastWebhookEventId: string | null;
  externalProcessRawPayload: string | null;
  webhookRawPayload: string | null;
  deliveryMethod: string | null;
  saveCard: boolean | null;
  phoneSnapshot: string | null;
  sentAt: string | null;
  lastSendError: string | null;
  sendAttemptCount: number | null;
  externalProcessStatus: string | null;
  externalProcessAction: string | null;
  externalProcessAt: string | null;
  externalProcessError: string | null;
  externalActionIdempotencyKey: string | null;
  writebackStatus: string | null;
  writebackAt: string | null;
  writebackError: string | null;
  writebackRetryCount: number | null;
  writebackLastAttemptAt: string | null;
  reconciliationStatus: string | null;
  lastApiResponseCode: number | null;
  lastApiMessage: string | null;
  internalNotes: string | null;
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

function readOrderItemDescription(fields: Record<string, unknown>): string | null {
  return (
    readString(fields["Offering Description"]) ??
    readString(fields["Offering Name"]) ??
    readString(fields.Description) ??
    readString(fields.Name) ??
    readString(fields.Title)
  );
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
    amountSnapshot: readNumber(fields["Amount Snapshot"]),
    externalPaymentId: readString(fields["External Payment ID"]),
    externalOrderId: readString(fields["External Order ID"]),
    externalInvoiceId: readString(fields["External Invoice ID"]),
    externalInvoiceUrl: readString(fields["External Invoice URL"]),
  };
}

export async function listOrderExternalsByOrder(
  orderRecordId: string,
): Promise<OrderExternalRecord[]> {
  const escapedOrderId = escapeAirtableFormulaString(orderRecordId);
  const formula = `FIND('${escapedOrderId}', ARRAYJOIN({Order}))`;

  let offset: string | undefined;
  const rows: OrderExternalRecord[] = [];
  do {
    const params = new URLSearchParams({ pageSize: "100", filterByFormula: formula });
    if (offset) params.set("offset", offset);

    const response = await airtableRequest(
      `${encodeURIComponent(ORDER_EXTERNALS_TABLE)}?${params.toString()}`,
      { method: "GET" },
    );
    if (!response.ok) {
      const message = await parseAirtableError(response);
      throw new SyncEndpointError(`Failed to list Order Externals by Order: ${message}`, 502);
    }

    const body = (await response.json()) as { records?: AirtableRecord[]; offset?: string };
    for (const record of body.records ?? []) {
      const fields = record.fields ?? {};
      rows.push({
        recordId: record.id,
        orderId: readFirstLinkedId(fields.Order),
        invoiceId: readFirstLinkedId(fields.Invoice),
        clientExternalId: readFirstLinkedId(fields["Client External"]),
        externalAction: readString(fields["External Action"]),
        syncStatus: readString(fields["Sync Status"]),
        amountSnapshot: readNumber(fields["Amount Snapshot"]),
        externalPaymentId: readString(fields["External Payment ID"]),
        externalOrderId: readString(fields["External Order ID"]),
        externalInvoiceId: readString(fields["External Invoice ID"]),
        externalInvoiceUrl: readString(fields["External Invoice URL"]),
      });
    }

    offset = body.offset;
  } while (offset);

  return rows;
}

export async function getOrderRecord(recordId: string): Promise<OrderRecord> {
  const record = await getRecord(ORDERS_TABLE, recordId, "Order");
  const fields = record.fields ?? {};

  return {
    recordId: record.id,
    clientId: readFirstLinkedId(fields.Client),
    amountDue: readNumber(fields["Amount Due"]),
    amountPaid: readNumber(fields["Amount Paid"]),
    currency: readString(fields.Currency),
    billingStatus: readString(fields["Billing Status"]),
  };
}

export async function getInvoiceRecord(recordId: string): Promise<InvoiceRecord> {
  const record = await getRecord(INVOICES_TABLE, recordId, "Invoice");
  return toInvoiceRecord(record);
}

function toInvoiceRecord(record: AirtableRecord): InvoiceRecord {
  const fields = record.fields ?? {};
  return {
    recordId: record.id,
    orderId: readFirstLinkedId(fields.Order),
    status: readString(fields.Status),
    deliveryMethod: readString(fields["Delivery Method"]),
    saveCard: readBoolean(fields["Save Card"]) ?? readBoolean(fields["Save Card on File"]),
    paymentLink: readString(fields["Payment Link"]),
    amountDue: readNumber(fields["Amount Due"]),
    amountPaid: readNumber(fields["Amount Paid"]),
    issuedAt: readString(fields["Issued At"]),
    dueAt: readString(fields["Due At"]),
    paidAt: readString(fields["Paid At"]),
  };
}

export async function findSingleInvoiceByOrder(
  orderRecordId: string,
): Promise<InvoiceRecord | null> {
  const escapedOrderId = escapeAirtableFormulaString(orderRecordId);

  async function queryByLinkField(linkField: string): Promise<InvoiceRecord[] | null> {
    const formula = `FIND('${escapedOrderId}', ARRAYJOIN({${linkField}}))`;
    const params = new URLSearchParams({
      pageSize: "5",
      filterByFormula: formula,
    });

    const response = await airtableRequest(
      `${encodeURIComponent(INVOICES_TABLE)}?${params.toString()}`,
      { method: "GET" },
    );
    if (!response.ok) {
      const message = await parseAirtableError(response);
      if (/Unknown field name/i.test(message) || /Unknown field names/i.test(message)) {
        return null;
      }
      throw new SyncEndpointError(`Failed to resolve Invoice by Order: ${message}`, 502);
    }

    const body = (await response.json()) as { records?: AirtableRecord[] };
    return (body.records ?? []).map((record) => toInvoiceRecord(record));
  }

  for (const fieldName of ["Order", "Orders", "Parent Order"]) {
    const matches = await queryByLinkField(fieldName);
    if (!matches || matches.length === 0) continue;
    if (matches.length > 1) {
      throw new SyncEndpointError(
        "Multiple Invoices are linked to this Order. Provide invoiceRecordId explicitly.",
        409,
      );
    }
    return matches[0];
  }

  // Final fallback for unusual link field names: scan and match any linked-record array.
  const response = await airtableRequest(
    `${encodeURIComponent(INVOICES_TABLE)}?${new URLSearchParams({ pageSize: "100" }).toString()}`,
    { method: "GET" },
  );
  if (!response.ok) {
    const message = await parseAirtableError(response);
    throw new SyncEndpointError(`Failed to resolve Invoice by Order: ${message}`, 502);
  }

  const body = (await response.json()) as { records?: AirtableRecord[] };
  const matches: InvoiceRecord[] = [];
  for (const record of body.records ?? []) {
    const fields = record.fields ?? {};
    const linksToOrder = Object.values(fields).some(
      (value) =>
        Array.isArray(value) &&
        value.some((item) => typeof item === "string" && item.trim() === orderRecordId),
    );
    if (!linksToOrder) continue;
    matches.push(toInvoiceRecord(record));
  }

  if (matches.length === 0) return null;
  if (matches.length > 1) {
    throw new SyncEndpointError(
      "Multiple Invoices are linked to this Order. Provide invoiceRecordId explicitly.",
      409,
    );
  }

  return matches[0];
}

export async function listInvoicesByOrder(orderRecordId: string): Promise<InvoiceRecord[]> {
  const escapedOrderId = escapeAirtableFormulaString(orderRecordId);

  async function queryByLinkField(linkField: string): Promise<InvoiceRecord[] | null> {
    const formula = `FIND('${escapedOrderId}', ARRAYJOIN({${linkField}}))`;
    let offset: string | undefined;
    const rows: InvoiceRecord[] = [];

    do {
      const params = new URLSearchParams({
        pageSize: "100",
        filterByFormula: formula,
      });
      if (offset) params.set("offset", offset);

      const response = await airtableRequest(
        `${encodeURIComponent(INVOICES_TABLE)}?${params.toString()}`,
        { method: "GET" },
      );
      if (!response.ok) {
        const message = await parseAirtableError(response);
        if (/Unknown field name/i.test(message) || /Unknown field names/i.test(message)) {
          return null;
        }
        throw new SyncEndpointError(`Failed to list Invoices by Order: ${message}`, 502);
      }

      const body = (await response.json()) as {
        records?: AirtableRecord[];
        offset?: string;
      };
      for (const record of body.records ?? []) rows.push(toInvoiceRecord(record));
      offset = body.offset;
    } while (offset);

    return rows;
  }

  for (const fieldName of ["Order", "Orders", "Parent Order"]) {
    const rows = await queryByLinkField(fieldName);
    if (rows && rows.length > 0) return rows;
  }

  let offset: string | undefined;
  const scannedRows: InvoiceRecord[] = [];
  do {
    const params = new URLSearchParams({ pageSize: "100" });
    if (offset) params.set("offset", offset);

    const response = await airtableRequest(
      `${encodeURIComponent(INVOICES_TABLE)}?${params.toString()}`,
      { method: "GET" },
    );
    if (!response.ok) {
      const message = await parseAirtableError(response);
      throw new SyncEndpointError(`Failed to list Invoices by Order: ${message}`, 502);
    }

    const body = (await response.json()) as { records?: AirtableRecord[]; offset?: string };
    for (const record of body.records ?? []) {
      const fields = record.fields ?? {};
      const linksToOrder = Object.values(fields).some(
        (value) =>
          Array.isArray(value) &&
          value.some((item) => typeof item === "string" && item.trim() === orderRecordId),
      );
      if (!linksToOrder) continue;
      scannedRows.push(toInvoiceRecord(record));
    }

    offset = body.offset;
  } while (offset);

  return scannedRows;
}

type InvoiceCreateFields = {
  Order?: string[];
  Status?: string;
  "Amount Due"?: number;
  "Amount Paid"?: number;
  "Issued At"?: string;
  "Due At"?: string;
};

export async function createInvoiceForOrder(fields: InvoiceCreateFields): Promise<InvoiceRecord> {
  const optionalFields = new Set(["Status", "Amount Due", "Amount Paid", "Issued At", "Due At"]);
  let fieldsToWrite: InvoiceCreateFields = { ...fields };

  while (true) {
    const response = await airtableRequest(`${encodeURIComponent(INVOICES_TABLE)}`, {
      method: "POST",
      body: JSON.stringify({ fields: fieldsToWrite }),
    });
    if (response.ok) {
      return toInvoiceRecord((await response.json()) as AirtableRecord);
    }

    const message = await parseAirtableError(response);
    const missingFieldMatch = message.match(/Unknown field name: "([^"]+)"/);
    const missingField = missingFieldMatch?.[1];

    if (missingField && optionalFields.has(missingField) && missingField in fieldsToWrite) {
      const nextFields: InvoiceCreateFields = {};
      for (const [key, value] of Object.entries(fieldsToWrite)) {
        if (key === missingField) continue;
        (nextFields as Record<string, unknown>)[key] = value;
      }
      fieldsToWrite = nextFields;
      continue;
    }

    throw new SyncEndpointError(`Failed to create Invoice: ${message}`, 502);
  }
}

export async function linkOrderExternalToInvoice(
  orderExternalRecordId: string,
  invoiceRecordId: string,
): Promise<void> {
  const response = await airtableRequest(
    `${encodeURIComponent(ORDER_EXTERNALS_TABLE)}/${encodeURIComponent(orderExternalRecordId)}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        fields: {
          Invoice: [invoiceRecordId],
        },
      }),
    },
  );

  if (!response.ok) {
    const message = await parseAirtableError(response);
    throw new SyncEndpointError(`Failed to link Order External to Invoice: ${message}`, 502);
  }
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
          description: readOrderItemDescription(fields),
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
        description: readOrderItemDescription(fields),
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
  const externalProcessRawPayload = readString(fields["External Process Raw Payload"]);
  const webhookRawPayload = readString(fields["Webhook Raw Payload"]);
  return {
    recordId: record.id,
    invoiceId: readFirstLinkedId(fields.Invoice),
    orderId: readFirstLinkedId(fields.Order),
    orgIntegrationId: readFirstLinkedId(fields["Org Integration"]),
    externalInvoiceId: readString(fields["External Invoice ID"]),
    externalOrderId: readString(fields["External Order ID"]),
    externalStatus: readString(fields["External Status"]),
    amountDue: readNumber(fields["Amount Due"]),
    amountPaid: readNumber(fields["Amount Paid"]),
    amountRefunded: readNumber(fields["Amount Refunded"]),
    issuedAt: readString(fields["Issued At"]),
    dueAt: readString(fields["Due At"]),
    paidAt: readString(fields["Paid At"]),
    voidedAt: readString(fields["Voided At"]),
    hostedInvoiceUrl: readString(fields["Hosted Invoice URL"]),
    lastSyncedAt: readString(fields["Last Synced At"]),
    lastSyncActivityAt: readString(fields["Last Sync Activity At"]),
    webhookReceivedAt: readString(fields["Webhook Received At"]),
    lastWebhookEventType: readString(fields["Last Webhook Event Type"]),
    lastWebhookEventId: readString(fields["Last Webhook Event ID"]),
    externalProcessRawPayload,
    webhookRawPayload,
    deliveryMethod: readString(fields["Delivery Method"]),
    saveCard: readBoolean(fields["Save Card"]) ?? readBoolean(fields["Save Card on File"]),
    phoneSnapshot: readString(fields["Phone Snapshot"]),
    sentAt: readString(fields["Sent At"]),
    lastSendError: readString(fields["Last Send Error"]),
    sendAttemptCount: readNumber(fields["Send Attempt Count"]),
    externalProcessStatus: readString(fields["External Process Status"]),
    externalProcessAction: readString(fields["External Process Action"]),
    externalProcessAt: readString(fields["External Process At"]),
    externalProcessError: readString(fields["External Process Error"]),
    externalActionIdempotencyKey: readString(fields["External Action Idempotency Key"]),
    writebackStatus: readString(fields["Writeback Status"]),
    writebackAt: readString(fields["Writeback At"]),
    writebackError: readString(fields["Writeback Error"]),
    writebackRetryCount: readNumber(fields["Writeback Retry Count"]),
    writebackLastAttemptAt: readString(fields["Writeback Last Attempt At"]),
    reconciliationStatus: readString(fields["Reconciliation Status"]),
    lastApiResponseCode: readNumber(fields["Last API Response Code"]),
    lastApiMessage: readString(fields["Last API Message"]),
    internalNotes: readString(fields["Internal Notes"]),
    rawPayload: externalProcessRawPayload ?? webhookRawPayload ?? readString(fields["Raw Payload"]),
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

export async function getInvoiceExternalById(
  invoiceExternalRecordId: string,
): Promise<InvoiceExternalRecord> {
  const record = await getRecord(
    INVOICE_EXTERNALS_TABLE,
    invoiceExternalRecordId,
    "Invoice External",
  );
  return toInvoiceExternalRecord(record);
}

type InvoiceExternalWriteFields = {
  Invoice?: string[];
  Order?: string[];
  "Org Integration"?: string[];
  "External Invoice ID"?: string;
  "External Order ID"?: string;
  "External Status"?: string;
  "Amount Due"?: number;
  "Amount Paid"?: number;
  "Amount Refunded"?: number;
  "Issued At"?: string;
  "Due At"?: string;
  "Paid At"?: string;
  "Voided At"?: string;
  "Hosted Invoice URL"?: string;
  "External Process Action"?: "Create Invoice" | "Send Invoice" | "Cancel Invoice" | "Mark Paid" | "Sync";
  "External Process Status"?: "Not Started" | "Pending" | "Succeeded" | "Failed";
  "External Process At"?: string;
  "External Process Error"?: string;
  "External Action Idempotency Key"?: string;
  "External Process Raw Payload"?: string;
  "Writeback Status"?: "Not Started" | "Pending" | "Succeeded" | "Failed";
  "Writeback At"?: string;
  "Writeback Error"?: string;
  "Writeback Retry Count"?: number;
  "Writeback Last Attempt At"?: string;
  "Reconciliation Status"?:
    | "Not Started"
    | "In Progress"
    | "Complete"
    | "External Failed"
    | "Writeback Failed"
    | "Writeback Failed After External Success"
    | "Needs Review";
  "Last Synced At"?: string;
  "Last Sync Activity At"?: string;
  "Webhook Received At"?: string;
  "Last Webhook Event Type"?: string;
  "Last Webhook Event ID"?: string;
  "Webhook Raw Payload"?: string;
  "Delivery Method"?: "Email" | "Sms" | "Link" | "URL";
  "Save Card"?: boolean;
  "Save Card on File"?: boolean;
  "Phone Snapshot"?: string;
  "Sent At"?: string;
  "Last Send Error"?: string;
  "Send Attempt Count"?: number;
  "Last API Response Code"?: number;
  "Last API Message"?: string;
  "Internal Notes"?: string;
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
  const optionalFields = new Set([
    "Hosted Invoice URL",
    "Voided At",
    "Webhook Received At",
    "Last Webhook Event Type",
    "Last Webhook Event ID",
    "Webhook Raw Payload",
    "Delivery Method",
    "Save Card",
    "Save Card on File",
    "Phone Snapshot",
    "Sent At",
    "Last Send Error",
    "Send Attempt Count",
    "Internal Notes",
    "Raw Payload",
    "Sync Status",
    "Sync Error",
  ]);
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
  const optionalFields = new Set([
    "Hosted Invoice URL",
    "Voided At",
    "Webhook Received At",
    "Last Webhook Event Type",
    "Last Webhook Event ID",
    "Webhook Raw Payload",
    "Delivery Method",
    "Save Card",
    "Save Card on File",
    "Phone Snapshot",
    "Sent At",
    "Last Send Error",
    "Send Attempt Count",
    "Internal Notes",
    "Raw Payload",
    "Sync Status",
    "Sync Error",
  ]);
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
    "External Process Status": "Failed",
    "External Process At": new Date().toISOString(),
    "External Process Error": errorMessage,
    "Writeback Status": "Failed",
    "Writeback At": new Date().toISOString(),
    "Writeback Error": errorMessage,
    "Writeback Last Attempt At": new Date().toISOString(),
    "Reconciliation Status": "Needs Review",
    "Last Synced At": new Date().toISOString(),
    "Last Sync Activity At": new Date().toISOString(),
    "Last API Message": errorMessage,
    ...(rawPayload ? { "External Process Raw Payload": rawPayload } : {}),
    ...(rawPayload ? { "Raw Payload": rawPayload } : {}),
  });
}

export async function listOrderExternalsByInvoice(
  invoiceRecordId: string,
): Promise<OrderExternalRecord[]> {
  const escapedInvoiceId = escapeAirtableFormulaString(invoiceRecordId);
  const formula = `FIND('${escapedInvoiceId}', ARRAYJOIN({Invoice}))`;

  let offset: string | undefined;
  const rows: OrderExternalRecord[] = [];
  do {
    const params = new URLSearchParams({ pageSize: "100", filterByFormula: formula });
    if (offset) params.set("offset", offset);

    const response = await airtableRequest(
      `${encodeURIComponent(ORDER_EXTERNALS_TABLE)}?${params.toString()}`,
      { method: "GET" },
    );
    if (!response.ok) {
      const message = await parseAirtableError(response);
      throw new SyncEndpointError(`Failed to list Order Externals by Invoice: ${message}`, 502);
    }

    const body = (await response.json()) as { records?: AirtableRecord[]; offset?: string };
    for (const record of body.records ?? []) {
      const fields = record.fields ?? {};
      rows.push({
        recordId: record.id,
        orderId: readFirstLinkedId(fields.Order),
        invoiceId: readFirstLinkedId(fields.Invoice),
        clientExternalId: readFirstLinkedId(fields["Client External"]),
        externalAction: readString(fields["External Action"]),
        syncStatus: readString(fields["Sync Status"]),
        amountSnapshot: readNumber(fields["Amount Snapshot"]),
        externalPaymentId: readString(fields["External Payment ID"]),
        externalOrderId: readString(fields["External Order ID"]),
        externalInvoiceId: readString(fields["External Invoice ID"]),
        externalInvoiceUrl: readString(fields["External Invoice URL"]),
      });
    }
    offset = body.offset;
  } while (offset);

  return rows;
}

type OrderExternalWritebackFields = {
  "Sync Status"?: "Synced" | "Failed";
  "Sync Error"?: string;
  "Last Synced At"?: string;
  "External Action"?: BillingAction;
  "External Process Status"?: "Not Started" | "Pending" | "Succeeded" | "Failed";
  "External Process At"?: string;
  "External Process Error"?: string;
  "External Process Action"?: string;
  "External Action Idempotency Key"?: string;
  "External Process Raw Payload"?: string;
  "Writeback Status"?: "Not Started" | "Pending" | "Succeeded" | "Failed";
  "Writeback At"?: string;
  "Writeback Error"?: string;
  "Writeback Retry Count"?: number;
  "Writeback Last Attempt At"?: string;
  "Reconciliation Status"?:
    | "Not Started"
    | "In Progress"
    | "Complete"
    | "External Failed"
    | "Writeback Failed"
    | "Writeback Failed After External Success"
    | "Needs Review";
  "Last Sync Activity At"?: string;
  "Last API Response Code"?: number;
  "Last API Message"?: string;
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
  const optionalFields = new Set([
    "Sync Status",
    "Sync Error",
    "Last Synced At",
    "External Action",
    "Raw Payload",
    "External Invoice URL",
    "Customer ID Snapshot",
    "Card ID Snapshot",
    "Amount Snapshot",
    "External Process Status",
    "External Process At",
    "External Process Error",
    "External Process Action",
    "External Action Idempotency Key",
    "External Process Raw Payload",
    "Writeback Status",
    "Writeback At",
    "Writeback Error",
    "Writeback Retry Count",
    "Writeback Last Attempt At",
    "Reconciliation Status",
    "Last Sync Activity At",
    "Last API Response Code",
    "Last API Message",
  ]);
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
  billingStatus:
    | "Not Started"
    | "Processing"
    | "Payment Pending"
    | "Paid"
    | "Failed"
    | "Partially Refunded"
    | "Refunded",
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

export async function updateOrderAmountPaid(
  orderRecordId: string,
  amountPaid: number,
): Promise<void> {
  const response = await airtableRequest(
    `${encodeURIComponent(ORDERS_TABLE)}/${encodeURIComponent(orderRecordId)}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        fields: {
          "Amount Paid": amountPaid,
        },
      }),
    },
  );

  if (!response.ok) {
    const message = await parseAirtableError(response);
    throw new SyncEndpointError(`Failed to update Order Amount Paid: ${message}`, 502);
  }
}

export async function updateInvoicePaymentLink(
  invoiceRecordId: string,
  paymentLink: string,
): Promise<void> {
  const path = `${encodeURIComponent(INVOICES_TABLE)}/${encodeURIComponent(invoiceRecordId)}`;
  const fieldsToWrite: Record<string, unknown> = { "Payment Link": paymentLink };

  while (true) {
    const response = await airtableRequest(path, {
      method: "PATCH",
      body: JSON.stringify({ fields: fieldsToWrite }),
    });
    if (response.ok) return;

    const message = await parseAirtableError(response);
    const missingFieldMatch = message.match(/Unknown field name: "([^"]+)"/);
    const missingField = missingFieldMatch?.[1];
    if (missingField === "Payment Link" && missingField in fieldsToWrite) {
      return;
    }

    throw new SyncEndpointError(`Failed to update Invoice Payment Link: ${message}`, 502);
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
    "External Process Status": "Failed",
    "External Process At": new Date().toISOString(),
    "External Process Error": errorMessage,
    "Writeback Status": "Failed",
    "Writeback At": new Date().toISOString(),
    "Writeback Error": errorMessage,
    "Writeback Last Attempt At": new Date().toISOString(),
    "Reconciliation Status": "Needs Review",
    "Last Sync Activity At": new Date().toISOString(),
    "Last API Message": errorMessage,
    ...(rawPayload ? { "Raw Payload": rawPayload } : {}),
    ...(rawPayload ? { "External Process Raw Payload": rawPayload } : {}),
  });
}
