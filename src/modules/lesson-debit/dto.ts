export type LessonDebitRequestDto = {
  recordId: string;
  idempotencyKey?: string;
};

export type LessonDebitResult = "succeeded" | "noop";
export type LessonDebitWritebackStatus = "Succeeded" | "Failed";
export type LessonDebitFailureStage = "validation" | "execution" | "writeback";

export type LessonDebitSuccessResponseDto = {
  ok: true;
  endpoint: "/api/lessons/debit";
  recordId: string;
  result: LessonDebitResult;
  ledgerEntryId?: string;
  deltaCredits?: number;
  writebackStatus: LessonDebitWritebackStatus;
};

export type LessonDebitFailureResponseDto = {
  ok: false;
  endpoint: "/api/lessons/debit";
  recordId: string;
  stage: LessonDebitFailureStage;
  error: string;
};

export type LessonDebitResponseDto =
  | LessonDebitSuccessResponseDto
  | LessonDebitFailureResponseDto;

export type LessonDebitLedgerEntryDto = {
  recordId: string;
  entryType: string | null;
  deltaCredits: number | null;
  lessonDebitSourceKey: string | null;
};

export type LessonDebitLessonRecordDto = {
  recordId: string;
  status: string | null;
  expectedLessonCreditCost: number | null;
  expectedDebitCredits: number | null;
  payingCreditAccountId: string | null;
  hasLessonDebit: boolean;
  hasLockDebitViaReservation: boolean;
  hasCreditLedgerImpactingException: boolean;
};
