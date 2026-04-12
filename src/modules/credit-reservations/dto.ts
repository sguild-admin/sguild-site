export type CreditReservationStatus =
  | "Reserved"
  | "Locked"
  | "Consumed"
  | "Released"
  | "Voided";

export type CreditReservationResolutionReason =
  | "Lesson Completed"
  | "Lesson Canceled"
  | "Lesson No-Show"
  | "Policy Release"
  | "Administrative Void";

export type CreateCreditReservationRequestDto = {
  recordId: string;
  idempotencyKey?: string;
};

export type CreateCreditReservationResult = "succeeded" | "noop";
export type CreateCreditReservationWritebackStatus = "Succeeded" | "Failed";

export type CreditReservationFailureStage =
  | "validation"
  | "execution"
  | "writeback"
  | "ambiguity";

export type CreateCreditReservationSuccessResponseDto = {
  ok: true;
  endpoint: "/api/reservations/create";
  recordId: string;
  result: CreateCreditReservationResult;
  reservationId: string;
  reservedCredits: number;
  writebackStatus: CreateCreditReservationWritebackStatus;
};

export type CreateCreditReservationFailureResponseDto = {
  ok: false;
  endpoint: "/api/reservations/create";
  recordId: string;
  stage: CreditReservationFailureStage;
  error: string;
};

export type CreateCreditReservationResponseDto =
  | CreateCreditReservationSuccessResponseDto
  | CreateCreditReservationFailureResponseDto;

export type ReservationLockRequestDto = {
  recordId: string;
  idempotencyKey?: string;
};

export type ReservationLockResult = "succeeded" | "noop";
export type ReservationLockWritebackStatus = "Succeeded" | "Failed";

export type ReservationLockSuccessResponseDto = {
  ok: true;
  endpoint: "/api/reservations/lock";
  recordId: string;
  result: ReservationLockResult;
  ledgerEntryId?: string;
  deltaCredits?: number;
  writebackStatus: ReservationLockWritebackStatus;
};

export type ReservationLockFailureResponseDto = {
  ok: false;
  endpoint: "/api/reservations/lock";
  recordId: string;
  stage: CreditReservationFailureStage;
  error: string;
};

export type ReservationLockResponseDto =
  | ReservationLockSuccessResponseDto
  | ReservationLockFailureResponseDto;

export type ReservationReleaseResolutionReason = "Lesson Canceled" | "Policy Release";

export type ReservationReleaseRequestDto = {
  recordId: string;
  resolutionReason: ReservationReleaseResolutionReason;
  notes?: string;
  idempotencyKey?: string;
};

export type ReservationReleaseResult = "succeeded" | "noop";
export type ReservationReleaseWritebackStatus = "Succeeded" | "Failed";

export type ReservationReleaseSuccessResponseDto = {
  ok: true;
  endpoint: "/api/reservations/release";
  recordId: string;
  result: ReservationReleaseResult;
  priorStatus: "Reserved" | "Locked" | null;
  reversalCreated: boolean;
  reversalEntryId: string | null;
  writebackStatus: ReservationReleaseWritebackStatus;
};

export type ReservationReleaseFailureResponseDto = {
  ok: false;
  endpoint: "/api/reservations/release";
  recordId: string;
  stage: CreditReservationFailureStage;
  error: string;
};

export type ReservationReleaseResponseDto =
  | ReservationReleaseSuccessResponseDto
  | ReservationReleaseFailureResponseDto;

export type ReservationVoidRequestDto = {
  recordId: string;
  notes?: string;
  force?: boolean;
  idempotencyKey?: string;
};

export type ReservationVoidResult = "succeeded" | "noop";
export type ReservationVoidWritebackStatus = "Succeeded" | "Failed";

export type ReservationVoidSuccessResponseDto = {
  ok: true;
  endpoint: "/api/reservations/void";
  recordId: string;
  result: ReservationVoidResult;
  priorStatus: "Reserved" | "Locked" | null;
  reversalCreated: boolean;
  reversalEntryId: string | null;
  writebackStatus: ReservationVoidWritebackStatus;
};

export type ReservationVoidFailureResponseDto = {
  ok: false;
  endpoint: "/api/reservations/void";
  recordId: string;
  stage: CreditReservationFailureStage;
  error: string;
};

export type ReservationVoidResponseDto =
  | ReservationVoidSuccessResponseDto
  | ReservationVoidFailureResponseDto;
