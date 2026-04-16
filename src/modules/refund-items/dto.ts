export type RefundItemRecordIdRequestDto = {
  recordId: string;
};

export type RefundItemDebitRequestDto = {
  recordId: string;
  idempotencyKey?: string;
};

export type RefundItemScaffoldRecordDto = {
  recordId: string;
  refundAmount: number | null;
  creditsRevoked: number | null;
  refundId: string | null;
  orderItemId: string | null;
  refundStatus: string | null;
  organization: string | null;
};

export type RefundItemDebitResult = "succeeded" | "noop";
export type RefundItemDebitWritebackStatus = "Succeeded";
export type RefundItemDebitFailureStage =
  | "validation"
  | "execution"
  | "writeback"
  | "ambiguity";

export type RefundItemDebitSuccessResponseDto = {
  ok: true;
  endpoint: "/api/refund-items/debit";
  recordId: string;
  result: RefundItemDebitResult;
  ledgerEntryId: string;
  deltaCredits: number;
  writebackStatus: RefundItemDebitWritebackStatus;
};

export type RefundItemDebitFailureResponseDto = {
  ok: false;
  endpoint: "/api/refund-items/debit";
  recordId: string;
  stage: RefundItemDebitFailureStage;
  error: string;
};

export type RefundItemDebitResponseDto =
  | RefundItemDebitSuccessResponseDto
  | RefundItemDebitFailureResponseDto;

export type RefundItemDebitLedgerEntryDto = {
  recordId: string;
  entryType: string | null;
  deltaCredits: number | null;
  refundItemId: string | null;
  refundDebitSourceKey: string | null;
};

export type RefundItemDebitRecordDto = {
  recordId: string;
  refundAmount: number | null;
  creditsRevoked: number | null;
  refundId: string | null;
  orderItemId: string | null;
  creditLedgerEntryIds: string[];
  refundStatus: string | null;
  organization: string | null;
  clientProfileId: string | null;
  clientId: string | null;
  orderId: string | null;
  orderItemCreditsGrantedTotal: number | null;
  hasRefundDebit: boolean;
  hasRefundImpactingException: boolean;
  refundDebitEligible: boolean;
  expectedRefundDebitCredits: number | null;
};

export type RefundItemScaffoldErrorResponseDto = {
  ok: false;
  error: string;
};
