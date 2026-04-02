import {
  countExternalActionsByInvoiceExternal,
  countExternalActionsByOrderExternal,
  createExternalAction,
  findInboundExternalActionByIdentity,
  getIntegrationRecord,
  resolveIntegrationProviderContext,
  updateExternalAction,
  validateIntegrationSecret,
} from "./repo";
import type { BillingProviderContextRequestDto } from "./dto";

export async function getBillingProviderContext(input: BillingProviderContextRequestDto) {
  const orgIntegration = await getIntegrationRecord(input.orgIntegrationRecordId);
  return resolveIntegrationProviderContext(orgIntegration, input.action);
}

export function assertAuthorizedSyncRequest(request: Request): void {
  validateIntegrationSecret(request);
}

export {
  countExternalActionsByInvoiceExternal,
  countExternalActionsByOrderExternal,
  createExternalAction,
  findInboundExternalActionByIdentity,
  updateExternalAction,
};
