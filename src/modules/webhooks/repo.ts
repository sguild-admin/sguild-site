import crypto from "crypto";
import { airtableSchema } from "@/config/airtable-schema";
import {
  airtableRequest,
  escapeAirtableFormulaString,
  parseAirtableError,
} from "@/lib/airtable/client";
import {
  createExternalAction,
  findInboundExternalActionByIdentity,
  updateExternalAction,
} from "@/modules/integrations";
import { ordersRepo } from "@/modules/orders";

const WEBHOOK_EVENTS_TABLE = airtableSchema.operations.tables.webhookEvents;
const WEBHOOK_DELIVERIES_TABLE = airtableSchema.operations.tables.webhookDeliveries;

type AirtableRecord = {
  id: string;
  fields?: Record<string, unknown>;
};

export type WebhookEventStatus = "received" | "processing" | "processed" | "failed";

export type WebhookEventRecord = {
  recordId: string;
  eventKey: string | null;
  provider: string | null;
  providerEventId: string | null;
  eventType: string | null;
  merchantId: string | null;
  payloadJson: string | null;
  occurredAt: string | null;
  lastError: string | null;
  status: WebhookEventStatus | null;
};

export type CreateWebhookEventInput = {
  eventKey: string;
  provider: "Square";
  providerEventId: string;
  eventType: string;
  merchantId?: string | null;
  payloadJson: string;
  occurredAt?: string | null;
  status?: WebhookEventStatus;
};

export type UpdateWebhookEventInput = {
  eventKey?: string;
  provider?: "Square";
  providerEventId?: string;
  eventType?: string;
  merchantId?: string | null;
  payloadJson?: string;
  occurredAt?: string | null;
  status?: WebhookEventStatus;
  processedAt?: string | null;
  lastError?: string | null;
};

export type CreateWebhookDeliveryInput = {
  eventRecordId?: string | null;
  signatureValid?: boolean | null;
  responseCode?: number | null;
  errorMessage?: string | null;
};

export type UpdateWebhookDeliveryInput = CreateWebhookDeliveryInput;

function readString(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return null;
}

function readStatus(value: unknown): WebhookEventStatus | null {
  const parsed = readString(value)?.toLowerCase();
  if (parsed === "received" || parsed === "processing" || parsed === "processed" || parsed === "failed") {
    return parsed;
  }
  return null;
}

function toAirtableStatus(value: WebhookEventStatus): "received" | "processing" | "processed" | "failed" {
  if (value === "received") return "received";
  if (value === "processing") return "processing";
  if (value === "processed") return "processed";
  return "failed";
}

function getWebhookEventsTableName(): string {
  return WEBHOOK_EVENTS_TABLE;
}

function getWebhookDeliveriesTableName(): string {
  return WEBHOOK_DELIVERIES_TABLE;
}

function isUnknownOptionalFieldError(message: string, key: string): boolean {
  return (
    message.includes(`Unknown field name: "${key}"`) ||
    message.includes(`Unknown field names: ${key}`) ||
    message.includes(`Unknown field names: ${JSON.stringify(key)}`)
  );
}

function isRejectedOptionalFieldValueError(message: string, key: string): boolean {
  if (message.includes(`Field "${key}" cannot accept the provided value`)) return true;

  if (key === "Status" && message.includes("Insufficient permissions to create new select option")) {
    return true;
  }

  return false;
}

function isUnknownFieldError(message: string): boolean {
  return message.includes("Unknown field name:") || message.includes("Unknown field names:");
}

function toWebhookEventRecord(record: AirtableRecord): WebhookEventRecord {
  const fields = record.fields ?? {};
  return {
    recordId: record.id,
    eventKey: readString(fields["Event Key"]),
    provider: readString(fields.Provider),
    providerEventId: readString(fields["Provider Event ID"]),
    eventType: readString(fields["Event Type"]),
    merchantId: readString(fields["Merchant ID"]),
    payloadJson: readString(fields["Payload JSON"]),
    occurredAt: readString(fields["Occurred At"]),
    lastError: readString(fields["Last Error"]),
    status: readStatus(fields.Status),
  };
}

function buildWebhookEventKey(input: {
  provider: "Square";
  eventType: string;
  providerEventId: string;
}): string {
  return `${input.provider} | ${input.eventType} | ${input.providerEventId}`;
}

function validateSquareSignature(input: {
  signatureKey: string;
  notificationUrl: string;
  rawBody: string;
  signatureHeader: string;
}): boolean {
  const expected = crypto
    .createHmac("sha256", input.signatureKey)
    .update(`${input.notificationUrl}${input.rawBody}`, "utf8")
    .digest("base64");

  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(input.signatureHeader);
  if (expectedBuffer.length !== providedBuffer.length) return false;
  return crypto.timingSafeEqual(expectedBuffer, providedBuffer);
}

async function findWebhookEventByEventKey(
  eventKey: string,
): Promise<WebhookEventRecord | null> {
  const webhookEventsTable = getWebhookEventsTableName();
  const escaped = escapeAirtableFormulaString(eventKey);
  const formula = `{Event Key}='${escaped}'`;

  const params = new URLSearchParams({
    pageSize: "1",
    filterByFormula: formula,
  });

  const response = await airtableRequest(
    `${encodeURIComponent(webhookEventsTable)}?${params.toString()}`,
    { method: "GET" },
  );

  if (!response.ok) {
    const message = await parseAirtableError(response);
    if (isUnknownFieldError(message)) return null;
    throw new Error(`Failed to find Webhook Event by Event Key: ${message}`);
  }

  const body = (await response.json()) as { records?: AirtableRecord[] };
  const first = body.records?.[0];
  if (!first) return null;
  return toWebhookEventRecord(first);
}

async function findWebhookEventByProviderEventId(input: {
  provider: "Square";
  providerEventId: string;
}): Promise<WebhookEventRecord | null> {
  const webhookEventsTable = getWebhookEventsTableName();
  const escapedProvider = escapeAirtableFormulaString(input.provider);
  const escapedProviderEventId = escapeAirtableFormulaString(input.providerEventId);
  const formula = `AND({Provider}='${escapedProvider}', {Provider Event ID}='${escapedProviderEventId}')`;

  const params = new URLSearchParams({
    pageSize: "1",
    filterByFormula: formula,
  });

  const response = await airtableRequest(
    `${encodeURIComponent(webhookEventsTable)}?${params.toString()}`,
    { method: "GET" },
  );

  if (!response.ok) {
    const message = await parseAirtableError(response);
    if (isUnknownFieldError(message)) return null;
    throw new Error(`Failed to find Webhook Event by canonical identity: ${message}`);
  }

  const body = (await response.json()) as { records?: AirtableRecord[] };
  const first = body.records?.[0];
  if (!first) return null;
  return toWebhookEventRecord(first);
}

async function createWebhookEvent(
  input: CreateWebhookEventInput,
): Promise<WebhookEventRecord> {
  const webhookEventsTable = getWebhookEventsTableName();
  let fields: Record<string, unknown> = {
    "Event Key": input.eventKey,
    Provider: input.provider,
    "Provider Event ID": input.providerEventId,
    "Event Type": input.eventType,
    "Payload JSON": input.payloadJson,
    Status: toAirtableStatus(input.status ?? "received"),
  };

  if (input.merchantId) fields["Merchant ID"] = input.merchantId;
  if (input.occurredAt) fields["Occurred At"] = input.occurredAt;

  const optionalFields = new Set([
    "Event Key",
    "Provider",
    "Provider Event ID",
    "Event Type",
    "Payload JSON",
    "Status",
    "Merchant ID",
    "Occurred At",
  ]);

  while (true) {
    const response = await airtableRequest(`${encodeURIComponent(webhookEventsTable)}`, {
      method: "POST",
      body: JSON.stringify({ fields }),
    });

    if (response.ok) {
      return toWebhookEventRecord((await response.json()) as AirtableRecord);
    }

    const message = await parseAirtableError(response);
    const optionalFieldToDrop = [...optionalFields].find(
      (key) =>
        key in fields &&
        (isUnknownOptionalFieldError(message, key) ||
          isRejectedOptionalFieldValueError(message, key)),
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

    if (isUnknownFieldError(message) && Object.keys(fields).length === 0) {
      const fallback = await airtableRequest(`${encodeURIComponent(webhookEventsTable)}`, {
        method: "POST",
        body: JSON.stringify({ fields: {} }),
      });
      if (fallback.ok) {
        return toWebhookEventRecord((await fallback.json()) as AirtableRecord);
      }
    }

    throw new Error(`Failed to create Webhook Event: ${message}`);
  }
}

async function updateWebhookEvent(
  eventRecordId: string,
  input: UpdateWebhookEventInput,
): Promise<void> {
  const webhookEventsTable = getWebhookEventsTableName();
  let fields: Record<string, unknown> = {};

  if (input.eventKey !== undefined) fields["Event Key"] = input.eventKey;
  if (input.provider !== undefined) fields.Provider = input.provider;
  if (input.providerEventId !== undefined) fields["Provider Event ID"] = input.providerEventId;
  if (input.eventType !== undefined) fields["Event Type"] = input.eventType;
  if (input.payloadJson !== undefined) fields["Payload JSON"] = input.payloadJson;
  if (input.occurredAt !== undefined) fields["Occurred At"] = input.occurredAt;
  if (input.merchantId !== undefined) fields["Merchant ID"] = input.merchantId;
  if (input.status) fields.Status = toAirtableStatus(input.status);
  if (input.processedAt !== undefined) fields["Processed At"] = input.processedAt;
  if (input.lastError !== undefined) fields["Last Error"] = input.lastError;

  if (Object.keys(fields).length === 0) return;

  const optionalFields = new Set([
    "Event Key",
    "Provider",
    "Provider Event ID",
    "Event Type",
    "Payload JSON",
    "Occurred At",
    "Merchant ID",
    "Status",
    "Processed At",
    "Last Error",
  ]);

  while (true) {
    const response = await airtableRequest(
      `${encodeURIComponent(webhookEventsTable)}/${encodeURIComponent(eventRecordId)}`,
      {
        method: "PATCH",
        body: JSON.stringify({ fields }),
      },
    );

    if (response.ok) return;

    const message = await parseAirtableError(response);
    const optionalFieldToDrop = [...optionalFields].find(
      (key) =>
        key in fields &&
        (isUnknownOptionalFieldError(message, key) ||
          isRejectedOptionalFieldValueError(message, key)),
    );

    if (optionalFieldToDrop) {
      const nextFields: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(fields)) {
        if (key === optionalFieldToDrop) continue;
        nextFields[key] = value;
      }
      fields = nextFields;

      if (Object.keys(fields).length === 0) return;
      continue;
    }

    throw new Error(`Failed to update Webhook Event: ${message}`);
  }
}

async function createWebhookDelivery(input: CreateWebhookDeliveryInput): Promise<string> {
  const webhookDeliveriesTable = getWebhookDeliveriesTableName();
  let fields: Record<string, unknown> = {};

  if (input.eventRecordId) fields.Event = [input.eventRecordId];
  if (input.signatureValid != null) fields["Signature Valid"] = input.signatureValid;
  if (input.responseCode != null) fields["Response Code"] = input.responseCode;
  if (input.errorMessage !== undefined && input.errorMessage !== null) {
    fields["Error Message"] = input.errorMessage;
  }

  const optionalFields = new Set(["Event", "Signature Valid", "Response Code", "Error Message"]);

  while (true) {
    const response = await airtableRequest(`${encodeURIComponent(webhookDeliveriesTable)}`, {
      method: "POST",
      body: JSON.stringify({ fields }),
    });

    if (response.ok) {
      const record = (await response.json()) as AirtableRecord;
      return record.id;
    }

    const message = await parseAirtableError(response);
    const optionalFieldToDrop = [...optionalFields].find(
      (key) =>
        key in fields &&
        (isUnknownOptionalFieldError(message, key) ||
          isRejectedOptionalFieldValueError(message, key)),
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

    throw new Error(`Failed to create Webhook Delivery: ${message}`);
  }
}

async function updateWebhookDelivery(
  deliveryRecordId: string,
  input: UpdateWebhookDeliveryInput,
): Promise<void> {
  const webhookDeliveriesTable = getWebhookDeliveriesTableName();
  let fields: Record<string, unknown> = {};

  if (input.eventRecordId !== undefined) fields.Event = input.eventRecordId ? [input.eventRecordId] : [];
  if (input.signatureValid !== undefined && input.signatureValid !== null) {
    fields["Signature Valid"] = input.signatureValid;
  }
  if (input.responseCode !== undefined && input.responseCode !== null) {
    fields["Response Code"] = input.responseCode;
  }
  if (input.errorMessage !== undefined && input.errorMessage !== null) {
    fields["Error Message"] = input.errorMessage;
  }

  if (Object.keys(fields).length === 0) return;

  const optionalFields = new Set(["Event", "Signature Valid", "Response Code", "Error Message"]);

  while (true) {
    const response = await airtableRequest(
      `${encodeURIComponent(webhookDeliveriesTable)}/${encodeURIComponent(deliveryRecordId)}`,
      {
        method: "PATCH",
        body: JSON.stringify({ fields }),
      },
    );

    if (response.ok) return;

    const message = await parseAirtableError(response);
    const optionalFieldToDrop = [...optionalFields].find(
      (key) =>
        key in fields &&
        (isUnknownOptionalFieldError(message, key) ||
          isRejectedOptionalFieldValueError(message, key)),
    );

    if (optionalFieldToDrop) {
      const nextFields: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(fields)) {
        if (key === optionalFieldToDrop) continue;
        nextFields[key] = value;
      }
      fields = nextFields;
      if (Object.keys(fields).length === 0) return;
      continue;
    }

    throw new Error(`Failed to update Webhook Delivery: ${message}`);
  }
}

async function listWebhookEvents(input?: {
  pageSize?: number;
  offset?: string;
}): Promise<{ events: WebhookEventRecord[]; nextOffset: string | null }> {
  const webhookEventsTable = getWebhookEventsTableName();
  const params = new URLSearchParams({
    pageSize: String(input?.pageSize ?? 100),
  });
  if (input?.offset) params.set("offset", input.offset);

  const response = await airtableRequest(
    `${encodeURIComponent(webhookEventsTable)}?${params.toString()}`,
    { method: "GET" },
  );

  if (!response.ok) {
    const message = await parseAirtableError(response);
    throw new Error(`Failed to list Webhook Events: ${message}`);
  }

  const body = (await response.json()) as { records?: AirtableRecord[]; offset?: string };
  return {
    events: (body.records ?? []).map((record) => toWebhookEventRecord(record)),
    nextOffset: typeof body.offset === "string" ? body.offset : null,
  };
}

async function hasWebhookDeliveryForEvent(eventRecordId: string): Promise<boolean> {
  const webhookDeliveriesTable = getWebhookDeliveriesTableName();
  const escapedEventId = escapeAirtableFormulaString(eventRecordId);
  const params = new URLSearchParams({
    maxRecords: "1",
    filterByFormula: `FIND('${escapedEventId}', ARRAYJOIN({Event}))`,
  });

  const response = await airtableRequest(
    `${encodeURIComponent(webhookDeliveriesTable)}?${params.toString()}`,
    { method: "GET" },
  );
  if (!response.ok) {
    const message = await parseAirtableError(response);
    throw new Error(`Failed to find Webhook Delivery by Event: ${message}`);
  }

  const body = (await response.json()) as { records?: AirtableRecord[] };
  return (body.records?.length ?? 0) > 0;
}

function createMetaSignature(rawBody: string, appSecret: string): string {
  return "sha256=" + crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex");
}

function timingSafeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

export const webhooksRepo = {
  validateSquareSignature,
  timingSafeEqual,
  createMetaSignature,
  buildWebhookEventKey,
  findWebhookEventByProviderEventId,
  findWebhookEventByEventKey,
  listWebhookEvents,
  hasWebhookDeliveryForEvent,
  createWebhookEvent,
  updateWebhookEvent,
  createWebhookDelivery,
  updateWebhookDelivery,
};

export const webhooksIngestRepo = {
  findInboundExternalActionByIdentity,
  createExternalAction,
  updateExternalAction,
  findOrderExternalByExternalInvoiceId: ordersRepo.findOrderExternalByExternalInvoiceId,
  findOrderExternalByExternalOrderId: ordersRepo.findOrderExternalByExternalOrderId,
};
