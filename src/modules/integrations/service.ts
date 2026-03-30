import {
  getIntegrationRecord,
  resolveIntegrationProviderContext,
  validateIntegrationSecret,
} from "./repo";

export async function getBillingProviderContext(input: {
  orgIntegrationRecordId: string;
  action: "Create Order" | "Create Invoice" | "Charge" | "Refund" | "Cancel" | "Invoice" | "Authentication";
}) {
  const orgIntegration = await getIntegrationRecord(input.orgIntegrationRecordId);
  return resolveIntegrationProviderContext(orgIntegration, input.action);
}

export function assertAuthorizedSyncRequest(request: Request): void {
  validateIntegrationSecret(request);
}
