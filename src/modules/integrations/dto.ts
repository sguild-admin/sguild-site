import type { BillingAction } from "@/lib/types/billing";

export type BillingProviderAction = BillingAction;

export type BillingProviderContextRequestDto = {
  orgIntegrationRecordId: string;
  action: BillingProviderAction;
};

export type SyncRecordRequestDto = {
  recordId: string;
};

