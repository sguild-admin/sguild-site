import { getOrgIntegrationRecord } from "./ports";
import { resolveProviderContext } from "@/lib/providers/square/provider-context";
import { validateAirtableSecret } from "@/modules/clients/client.repo";

export async function getIntegrationRecord(orgIntegrationRecordId: string) {
  return getOrgIntegrationRecord(orgIntegrationRecordId);
}

export function resolveIntegrationProviderContext(
  orgIntegration: Parameters<typeof resolveProviderContext>[0],
  action: Parameters<typeof resolveProviderContext>[1],
) {
  return resolveProviderContext(orgIntegration, action);
}

export function validateIntegrationSecret(request: Request): void {
  validateAirtableSecret(request);
}
