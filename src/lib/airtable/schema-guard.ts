import { airtableSchema } from "@/config/airtable-schema";
import { SyncEndpointError } from "@/lib/errors";

type AirtableErrorBody = {
  error?: {
    message?: string;
  };
};

type SchemaScope = "operations" | "core";

const validationCache = new Map<string, Promise<void>>();

function getSchemaValidationPlan(scope: SchemaScope): {
  tables: string[];
  requiredFieldsByTable: Record<string, string[]>;
} {
  if (scope === "operations") {
    const tables = airtableSchema.operations.tables;
    return {
      tables: Object.values(tables),
      requiredFieldsByTable: {
        [tables.clientProfiles]: [
          airtableSchema.operations.fields.clientProfiles.clientLink,
          airtableSchema.operations.fields.clientProfiles.lessonSummaryLink,
        ],
        [tables.clientLessonSummaries]: [
          airtableSchema.operations.fields.clientLessonSummaries.profileLink,
          airtableSchema.operations.fields.clientLessonSummaries.lastLessonAt,
          airtableSchema.operations.fields.clientLessonSummaries.nextLessonAt,
          airtableSchema.operations.fields.clientLessonSummaries.completedLessonCount,
          airtableSchema.operations.fields.clientLessonSummaries.canceledLessonCount,
          airtableSchema.operations.fields.clientLessonSummaries.noShowLessonCount,
          airtableSchema.operations.fields.clientLessonSummaries.scheduledFutureLessonCount,
          airtableSchema.operations.fields.clientLessonSummaries.lastLessonStatus,
          airtableSchema.operations.fields.clientLessonSummaries.lastRefreshedAt,
          airtableSchema.operations.fields.clientLessonSummaries.needsRefresh,
          airtableSchema.operations.fields.clientLessonSummaries.syncStatus,
          airtableSchema.operations.fields.clientLessonSummaries.syncError,
        ],
        [tables.lessons]: [
          airtableSchema.operations.fields.lessons.profileLink,
          airtableSchema.operations.fields.lessons.status,
          airtableSchema.operations.fields.lessons.startAt,
        ],
      },
    };
  }

  return {
    tables: Object.values(airtableSchema.core.tables),
    requiredFieldsByTable: {},
  };
}

async function parseAirtableError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as AirtableErrorBody;
    const message = body.error?.message?.trim();
    if (message) return message;
  } catch {
    // fall through
  }

  const fallback = response.statusText?.trim();
  return fallback || "Unknown Airtable error";
}

async function assertTableAccessible(input: {
  baseId: string;
  token: string;
  tableName: string;
  scope: SchemaScope;
}): Promise<void> {
  const params = new URLSearchParams({ maxRecords: "1" });
  const response = await fetch(
    `https://api.airtable.com/v0/${input.baseId}/${encodeURIComponent(input.tableName)}?${params.toString()}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${input.token}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    },
  );

  if (response.ok) return;

  const message = await parseAirtableError(response);
  throw new SyncEndpointError(
    `Airtable schema check failed for ${input.scope} base: table "${input.tableName}" is missing or inaccessible (${message}).`,
    500,
  );
}

async function assertRequiredFieldsAccessible(input: {
  baseId: string;
  token: string;
  tableName: string;
  requiredFields: string[];
  scope: SchemaScope;
}): Promise<void> {
  if (input.requiredFields.length === 0) return;

  const params = new URLSearchParams({ maxRecords: "1" });
  for (const fieldName of input.requiredFields) {
    params.append("fields[]", fieldName);
  }

  const response = await fetch(
    `https://api.airtable.com/v0/${input.baseId}/${encodeURIComponent(input.tableName)}?${params.toString()}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${input.token}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    },
  );

  if (response.ok) return;

  const message = await parseAirtableError(response);
  throw new SyncEndpointError(
    `Airtable schema check failed for ${input.scope} base: required field mismatch on table "${input.tableName}" (${message}).`,
    500,
  );
}

async function runValidation(input: {
  baseId: string;
  token: string;
  scope: SchemaScope;
}): Promise<void> {
  const plan = getSchemaValidationPlan(input.scope);

  for (const tableName of plan.tables) {
    await assertTableAccessible({
      baseId: input.baseId,
      token: input.token,
      tableName,
      scope: input.scope,
    });
  }

  for (const [tableName, requiredFields] of Object.entries(plan.requiredFieldsByTable)) {
    await assertRequiredFieldsAccessible({
      baseId: input.baseId,
      token: input.token,
      tableName,
      requiredFields,
      scope: input.scope,
    });
  }
}

export async function ensureAirtableSchemaValidated(input: {
  baseId: string;
  token: string;
  scope: SchemaScope;
}): Promise<void> {
  const key = `${input.scope}:${input.baseId}`;
  const existing = validationCache.get(key);
  if (existing) return existing;

  const pending = runValidation(input);
  validationCache.set(key, pending);

  try {
    await pending;
  } catch (error) {
    validationCache.delete(key);
    throw error;
  }
}
