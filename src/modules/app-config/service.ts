import { SyncEndpointError } from "@/lib/errors";
import { parseAliasMapFromJson } from "./schema";
import { appConfigRepo } from "./repo";

type AliasMapConfig = {
  envName: string;
  missingMessage: string;
  invalidJsonMessage: string;
  invalidShapeMessage: string;
};

const SQUARE_ACCESS_TOKEN_MAP_CONFIG: AliasMapConfig = {
  envName: "SQUARE_ACCESS_TOKENS_BY_ALIAS_JSON",
  missingMessage: "Square token routing config is missing.",
  invalidJsonMessage: "Square token routing config is invalid JSON.",
  invalidShapeMessage: "Square token routing config has invalid shape.",
};

const AIRTABLE_SYNC_SECRET_MAP_CONFIG: AliasMapConfig = {
  envName: "AIRTABLE_SYNC_SECRET_BY_ALIAS_JSON",
  missingMessage: "Airtable sync secret alias map is not configured.",
  invalidJsonMessage: "Airtable sync secret alias map is invalid JSON.",
  invalidShapeMessage: "Airtable sync secret alias map has invalid shape.",
};

function readAliasMapFromEnv(config: AliasMapConfig): Record<string, string> {
  const raw = process.env[config.envName];
  if (!raw || raw.trim().length === 0) {
    throw new SyncEndpointError(config.missingMessage, 500, {
      exposeMessage: false,
    });
  }

  return parseAliasMapFromJson(raw, {
    invalidJsonMessage: config.invalidJsonMessage,
    invalidShapeMessage: config.invalidShapeMessage,
  });
}

export function readSquareAccessTokenAliasMap(): Record<string, string> {
  return readAliasMapFromEnv(SQUARE_ACCESS_TOKEN_MAP_CONFIG);
}

export function readAirtableSyncSecretAliasMap(): Record<string, string> {
  return readAliasMapFromEnv(AIRTABLE_SYNC_SECRET_MAP_CONFIG);
}

type AliasMapLoadSummary = {
  loaded: boolean;
  aliasCount: number | null;
};

function summarizeAliasMapLoad(load: () => Record<string, string>): AliasMapLoadSummary {
  try {
    const map = load();
    return {
      loaded: true,
      aliasCount: Object.keys(map).length,
    };
  } catch {
    return {
      loaded: false,
      aliasCount: null,
    };
  }
}

export function readAppConfigHealth() {
  const airtable = summarizeAliasMapLoad(readAirtableSyncSecretAliasMap);
  const square = summarizeAliasMapLoad(readSquareAccessTokenAliasMap);

  return {
    airtableSyncSecretAliasMapLoaded: airtable.loaded,
    airtableSyncSecretAliasCount: airtable.aliasCount,
    squareAccessTokenAliasMapLoaded: square.loaded,
    squareAccessTokenAliasCount: square.aliasCount,
  };
}

export function testAliasConfigured(input: { config: "airtable" | "square"; alias: string }): boolean {
  const map =
    input.config === "airtable"
      ? readAirtableSyncSecretAliasMap()
      : readSquareAccessTokenAliasMap();
  return Boolean(map[input.alias]);
}

export async function recordAppConfigTestResult(input: {
  status: "passed" | "failed";
  error: string;
  testedAt: string;
  appConfigRecordId?: string;
}): Promise<void> {
  await appConfigRepo.writeLastTestResult(input);
}
