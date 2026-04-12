import { SyncEndpointError } from "@/lib/errors";

function normalizeAliasMap(parsed: unknown, invalidShapeMessage: string): Record<string, string> {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new SyncEndpointError(invalidShapeMessage, 500, {
      exposeMessage: false,
    });
  }

  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (typeof value === "string" && value.trim().length > 0) {
      normalized[key] = value.trim();
    }
  }

  return normalized;
}

export function parseAliasMapFromJson(
  raw: string,
  input: {
    invalidJsonMessage: string;
    invalidShapeMessage: string;
  },
): Record<string, string> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new SyncEndpointError(input.invalidJsonMessage, 500, {
      exposeMessage: false,
    });
  }

  return normalizeAliasMap(parsed, input.invalidShapeMessage);
}

export type AppConfigAliasTestRequestDto = {
  config: "airtable" | "square";
  alias: string;
};

export function parseAppConfigAliasTestRequest(body: unknown): AppConfigAliasTestRequestDto {
  if (typeof body !== "object" || body == null || Array.isArray(body)) {
    throw new SyncEndpointError("Invalid request body.", 400);
  }

  const typed = body as { config?: unknown; provider?: unknown; target?: unknown; alias?: unknown };
  const configCandidate =
    (typeof typed.config === "string" ? typed.config : undefined) ??
    (typeof typed.provider === "string" ? typed.provider : undefined) ??
    (typeof typed.target === "string" ? typed.target : undefined) ??
    "airtable";
  const configRaw = configCandidate.trim().toLowerCase();
  if (configRaw !== "airtable" && configRaw !== "square") {
    throw new SyncEndpointError("Invalid config. Expected 'airtable' or 'square'.", 400);
  }

  const alias = typeof typed.alias === "string" ? typed.alias.trim() : "";
  if (!alias) {
    throw new SyncEndpointError("Missing alias.", 400);
  }

  return {
    config: configRaw,
    alias,
  };
}
