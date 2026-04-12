#!/usr/bin/env node

function readString(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseArgs(argv) {
  const args = {
    dryRun: true,
    pageSize: null,
    maxEvents: null,
    onlySupportedEvents: true,
    endpoint:
      readString(process.env.WEBHOOK_EXTERNAL_ACTIONS_BACKFILL_URL) ||
      "http://localhost:3000/api/webhooks/backfill-external-actions",
  };

  for (const token of argv) {
    if (token === "--execute") args.dryRun = false;
    if (token === "--all-events") args.onlySupportedEvents = false;
    if (token.startsWith("--page-size=")) {
      const value = Number(token.slice("--page-size=".length));
      if (Number.isFinite(value) && value > 0) args.pageSize = Math.floor(value);
    }
    if (token.startsWith("--max-events=")) {
      const value = Number(token.slice("--max-events=".length));
      if (Number.isFinite(value) && value > 0) args.maxEvents = Math.floor(value);
    }
    if (token.startsWith("--endpoint=")) {
      args.endpoint = token.slice("--endpoint=".length);
    }
  }

  return args;
}

async function readResponseBody(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const secretAlias =
    readString(process.env.AIRTABLE_SYNC_SECRET_ALIAS) ??
    readString(process.env.AIRTABLE_BACKFILL_SECRET_ALIAS);
  if (!secretAlias) {
    throw new Error("Missing AIRTABLE_SYNC_SECRET_ALIAS.");
  }

  const body = {
    dryRun: args.dryRun,
    onlySupportedEvents: args.onlySupportedEvents,
    ...(args.pageSize != null ? { pageSize: args.pageSize } : {}),
    ...(args.maxEvents != null ? { maxEvents: args.maxEvents } : {}),
  };

  console.log("Triggering External Actions backfill from Webhook Events", {
    endpoint: args.endpoint,
    dryRun: args.dryRun,
    onlySupportedEvents: args.onlySupportedEvents,
  });

  const response = await fetch(args.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-airtable-secret": secretAlias,
    },
    body: JSON.stringify(body),
  });

  const parsed = await readResponseBody(response);
  if (!response.ok) {
    throw new Error(`Backfill endpoint failed (${response.status}): ${JSON.stringify(parsed)}`);
  }

  console.log("Backfill response:");
  console.log(JSON.stringify(parsed, null, 2));
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error("Backfill failed", { error: message });
  process.exitCode = 1;
});
