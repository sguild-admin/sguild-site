#!/usr/bin/env node

const token = process.env.AIRTABLE_OPERATIONS_TOKEN ?? process.env.AIRTABLE_TOKEN;
const baseId = process.env.AIRTABLE_OPERATIONS_BASE_ID ?? process.env.AIRTABLE_BASE_ID;
const dryRun = process.argv.includes("--execute") ? false : true;

if (!token || !baseId) {
  console.error("Missing Airtable configuration. Set AIRTABLE_OPERATIONS_TOKEN/AIRTABLE_OPERATIONS_BASE_ID.");
  process.exit(1);
}

const ORDER_EXTERNALS_TABLE = "Order Externals";
const INVOICE_EXTERNALS_TABLE = "Invoice Externals";
const EXTERNAL_ACTIONS_TABLE = "External Actions";

function readString(value) {
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

function readFirstLinkedId(value) {
  if (!Array.isArray(value) || value.length === 0) return null;
  return typeof value[0] === "string" && value[0].trim().length > 0 ? value[0].trim() : null;
}

function normalizeStatus(fields) {
  const syncStatus = readString(fields["Sync Status"])?.toLowerCase();
  const extProcessStatus = readString(fields["External Process Status"])?.toLowerCase();
  const writebackStatus = readString(fields["Writeback Status"])?.toLowerCase();

  if (syncStatus === "failed" || extProcessStatus === "failed" || writebackStatus === "failed") return "Failed";
  if (syncStatus === "synced" || extProcessStatus === "succeeded" || writebackStatus === "succeeded") return "Succeeded";
  return "Pending";
}

function normalizeWritebackStatus(fields) {
  const writeback = readString(fields["Writeback Status"]);
  if (writeback === "Pending" || writeback === "Succeeded" || writeback === "Failed" || writeback === "Not Started") {
    return writeback;
  }
  return "Not Started";
}

async function airtableRequest(path, init = {}) {
  const response = await fetch(`https://api.airtable.com/v0/${baseId}/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });

  if (response.ok) return response;

  let message = response.statusText;
  try {
    const body = await response.json();
    if (body?.error?.message) message = body.error.message;
  } catch {
    // keep status text
  }
  throw new Error(`Airtable request failed (${response.status}): ${message}`);
}

async function listRecords(tableName) {
  const records = [];
  let offset = null;
  do {
    const params = new URLSearchParams({ pageSize: "100" });
    if (offset) params.set("offset", offset);
    const response = await airtableRequest(`${encodeURIComponent(tableName)}?${params.toString()}`, { method: "GET" });
    const body = await response.json();
    records.push(...(body.records ?? []));
    offset = body.offset ?? null;
  } while (offset);
  return records;
}

async function findExistingBackfillAction(providerReferenceId) {
  const escaped = providerReferenceId.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  const formula = `AND({Provider Event Type}='Backfill Snapshot', {Provider Reference ID}='${escaped}', {Direction}='Outbound')`;
  const params = new URLSearchParams({ pageSize: "1", filterByFormula: formula });
  const response = await airtableRequest(`${encodeURIComponent(EXTERNAL_ACTIONS_TABLE)}?${params.toString()}`, { method: "GET" });
  const body = await response.json();
  return body.records?.[0] ?? null;
}

async function createAction(fields) {
  await airtableRequest(encodeURIComponent(EXTERNAL_ACTIONS_TABLE), {
    method: "POST",
    body: JSON.stringify({ fields }),
  });
}

async function backfillRow(row, entityType) {
  const fields = row.fields ?? {};
  const providerReferenceId = `backfill:${entityType.toLowerCase()}:${row.id}`;
  const existing = await findExistingBackfillAction(providerReferenceId);
  if (existing) return { created: 0, skipped: 1 };

  const occurredAt =
    readString(fields["Last Sync Activity At"]) ??
    readString(fields["Last Synced At"]) ??
    readString(fields["Modified At"]) ??
    new Date().toISOString();

  const actionFields = {
    "External Entity Type": entityType,
    "Action Type": "Reconcile",
    Direction: "Outbound",
    "Trigger Source": "Backfill",
    "Occurred At": occurredAt,
    Status: normalizeStatus(fields),
    "Attempt Number": 1,
    Retryable: false,
    "Provider Event Type": "Backfill Snapshot",
    "Provider Reference ID": providerReferenceId,
    "Error Summary": readString(fields["Sync Error"]) ?? readString(fields["External Process Error"]) ?? "",
    "Raw Provider Payload": readString(fields["Raw Payload"]) ?? "",
    "Writeback Status": normalizeWritebackStatus(fields),
    "Writeback Error": readString(fields["Writeback Error"]) ?? "",
    "Writeback Last Attempt At": readString(fields["Writeback Last Attempt At"]) ?? occurredAt,
    ...(readFirstLinkedId(fields["Org Integration"]) ? { "Org Integration": [readFirstLinkedId(fields["Org Integration"])] } : {}),
    ...(readFirstLinkedId(fields["Provider Account"]) ? { "Provider Account": [readFirstLinkedId(fields["Provider Account"])] } : {}),
    ...(entityType === "Order" ? { "Order External": [row.id] } : { "Invoice External": [row.id] }),
  };

  if (!dryRun) {
    await createAction(actionFields);
  }

  return { created: 1, skipped: 0 };
}

async function main() {
  const [orderExternals, invoiceExternals] = await Promise.all([
    listRecords(ORDER_EXTERNALS_TABLE),
    listRecords(INVOICE_EXTERNALS_TABLE),
  ]);

  let created = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of orderExternals) {
    try {
      const result = await backfillRow(row, "Order");
      created += result.created;
      skipped += result.skipped;
    } catch (error) {
      failed += 1;
      console.error("Order External backfill row failed", row.id, error instanceof Error ? error.message : String(error));
    }
  }

  for (const row of invoiceExternals) {
    try {
      const result = await backfillRow(row, "Invoice");
      created += result.created;
      skipped += result.skipped;
    } catch (error) {
      failed += 1;
      console.error("Invoice External backfill row failed", row.id, error instanceof Error ? error.message : String(error));
    }
  }

  console.log(JSON.stringify({
    dryRun,
    orderExternals: orderExternals.length,
    invoiceExternals: invoiceExternals.length,
    created,
    skipped,
    failed,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
