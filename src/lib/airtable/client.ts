import { SyncEndpointError } from "@/lib/errors";
import { isRetryableAirtableStatus, parseAirtableError } from "@/lib/airtable/errors";

export type AirtableRequestInit = RequestInit & { __scope?: "operations" | "core" };
type AirtableScope = "operations" | "core";

type AirtableConfig = {
  token: string;
  baseId: string;
};

type AirtableConfigCandidate = AirtableConfig & {
  tokenSource: string;
  baseSource: string;
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

function readEnvValue(name: string): string | null {
  return readString(process.env[name]);
}

function listEnvCandidates(names: string[]): Array<{ name: string; value: string }> {
  const candidates: Array<{ name: string; value: string }> = [];
  for (const name of names) {
    const value = readEnvValue(name);
    if (!value) continue;
    candidates.push({ name, value });
  }
  return candidates;
}

function buildAirtableConfigCandidates(scope: AirtableScope): AirtableConfigCandidate[] {
  const tokenEnvNames = scope === "core"
    ? ["AIRTABLE_LEADS_TOKEN", "AIRTABLE_TOKEN", "AIRTABLE_OPERATIONS_TOKEN"]
    : ["AIRTABLE_OPERATIONS_TOKEN", "AIRTABLE_TOKEN"];
  const baseEnvNames = scope === "core"
    ? ["AIRTABLE_LEADS_BASE_ID", "AIRTABLE_BASE_ID", "AIRTABLE_OPERATIONS_BASE_ID"]
    : ["AIRTABLE_OPERATIONS_BASE_ID", "AIRTABLE_BASE_ID"];

  const tokens = listEnvCandidates(tokenEnvNames);
  const bases = listEnvCandidates(baseEnvNames);
  if (tokens.length === 0 || bases.length === 0) return [];

  const primaryBase = bases[0];
  return tokens.map((candidate) => ({
    token: candidate.value,
    baseId: primaryBase.value,
    tokenSource: candidate.name,
    baseSource: primaryBase.name,
  }));
}

export function getAirtableConfig(scope: AirtableScope = "operations"): AirtableConfig {
  const candidate = buildAirtableConfigCandidates(scope)[0];
  const token = candidate?.token ?? null;
  const baseId = candidate?.baseId ?? null;

  if (!token || !baseId) {
    throw new SyncEndpointError("Airtable configuration is missing.", 500, {
      exposeMessage: false,
    });
  }

  return { token, baseId };
}

export { parseAirtableError };

async function isAuthFailureResponse(response: Response): Promise<boolean> {
  if (response.status === 401) return true;
  if (response.status !== 403) return false;

  const message = (await parseAirtableError(response.clone())).toLowerCase();
  return (
    message.includes("authentication") ||
    message.includes("invalid auth") ||
    message.includes("permission") ||
    message.includes("not authorized")
  );
}

export async function airtableRequest(path: string, init?: AirtableRequestInit): Promise<Response> {
  const typedInit = (init ?? {}) as AirtableRequestInit;
  const scope: AirtableScope = typedInit.__scope ?? "operations";
  const configCandidates = buildAirtableConfigCandidates(scope);
  if (configCandidates.length === 0) {
    throw new SyncEndpointError("Airtable configuration is missing.", 500, {
      exposeMessage: false,
    });
  }

  const requestInit: RequestInit = { ...typedInit };
  delete (requestInit as Record<string, unknown>).__scope;
  let lastError: unknown = null;

  for (let candidateIndex = 0; candidateIndex < configCandidates.length; candidateIndex += 1) {
    const candidate = configCandidates[candidateIndex];
    const maxAttempts = 3;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const response = await fetch(`https://api.airtable.com/v0/${candidate.baseId}/${path}`, {
          ...requestInit,
          headers: {
            Authorization: `Bearer ${candidate.token}`,
            "Content-Type": "application/json",
            ...(requestInit.headers ?? {}),
          },
          cache: "no-store",
        });

        const retryableStatus = isRetryableAirtableStatus(response.status);
        if (retryableStatus && attempt < maxAttempts) {
          const backoffMs = attempt * 250;
          await new Promise((resolve) => setTimeout(resolve, backoffMs));
          continue;
        }

        const shouldTryNextToken =
          candidateIndex < configCandidates.length - 1 &&
          await isAuthFailureResponse(response);
        if (shouldTryNextToken) {
          break;
        }

        return response;
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
