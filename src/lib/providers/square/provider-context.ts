import { SyncEndpointError } from "@/lib/errors";
import type { SquareAuthContext, SquareProviderContext } from "./types";

type OrgIntegrationRecord = {
  provider: string | null;
  providerAccountId: string | null;
  accessToken: string | null;
  externalLocationId: string | null;
};

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

function resolveAccessTokenByAlias(
  aliasMap: Record<string, string>,
  requestedAlias: string,
): string | null {
  const direct = aliasMap[requestedAlias];
  if (direct) return direct;

  const normalizedRequested = requestedAlias.trim().toLowerCase();
  if (!normalizedRequested) return null;

  for (const [key, value] of Object.entries(aliasMap)) {
    if (key.trim().toLowerCase() === normalizedRequested) return value;
  }

  const aliases = Object.keys(aliasMap);
  if (aliases.length === 1) {
    return aliasMap[aliases[0]];
  }

  return null;
}

export function resolveSquareProviderContext(
  orgIntegration: OrgIntegrationRecord,
  action: string,
): SquareProviderContext {
  const provider = orgIntegration.provider?.toLowerCase();
  if (provider !== "square") {
    throw new SyncEndpointError("Unsupported provider.", 422);
  }

  if (!orgIntegration.providerAccountId) {
    throw new SyncEndpointError("Missing provider account.", 422);
  }

  if (!orgIntegration.accessToken) {
    throw new SyncEndpointError("Org Integration missing Access Token alias.", 422);
  }

  if (!orgIntegration.externalLocationId) {
    throw new SyncEndpointError(
      `Org Integration missing external location ID for ${action}.`,
      422,
    );
  }

  const aliasMap = readAliasToTokenMap();
  const accessToken = resolveAccessTokenByAlias(aliasMap, orgIntegration.accessToken);
  if (!accessToken) {
    throw new SyncEndpointError(
      `No Square token configured for alias '${orgIntegration.accessToken}'.`,
      422,
    );
  }

  return {
    provider: "Square",
    providerAccountId: orgIntegration.providerAccountId,
    accessTokenAlias: orgIntegration.accessToken,
    accessToken,
    externalLocationId: orgIntegration.externalLocationId,
  };
}

export function resolveSquareAuthContextFromAlias(accessTokenAlias: string): SquareAuthContext {
  const alias = accessTokenAlias.trim();
  if (!alias) {
    throw new SyncEndpointError("Missing Square access token alias.", 422);
  }

  const aliasMap = readAliasToTokenMap();
  const accessToken = resolveAccessTokenByAlias(aliasMap, alias);
  if (!accessToken) {
    throw new SyncEndpointError(
      `No Square token configured for alias '${alias}'.`,
      422,
    );
  }

  return {
    provider: "Square",
    providerAccountId: alias,
    accessTokenAlias: alias,
    accessToken,
  };
}
