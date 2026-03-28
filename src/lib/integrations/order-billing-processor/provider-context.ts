import { OrgIntegrationRecord } from "./airtable";
import { BillingAction, SyncEndpointError } from "./response";

export type ProviderContext = {
  provider: "Square";
  providerAccountId: string;
  accessTokenAlias: string;
  accessToken: string;
  externalLocationId: string;
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

export function resolveProviderContext(
  orgIntegration: OrgIntegrationRecord,
  action: BillingAction,
): ProviderContext {
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
  const accessToken = aliasMap[orgIntegration.accessToken];
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
