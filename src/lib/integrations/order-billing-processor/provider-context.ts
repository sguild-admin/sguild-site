import { OrgIntegrationRecord } from "./airtable";
import { BillingAction, SyncEndpointError } from "./response";

export type ProviderContext = {
  provider: "Square";
  providerAccountId: string;
  accessToken: string;
  externalLocationId: string;
};

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
    throw new SyncEndpointError("Org Integration missing provider token.", 422);
  }

  if (!orgIntegration.externalLocationId) {
    throw new SyncEndpointError(
      `Org Integration missing external location ID for ${action}.`,
      422,
    );
  }

  return {
    provider: "Square",
    providerAccountId: orgIntegration.providerAccountId,
    accessToken: orgIntegration.accessToken,
    externalLocationId: orgIntegration.externalLocationId,
  };
}

