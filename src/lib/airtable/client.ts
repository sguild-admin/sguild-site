import { SyncEndpointError } from "@/lib/errors";
import { isRetryableAirtableStatus, parseAirtableError } from "@/lib/airtable/errors";

export type AirtableRequestInit = RequestInit & { __scope?: "operations" | "core" };

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

export function getAirtableConfig(scope: "operations" | "core" = "operations"): { token: string; baseId: string } {
  const token = scope === "core"
    ? (
      readString(process.env.AIRTABLE_LEADS_TOKEN) ??
      readString(process.env.AIRTABLE_TOKEN) ??
      readString(process.env.AIRTABLE_OPERATIONS_TOKEN)
    )
    : (readString(process.env.AIRTABLE_OPERATIONS_TOKEN) ?? readString(process.env.AIRTABLE_TOKEN));
  const baseId = scope === "core"
    ? (
      readString(process.env.AIRTABLE_LEADS_BASE_ID) ??
      readString(process.env.AIRTABLE_BASE_ID) ??
      readString(process.env.AIRTABLE_OPERATIONS_BASE_ID)
    )
    : (readString(process.env.AIRTABLE_OPERATIONS_BASE_ID) ?? readString(process.env.AIRTABLE_BASE_ID));

  if (!token || !baseId) {
    throw new SyncEndpointError("Airtable configuration is missing.", 500, {
      exposeMessage: false,
    });
  }

  return { token, baseId };
}

export { parseAirtableError };

export async function airtableRequest(path: string, init?: AirtableRequestInit): Promise<Response> {
  const typedInit = (init ?? {}) as AirtableRequestInit;
  const { token, baseId } = getAirtableConfig(typedInit.__scope ?? "operations");
  const requestInit: RequestInit = { ...typedInit };
  delete (requestInit as Record<string, unknown>).__scope;
  const maxAttempts = 3;
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetch(`https://api.airtable.com/v0/${baseId}/${path}`, {
        ...requestInit,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          ...(requestInit.headers ?? {}),
        },
        cache: "no-store",
      });

      const retryableStatus = isRetryableAirtableStatus(response.status);
      if (!retryableStatus || attempt === maxAttempts) {
        return response;
      }
    } catch (error) {
      lastError = error;
      if (attempt === maxAttempts) {
        throw new SyncEndpointError("Airtable request failed to reach upstream.", 502, {
          exposeMessage: true,
          rawPayload: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const backoffMs = attempt * 250;
    await new Promise((resolve) => setTimeout(resolve, backoffMs));
  }

  throw new SyncEndpointError("Airtable request failed after retries.", 502, {
    exposeMessage: true,
    rawPayload: lastError instanceof Error ? lastError.message : String(lastError),
  });
}

export function escapeAirtableFormulaString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

export async function paginateAirtable<T>(input: {
  tableName: string;
  pageSize?: number;
  filterByFormula?: string;
  mapRecord: (record: { id: string; fields?: Record<string, unknown> }) => T;
}): Promise<T[]> {
  const rows: T[] = [];
  let offset: string | undefined;

  do {
    const params = new URLSearchParams({
      pageSize: String(input.pageSize ?? 100),
    });
    if (input.filterByFormula) params.set("filterByFormula", input.filterByFormula);
    if (offset) params.set("offset", offset);

    const response = await airtableRequest(
      `${encodeURIComponent(input.tableName)}?${params.toString()}`,
      { method: "GET" },
    );
    if (!response.ok) {
      const message = await parseAirtableError(response);
      throw new SyncEndpointError(`Failed to paginate Airtable table "${input.tableName}": ${message}`, 502);
    }

    const body = (await response.json()) as {
      records?: Array<{ id: string; fields?: Record<string, unknown> }>;
      offset?: string;
    };
    for (const record of body.records ?? []) {
      rows.push(input.mapRecord(record));
    }
    offset = body.offset;
  } while (offset);

  return rows;
}
