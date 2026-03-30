import crypto from "crypto";

const WEBHOOK_EVENTS_TABLE = "Webhook Events";
const WEBHOOK_DELIVERIES_TABLE = "Webhook Deliveries";

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

export type WebhookEventStatus = "received" | "processing" | "processed" | "failed";

export type WebhookEventRecord = {
  recordId: string;
  eventKey: string | null;
  providerEventId: string | null;
  eventType: string | null;
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

function getAirtableConfig(): { token: string; baseId: string } {
  const token = readString(process.env.AIRTABLE_OPERATIONS_TOKEN);
  const baseId = readString(process.env.AIRTABLE_OPERATIONS_BASE_ID);

  if (!token || !baseId) {
    throw new Error(
      "Airtable webhook configuration is missing. Set AIRTABLE_OPERATIONS_TOKEN and AIRTABLE_OPERATIONS_BASE_ID.",
    );
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
  return await fetch(`https://api.airtable.com/v0/${baseId}/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
}

function escapeAirtableFormulaString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function isUnknownOptionalFieldError(message: string, key: string): boolean {
  return (
    message.includes(`Unknown field name: "${key}"`) ||
    message.includes(`Unknown field names: ${key}`)
  );
}

function toWebhookEventRecord(record: AirtableRecord): WebhookEventRecord {
  const fields = record.fields ?? {};
  return {
    recordId: record.id,
    eventKey: readString(fields["Event Key"]),
    providerEventId: readString(fields["Provider Event ID"]),
    eventType: readString(fields["Event Type"]),
    status: readStatus(fields["Status"]),
  };
}

export function validateSquareSignature(input: {
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

export async function findWebhookEventByEventKey(
  eventKey: string,
): Promise<WebhookEventRecord | null> {
  const escaped = escapeAirtableFormulaString(eventKey);
  const formula = `{Event Key}='${escaped}'`;

  const params = new URLSearchParams({
    pageSize: "1",
    filterByFormula: formula,
  });

  const response = await airtableRequest(
    `${encodeURIComponent(WEBHOOK_EVENTS_TABLE)}?${params.toString()}`,
    { method: "GET" },
  );

  if (!response.ok) {
    const message = await parseAirtableError(response);
    throw new Error(`Failed to find Webhook Event by Event Key: ${message}`);
  }

  const body = (await response.json()) as { records?: AirtableRecord[] };
  const first = body.records?.[0];
  if (!first) return null;
  return toWebhookEventRecord(first);
}

export async function createWebhookEvent(
  input: CreateWebhookEventInput,
): Promise<WebhookEventRecord> {
  let fields: Record<string, unknown> = {
    "Event Key": input.eventKey,
    Provider: input.provider,
    "Provider Event ID": input.providerEventId,
    "Event Type": input.eventType,
    "Payload JSON": input.payloadJson,
    Status: input.status ?? "received",
  };

  if (input.merchantId) fields["Merchant ID"] = input.merchantId;
  if (input.occurredAt) fields["Occurred At"] = input.occurredAt;

  const optionalFields = new Set(["Payload JSON", "Status", "Merchant ID", "Occurred At"]);

  while (true) {
    const response = await airtableRequest(`${encodeURIComponent(WEBHOOK_EVENTS_TABLE)}`, {
      method: "POST",
      body: JSON.stringify({ fields }),
    });

    if (response.ok) {
      return toWebhookEventRecord((await response.json()) as AirtableRecord);
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

    throw new Error(`Failed to create Webhook Event: ${message}`);
  }
}

export async function updateWebhookEvent(
  eventRecordId: string,
  input: UpdateWebhookEventInput,
): Promise<void> {
  let fields: Record<string, unknown> = {};

  if (input.status) fields.Status = input.status;
  if (input.processedAt !== undefined) fields["Processed At"] = input.processedAt;
  if (input.lastError !== undefined) fields["Last Error"] = input.lastError;

  if (Object.keys(fields).length === 0) return;

  const optionalFields = new Set(["Status", "Processed At", "Last Error"]);

  while (true) {
    const response = await airtableRequest(
      `${encodeURIComponent(WEBHOOK_EVENTS_TABLE)}/${encodeURIComponent(eventRecordId)}`,
      {
        method: "PATCH",
        body: JSON.stringify({ fields }),
      },
    );

    if (response.ok) return;

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

      if (Object.keys(fields).length === 0) return;
      continue;
    }

    throw new Error(`Failed to update Webhook Event: ${message}`);
  }
}

export async function createWebhookDelivery(input: CreateWebhookDeliveryInput): Promise<void> {
  let fields: Record<string, unknown> = {};

  if (input.eventRecordId) fields.Event = [input.eventRecordId];
  if (input.signatureValid != null) fields["Signature Valid"] = input.signatureValid;
  if (input.responseCode != null) fields["Response Code"] = input.responseCode;
  if (input.errorMessage) fields["Error Message"] = input.errorMessage;

  const optionalFields = new Set(["Event", "Signature Valid", "Response Code", "Error Message"]);

  while (true) {
    const response = await airtableRequest(`${encodeURIComponent(WEBHOOK_DELIVERIES_TABLE)}`, {
      method: "POST",
      body: JSON.stringify({ fields }),
    });

    if (response.ok) return;

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

    throw new Error(`Failed to create Webhook Delivery: ${message}`);
  }
}
