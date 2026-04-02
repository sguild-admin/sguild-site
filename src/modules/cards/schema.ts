import type { ClientExternalRecord } from "./repo";
import { SyncEndpointError } from "@/lib/errors";
import type { SquareAuthContext } from "@/lib/providers/square/types";

function readAliasToTokenMap(): Record<string, string> {
  const raw = process.env.SQUARE_ACCESS_TOKENS_BY_ALIAS_JSON;
  if (!raw) {
    throw new SyncEndpointError("Square token routing config is missing.", 500, {
      exposeMessage: false,
    });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new SyncEndpointError("Square token routing config is invalid JSON.", 500, {
      exposeMessage: false,
    });
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new SyncEndpointError("Square token routing config has invalid shape.", 500, {
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

export function resolveSquareContext(clientExternal: ClientExternalRecord): SquareAuthContext {
  const provider = clientExternal.provider?.toLowerCase();
  if (provider !== "square") {
    throw new SyncEndpointError("Unsupported provider.", 422);
  }

  if (!clientExternal.providerAccountId) {
    throw new SyncEndpointError("Missing provider account.", 422);
  }

  const alias = clientExternal.providerAccessTokenAlias;
  if (!alias) {
    throw new SyncEndpointError("Provider account missing Access Token alias.", 422);
  }

  const aliasMap = readAliasToTokenMap();
  const accessToken = aliasMap[alias];
  if (!accessToken) {
    throw new SyncEndpointError(`No Square token configured for alias '${alias}'.`, 422);
  }

  return {
    provider: "Square",
    providerAccountId: clientExternal.providerAccountId,
    accessTokenAlias: alias,
    accessToken,
  };
}

export function parseSyncRecordId(body: unknown): string {
  if (typeof body !== "object" || body == null || Array.isArray(body)) {
    throw new SyncEndpointError("Invalid request body.", 400);
  }

  const { recordId } = body as { recordId?: unknown };
  if (typeof recordId !== "string" || recordId.trim().length === 0) {
    throw new SyncEndpointError("Missing recordId.", 400);
  }

  return recordId.trim();
}
