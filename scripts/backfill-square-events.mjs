#!/usr/bin/env node

/**
 * Trigger Square historical webhook backfill through the operational API route.
 *
 * Usage examples:
 *  node --env-file=.env.local scripts/backfill-square-events.mjs --alias=merchantA --hours=24
 *  node --env-file=.env.local scripts/backfill-square-events.mjs --alias=merchantA --start=2026-03-28T00:00:00Z --end=2026-03-29T00:00:00Z
 *  node --env-file=.env.local scripts/backfill-square-events.mjs --alias=merchantA --hours=168 --dry-run
 */

function readString(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseArgs(argv) {
  const args = {
    alias: readString(process.env.SQUARE_WEBHOOK_BACKFILL_ACCESS_TOKEN_ALIAS),
    hours: 24,
    start: null,
    end: null,
    eventTypes: [],
    allTypes: false,
    dryRun: false,
    maxEvents: null,
    pageSize: null,
    endpoint: readString(process.env.SQUARE_WEBHOOK_BACKFILL_URL) || "http://localhost:3000/api/webhooks/backfill-square",
  };

  for (const token of argv) {
    if (token.startsWith("--alias=")) {
      args.alias = readString(token.slice("--alias=".length));
      continue;
    }
    if (token.startsWith("--hours=")) {
      const value = Number(token.slice("--hours=".length));
      if (Number.isFinite(value) && value > 0) args.hours = Math.floor(value);
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
    if (token.startsWith("--event-types=")) {
      const values = token
        .slice("--event-types=".length)
        .split(",")
        .map((value) => value.trim())
        .filter((value) => value.length > 0);
      args.eventTypes = [...new Set(values)];
      continue;
    }
    if (token === "--all-types") {
      args.allTypes = true;
      continue;
    }
    if (token === "--dry-run") {
      args.dryRun = true;
      continue;
    }
    if (token.startsWith("--max-events=")) {
      const value = Number(token.slice("--max-events=".length));
      if (Number.isFinite(value) && value > 0) args.maxEvents = Math.floor(value);
      continue;
    }
    if (token.startsWith("--page-size=")) {
      const value = Number(token.slice("--page-size=".length));
      if (Number.isFinite(value) && value > 0) args.pageSize = Math.floor(value);
      continue;
    }
    if (token.startsWith("--endpoint=")) {
      args.endpoint = token.slice("--endpoint=".length);
      continue;
    }
  }

  return args;
}

function buildBody(args) {
  if (!args.alias) {
    throw new Error("Missing --alias (or SQUARE_WEBHOOK_BACKFILL_ACCESS_TOKEN_ALIAS).");
  }

  if (args.hours != null && (args.start || args.end)) {
    throw new Error("Use either --hours or --start/--end, not both.");
  }

  if (args.hours == null && (!args.start || !args.end)) {
    throw new Error("Provide either --hours or both --start and --end.");
  }

  const body = {
    accessTokenAlias: args.alias,
    dryRun: args.dryRun,
    ...(args.hours != null ? { hours: args.hours } : { startAt: args.start, endAt: args.end }),
    ...(args.maxEvents != null ? { maxEvents: args.maxEvents } : {}),
    ...(args.pageSize != null ? { pageSize: args.pageSize } : {}),
  };

  if (!args.allTypes && args.eventTypes.length > 0) {
    body.eventTypes = args.eventTypes;
  }

  return body;
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
  const body = buildBody(args);

  const secret =
    readString(process.env.SQUARE_WEBHOOK_BACKFILL_SECRET) ||
    readString(process.env.AIRTABLE_SYNC_SECRET);

  if (!secret) {
    throw new Error("Missing SQUARE_WEBHOOK_BACKFILL_SECRET (or AIRTABLE_SYNC_SECRET).");
  }

  console.log("Triggering Square webhook backfill", {
    endpoint: args.endpoint,
    alias: body.accessTokenAlias,
    dryRun: body.dryRun,
  });

  const response = await fetch(args.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-airtable-secret": secret,
    },
    body: JSON.stringify(body),
  });

  const parsedBody = await readResponseBody(response);
  if (!response.ok) {
    throw new Error(`Backfill endpoint failed (${response.status}): ${JSON.stringify(parsedBody)}`);
  }

  console.log("Backfill response:");
  console.log(JSON.stringify(parsedBody, null, 2));
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error("Backfill failed", { error: message });
  process.exitCode = 1;
});
