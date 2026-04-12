import { SyncEndpointError } from "@/lib/errors";
import { airtableRequest, escapeAirtableFormulaString, parseAirtableError } from "@/lib/airtable/client";
import { airtableSchema } from "@/config/airtable-schema";

const APP_CONFIG_TABLE_DEFAULT = airtableSchema.operations.tables.appConfig;
const APP_CONFIG_TABLE_FALLBACK = "App-Config";
const APP_CONFIG_KEY_VALUE = "App Config";
const APP_CONFIG_FIELDS = airtableSchema.operations.fields.appConfig;

type AirtableRecord = {
  id: string;
  fields?: Record<string, unknown>;
};

type Scope = "core" | "operations";
type Target = { tableName: string; scope: Scope };

function getTableCandidates(): string[] {
  const configured = process.env.APP_CONFIG_TABLE_NAME?.trim();
  const candidates = [configured, APP_CONFIG_TABLE_DEFAULT, APP_CONFIG_TABLE_FALLBACK]
    .filter((name): name is string => typeof name === "string" && name.length > 0);
  return [...new Set(candidates)];
}

const TARGET_CANDIDATES: Scope[] = ["core", "operations"];

async function resolveAppConfigTarget(preferredRecordId?: string): Promise<{
  target: Target;
  recordId: string;
}> {
  const provided = preferredRecordId?.trim();
  const tables = getTableCandidates();
  const errors: string[] = [];

  if (provided) {
    for (const scope of TARGET_CANDIDATES) {
      for (const tableName of tables) {
        const response = await airtableRequest(
          `${encodeURIComponent(tableName)}/${encodeURIComponent(provided)}`,
          { method: "GET", __scope: scope },
        );
        if (response.ok) {
          return {
            target: { tableName, scope },
            recordId: provided,
          };
        }
        const message = await parseAirtableError(response);
        errors.push(`[${scope}] ${tableName}: ${message}`);
      }
    }

    throw new SyncEndpointError(
      `Failed to load App-Config record '${provided}'. ${errors[0] ?? "Unknown lookup error."}`,
      502,
    );
  }

  for (const scope of TARGET_CANDIDATES) {
    for (const tableName of tables) {
      const configKeyFormula = `{${APP_CONFIG_FIELDS.configKey}}='${escapeAirtableFormulaString(APP_CONFIG_KEY_VALUE)}'`;
      const response = await airtableRequest(
        `${encodeURIComponent(tableName)}?${new URLSearchParams({
          pageSize: "1",
          filterByFormula: configKeyFormula,
        }).toString()}`,
        { method: "GET", __scope: scope },
      );
      if (!response.ok) {
        const message = await parseAirtableError(response);
        errors.push(`[${scope}] ${tableName}: ${message}`);
      } else {
        const body = (await response.json()) as { records?: AirtableRecord[] };
        const first = body.records?.[0];
        if (first?.id) {
          return {
            target: { tableName, scope },
            recordId: first.id,
          };
        }
      }
    }
  }

  // Fallback for bases that have table but not Config Key field populated yet.
  for (const scope of TARGET_CANDIDATES) {
    for (const tableName of tables) {
      const response = await airtableRequest(
        `${encodeURIComponent(tableName)}?${new URLSearchParams({ pageSize: "1" }).toString()}`,
        { method: "GET", __scope: scope },
      );
      if (!response.ok) {
        const message = await parseAirtableError(response);
        errors.push(`[${scope}] ${tableName}: ${message}`);
      } else {
        const body = (await response.json()) as { records?: AirtableRecord[] };
        const first = body.records?.[0];
        if (first?.id) {
          return {
            target: { tableName, scope },
            recordId: first.id,
          };
        }
      }
    }
  }

  throw new SyncEndpointError(
    `Failed to load App-Config record: ${errors[0] ?? "No App-Config records found in candidate tables."}`,
    502,
  );
}

async function writeLastTestResult(input: {
  status: "passed" | "failed";
  error: string;
  testedAt: string;
  appConfigRecordId?: string;
}): Promise<void> {
  const resolved = await resolveAppConfigTarget(input.appConfigRecordId);
  const statusCandidates = input.status === "passed" ? ["passed", "Passed"] : ["failed", "Failed"];
  let lastMessage = "Unknown Airtable error.";

  for (const statusValue of statusCandidates) {
    const response = await airtableRequest(
      `${encodeURIComponent(resolved.target.tableName)}/${encodeURIComponent(resolved.recordId)}`,
      {
        method: "PATCH",
        __scope: resolved.target.scope,
        body: JSON.stringify({
          fields: {
            [APP_CONFIG_FIELDS.lastTestStatus]: statusValue,
            [APP_CONFIG_FIELDS.lastTestError]: input.error,
            [APP_CONFIG_FIELDS.lastTestAt]: input.testedAt,
          },
        }),
      },
    );

    if (response.ok) return;
    lastMessage = await parseAirtableError(response);
  }

  throw new SyncEndpointError(`Failed to update App-Config test result: ${lastMessage}`, 502);
}

export const appConfigRepo = {
  writeLastTestResult,
};
