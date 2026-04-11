export type CreditAccountStatus = "Active" | "Paused" | "Closed";

export type EnsureCreditAccountRequestDto = {
  clientProfileRecordId: string;
};

export type EnsureCreditAccountResponseDto = {
  ok: true;
  creditAccountRecordId: string;
  created: boolean;
};

export type CreditAccountsErrorResponseDto = {
  ok: false;
  error: string;
};

export type CreditAccountRecordDto = {
  recordId: string;
  clientProfileId: string | null;
  organizationId: string | null;
  clientId: string | null;
  status: CreditAccountStatus | null;
  notes: string | null;
  balanceCredits: number | null;
};
