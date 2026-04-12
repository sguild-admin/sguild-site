#!/usr/bin/env node

function readString(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseArgs(argv) {
  const args = {
    dryRun: true,
    endpoint:
      readString(process.env.CLIENT_EXTERNALS_BACKFILL_URL) ||
      "http://localhost:3000/api/client-externals",
  };

  for (const token of argv) {
    if (token === "--execute") args.dryRun = false;
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
  const secret =
    readString(process.env.AIRTABLE_SYNC_SECRET) ??
    readString(process.env.AIRTABLE_SYNC_SECRET_ALIAS) ??
    readString(process.env.AIRTABLE_BACKFILL_SECRET_ALIAS);
  if (!secret) {
    throw new Error(
      "Missing AIRTABLE_SYNC_SECRET (or AIRTABLE_SYNC_SECRET_ALIAS / AIRTABLE_BACKFILL_SECRET_ALIAS).",
    );
  }

  const body = {
    operation: "sync_all",
    payload: {
      dryRun: args.dryRun,
    },
  };

  console.log("Triggering Client Externals phone snapshot backfill", {
    endpoint: args.endpoint,
    dryRun: args.dryRun,
  });

  const response = await fetch(args.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-airtable-secret": secret,
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
