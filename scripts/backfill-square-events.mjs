#!/usr/bin/env node

/**
 * Backfill Square events into Airtable Webhook Events / Webhook Deliveries tables.
 *
 * Usage examples:
 *  node --env-file=.env.local scripts/backfill-square-events.mjs
 *  node --env-file=.env.local scripts/backfill-square-events.mjs --hours=24
 *  node --env-file=.env.local scripts/backfill-square-events.mjs --start=2026-03-28T00:00:00Z --end=2026-03-29T00:00:00Z
 *  node --env-file=.env.local scripts/backfill-square-events.mjs --hours=168 --all-types --debug-types
 */

const DEFAULT_SQUARE_BASE_URL = "https://connect.squareup.com";
const DEFAULT_SQUARE_VERSION = "2024-06-04";

const WEBHOOK_EVENTS_TABLE = "Webhook Events";
const WEBHOOK_DELIVERIES_TABLE = "Webhook Deliveries";

const SUBSCRIBED_EVENT_TYPES = [
  "payment.created",
  "payment.updated",
  "refund.created",
  "refund.updated",
  "order.created",
  "order.updated",
  "invoice.canceled",
  "invoice.created",
  "invoice.deleted",
  "invoice.payment_made",
  "invoice.updated",
  "invoice.refunded",
  "invoice.published",
  "customer.created",
  "customer.updated",
  "customer.deleted",
  "card.created",
  "card.updated",
  "card.disabled",
  "card.forgotten",
];

function readString(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseArgs(argv) {
  const args = {
    hours: 24,
    start: null,
    end: null,
    allTypes: false,
    debugTypes: false,
  };

  for (const token of argv) {
    if (token.startsWith("--hours=")) {
      const value = Number(token.slice("--hours=".length));
      if (Number.isFinite(value) && value > 0) args.hours = value;
      continue;
    }
    if (token.startsWith("--start=")) {
      args.start = token.slice("--start=".length);
      continue;
    }
    if (token.startsWith("--end=")) {
      args.end = token.slice("--end=".length);
      continue;
    }
    if (token === "--all-types") {
      args.allTypes = true;
      continue;
    }
    if (token === "--debug-types") {
      args.debugTypes = true;
      continue;
    }
  }

  return args;
}

function resolveWindow(args) {
  const end = args.end ? new Date(args.end) : new Date();
  if (Number.isNaN(end.getTime())) {
    throw new Error("Invalid --end timestamp.");
  }

  let start;
  if (args.start) {
    start = new Date(args.start);
    if (Number.isNaN(start.getTime())) {
      throw new Error("Invalid --start timestamp.");
    }
  } else {
    start = new Date(end.getTime() - args.hours * 60 * 60 * 1000);
  }

  if (start >= end) {
    throw new Error("Start must be earlier than end.");
  }

  return {
    startAt: start.toISOString(),
    endAt: end.toISOString(),
  };
}

function getSquareConfig() {
  const accessToken =
    readString(process.env.SQUARE_ACCESS_TOKEN) ||
    readString(process.env.SQUARE_WEBHOOK_BACKFILL_ACCESS_TOKEN);

  if (!accessToken) {
    throw new Error(
      "Missing SQUARE_ACCESS_TOKEN (or SQUARE_WEBHOOK_BACKFILL_ACCESS_TOKEN) for backfill.",
    );
  }

  return {
    accessToken,
    baseUrl: readString(process.env.SQUARE_API_BASE_URL) || DEFAULT_SQUARE_BASE_URL,
    version: readString(process.env.SQUARE_API_VERSION) || DEFAULT_SQUARE_VERSION,
  };
}

function getAirtableConfig() {
  const token = readString(process.env.AIRTABLE_OPERATIONS_TOKEN);
  const baseId = readString(process.env.AIRTABLE_OPERATIONS_BASE_ID);

  if (!token || !baseId) {
    throw new Error(
      "Missing AIRTABLE_OPERATIONS_TOKEN or AIRTABLE_OPERATIONS_BASE_ID configuration.",
    );
  }

  return { token, baseId };
}

async function parseErrorBody(response) {
  try {
    const parsed = await response.json();
    const detail = parsed?.error?.message || parsed?.errors?.[0]?.detail;
    return detail || JSON.stringify(parsed);
  } catch {
    return response.statusText || "Unknown upstream error";
  }
}

async function squareRequest(config, path, body) {
  const response = await fetch(`${config.baseUrl}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.accessToken}`,
      "Content-Type": "application/json",
      "Square-Version": config.version,
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  if (!response.ok) {
    const message = await parseErrorBody(response);
    throw new Error(`Square request failed (${response.status}): ${message}`);
  }

  return await response.json();
}

async function airtableRequest(config, path, init) {
  const response = await fetch(`https://api.airtable.com/v0/${config.baseId}/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const message = await parseErrorBody(response);
    throw new Error(`Airtable request failed (${response.status}): ${message}`);
  }

  return await response.json();
}

function escapeAirtableFormulaString(value) {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

async function findWebhookEventByEventKey(airtableConfig, eventKey) {
  const formula = `{Event Key}='${escapeAirtableFormulaString(eventKey)}'`;
  const params = new URLSearchParams({ pageSize: "1", filterByFormula: formula });
  const body = await airtableRequest(
    airtableConfig,
    `${encodeURIComponent(WEBHOOK_EVENTS_TABLE)}?${params.toString()}`,
    { method: "GET" },
  );
  return body?.records?.[0] || null;
}

async function createWebhookEvent(airtableConfig, payload) {
  const body = await airtableRequest(airtableConfig, encodeURIComponent(WEBHOOK_EVENTS_TABLE), {
    method: "POST",
    body: JSON.stringify({
      fields: {
        "Event Key": payload.eventKey,
        Provider: "Square",
        "Provider Event ID": payload.providerEventId,
        "Event Type": payload.eventType,
        "Merchant ID": payload.merchantId || undefined,
        "Payload JSON": payload.payloadJson,
        "Occurred At": payload.occurredAt || undefined,
        Status: "received",
      },
    }),
  });

  return body;
}

async function updateWebhookEvent(airtableConfig, recordId, fields) {
  await airtableRequest(
    airtableConfig,
    `${encodeURIComponent(WEBHOOK_EVENTS_TABLE)}/${encodeURIComponent(recordId)}`,
    {
      method: "PATCH",
      body: JSON.stringify({ fields }),
    },
  );
}

async function createWebhookDelivery(airtableConfig, payload) {
  const fields = {
    Event: payload.eventRecordId ? [payload.eventRecordId] : undefined,
    "Signature Valid": payload.signatureValid ?? undefined,
    "Response Code": payload.responseCode ?? undefined,
    "Error Message": payload.errorMessage || undefined,
  };

  await airtableRequest(airtableConfig, encodeURIComponent(WEBHOOK_DELIVERIES_TABLE), {
    method: "POST",
    body: JSON.stringify({ fields }),
  });
}

function toEventIdentity(event) {
  const providerEventId = readString(event?.event_id);
  const eventType = readString(event?.type);
  const merchantId = readString(event?.merchant_id);
  const occurredAt = readString(event?.created_at);

  if (!providerEventId || !eventType) {
    return null;
  }

  return {
    providerEventId,
    eventType,
    merchantId,
    occurredAt,
    eventKey: `Square | ${eventType} | ${providerEventId}`,
  };
}

async function fetchSquareEvents(squareConfig, startAt, endAt, args) {
  const events = [];
  const eventTypesFilter = args.allTypes ? undefined : SUBSCRIBED_EVENT_TYPES;
  let cursor = null;

  do {
    const body = {
      query: {
        filter: {
          created_at: {
            start_at: startAt,
            end_at: endAt,
          },
          ...(eventTypesFilter ? { event_types: eventTypesFilter } : {}),
        },
      },
      limit: 100,
      cursor: cursor || undefined,
    };

    const response = await squareRequest(squareConfig, "/v2/events", body);
    const pageEvents = Array.isArray(response?.events) ? response.events : [];
    events.push(...pageEvents);

    cursor = readString(response?.cursor);
  } while (cursor);

  return events;
}

function logEventTypeCounts(events) {
  const counts = new Map();
  for (const event of events) {
    const type = readString(event?.type) || "(unknown)";
    counts.set(type, (counts.get(type) || 0) + 1);
  }

  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  console.log("Event type counts:");
  for (const [type, count] of sorted) {
    console.log(`  ${type}: ${count}`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const window = resolveWindow(args);

  const squareConfig = getSquareConfig();
  const airtableConfig = getAirtableConfig();

  console.log("Starting Square webhook backfill", {
    startAt: window.startAt,
    endAt: window.endAt,
    eventTypes: args.allTypes ? "all" : SUBSCRIBED_EVENT_TYPES.length,
  });

  const events = await fetchSquareEvents(squareConfig, window.startAt, window.endAt, args);
  console.log(`Fetched ${events.length} events from Square.`);

  if (args.debugTypes && events.length > 0) {
    logEventTypeCounts(events);
  }

  const stats = {
    seen: 0,
    created: 0,
    deduped: 0,
    processed: 0,
    failed: 0,
    skipped: 0,
  };

  for (const event of events) {
    stats.seen += 1;
    const identity = toEventIdentity(event);

    if (!identity) {
      stats.skipped += 1;
      continue;
    }

    let eventRecordId = null;
    try {
      const existing = await findWebhookEventByEventKey(airtableConfig, identity.eventKey);
      if (existing) {
        eventRecordId = existing.id;
        stats.deduped += 1;
      } else {
        const created = await createWebhookEvent(airtableConfig, {
          eventKey: identity.eventKey,
          providerEventId: identity.providerEventId,
          eventType: identity.eventType,
          merchantId: identity.merchantId,
          occurredAt: identity.occurredAt,
          payloadJson: JSON.stringify(event),
        });
        eventRecordId = created.id;
        stats.created += 1;
      }

      if (eventRecordId) {
        await updateWebhookEvent(airtableConfig, eventRecordId, {
          Status: "processed",
          "Processed At": new Date().toISOString(),
          "Last Error": null,
        });
      }

      await createWebhookDelivery(airtableConfig, {
        eventRecordId,
        signatureValid: true,
        responseCode: 200,
        errorMessage: "Backfill ingest",
      });

      stats.processed += 1;
    } catch (error) {
      stats.failed += 1;
      const message = error instanceof Error ? error.message : String(error);

      if (eventRecordId) {
        try {
          await updateWebhookEvent(airtableConfig, eventRecordId, {
            Status: "failed",
            "Last Error": message,
          });
        } catch {
          // keep original failure as the primary signal
        }
      }

      try {
        await createWebhookDelivery(airtableConfig, {
          eventRecordId,
          signatureValid: true,
          responseCode: 500,
          errorMessage: `Backfill failed: ${message}`,
        });
      } catch {
        // keep original failure as the primary signal
      }
    }
  }

  console.log("Backfill complete", stats);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error("Backfill failed to start", { error: message });
  process.exitCode = 1;
});
