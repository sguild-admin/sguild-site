export type ProviderAccountStatus = "Setup" | "Active" | "Paused" | "Disabled";

export type ProviderAccountRecordDto = {
  recordId: string;
  provider: string | null;
  providerAccountName: string | null;
  providerAccountId: string | null;
  status: ProviderAccountStatus | null;
  notes: string | null;
  apiBaseUrl: string | null;
  apiCredentialAlias: string | null;
  webhookSigningSecretAlias: string | null;
  webhookCredentialId: string | null;
  orgIntegrationIds: string[];
  externalActionIds: string[];
  clientExternalIds: string[];
  configStatus: string;
  hasException: boolean;
  exceptionReason: string | null;
};

export type CreateProviderAccountDto = {
  provider: string;
  providerAccountName: string;
  providerAccountId: string;
  status?: ProviderAccountStatus;
  notes?: string;
  apiBaseUrl?: string;
  apiCredentialAlias?: string;
  webhookSigningSecretAlias?: string;
  webhookCredentialId?: string;
};

export type UpdateProviderAccountDto = {
  recordId: string;
  provider?: string;
  providerAccountName?: string;
  providerAccountId?: string;
  status?: ProviderAccountStatus;
  notes?: string;
  apiBaseUrl?: string;
  apiCredentialAlias?: string;
  webhookSigningSecretAlias?: string;
  webhookCredentialId?: string;
};

export type FindProviderAccountByKeyDto = {
  provider: string;
  providerAccountId: string;
};

export type ProviderAccountsRequestDto =
  | { operation: "create"; payload: CreateProviderAccountDto }
  | { operation: "update"; payload: UpdateProviderAccountDto }
  | { operation: "get"; payload: { recordId: string } }
  | { operation: "find_by_key"; payload: FindProviderAccountByKeyDto };

export type ProviderAccountsResponseDto =
  | { ok: true; operation: "create"; record: ProviderAccountRecordDto }
  | { ok: true; operation: "update"; record: ProviderAccountRecordDto }
  | { ok: true; operation: "get"; record: ProviderAccountRecordDto }
  | { ok: true; operation: "find_by_key"; record: ProviderAccountRecordDto | null };

export type ProviderAccountsErrorResponseDto = {
  ok: false;
  error: string;
};
