export type CreditLedgerEntryType =
  | "Purchase Credit"
  | "Lesson Debit"
  | "Credit Forfeit"
  | "Refund Debit"
  | "Reservation Lock Debit"
  | "Adjustment";

export type AppendCreditLedgerEntryRequestDto = {
  creditAccountRecordId: string;
  deltaCredits: number;
  entryType: CreditLedgerEntryType;
  occurredAt?: string;
  notes?: string;
  createdVia?: string;
  orderItemRecordId?: string;
  lessonRecordId?: string;
  refundItemRecordId?: string;
  creditReservationRecordId?: string;
};

export type AppendCreditLedgerEntryResponseDto = {
  ok: true;
  creditLedgerEntryRecordId: string;
  created: boolean;
};

export type AppendPurchaseCreditEntriesInputDto = {
  orderRecordId: string;
  occurredAt?: string;
  notes?: string;
};

export type AppendPurchaseCreditEntriesResultDto = {
  orderRecordId: string;
  creditAccountRecordId: string;
  totalOrderItemsEvaluated: number;
  entriesCreated: number;
  entriesReused: number;
};

export type AppendLessonDebitRequestDto = {
  lessonRecordId: string;
  creditAccountRecordId?: string;
  clientProfileRecordId?: string;
  occurredAt?: string;
  notes?: string;
};

export type AppendLessonDebitResponseDto = AppendCreditLedgerEntryResponseDto & {
  creditAccountRecordId: string;
  lessonRecordId: string;
  deltaCredits: number;
};

export type CreditLedgerEntriesErrorResponseDto = {
  ok: false;
  error: string;
};
