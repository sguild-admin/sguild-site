export type RefundItemRecordIdRequestDto = {
  recordId: string;
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

export type RefundItemScaffoldErrorResponseDto = {
  ok: false;
  error: string;
};
