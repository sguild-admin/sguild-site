import { validateAirtableSecret } from "@/modules/clients/client.repo";
import { runOrderBillingProcessor } from "./service";

export function validateOrdersSecret(request: Request): void {
  validateAirtableSecret(request);
}

export async function processOrderBilling(
  request: Parameters<typeof runOrderBillingProcessor>[0],
) {
  return runOrderBillingProcessor(request);
}
