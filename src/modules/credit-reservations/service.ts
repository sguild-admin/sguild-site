import { NextResponse } from "next/server";
import { SyncEndpointError } from "@/lib/errors";
import { assertJsonRequest, parseJsonBody } from "@/lib/http/request";
import { assertAuthorizedSyncRequest } from "@/modules/integrations";
import type {
  CreateCreditReservationFailureResponseDto,
  CreateCreditReservationRequestDto,
  CreateCreditReservationResponseDto,
  CreateCreditReservationSuccessResponseDto,
  CreditReservationFailureStage,
  ReservationLockFailureResponseDto,
  ReservationLockRequestDto,
  ReservationLockResponseDto,
  ReservationLockSuccessResponseDto,
  ReservationReleaseFailureResponseDto,
  ReservationReleaseRequestDto,
  ReservationReleaseResponseDto,
  ReservationReleaseSuccessResponseDto,
  ReservationVoidFailureResponseDto,
  ReservationVoidRequestDto,
  ReservationVoidResponseDto,
  ReservationVoidSuccessResponseDto,
} from "./dto";
import {
  parseCreateCreditReservationBody,
  parseReservationLockBody,
  parseReservationReleaseBody,
  parseReservationVoidBody,
} from "./schema";
import {
  createCreditReservation,
  createReservationLockEntry,
  createReservationLockReversal,
  findReversalByTargetLedgerEntry,
  getCreditAccountForReservationCreate,
  getCreditReservationById,
  getLessonForReservationCreate,
  listReservationsForLesson,
  listReservationLockEntries,
  updateReservationReleased,
  updateReservationStatusLocked,
  updateReservationVoided,
} from "./repo";

const CREATE_ENDPOINT = "/api/reservations/create";
const LOCK_ENDPOINT = "/api/reservations/lock";
const RELEASE_ENDPOINT = "/api/reservations/release";
const VOID_ENDPOINT = "/api/reservations/void";
const AUTO_LOCK_WINDOW_MS = 48 * 60 * 60 * 1000;

class CreditReservationEndpointError extends SyncEndpointError {
  readonly stage: CreditReservationFailureStage;
  readonly recordId: string;

  constructor(
    stage: CreditReservationFailureStage,
    recordId: string,
    message: string,
    status: number,
  ) {
    super(message, status);
    this.name = "CreditReservationEndpointError";
    this.stage = stage;
    this.recordId = recordId;
  }
}

function fail(
  stage: CreditReservationFailureStage,
  recordId: string,
  message: string,
  status = 422,
): never {
  throw new CreditReservationEndpointError(stage, recordId, message, status);
}

function normalizeStatus(value: string | null): string {
  return (value ?? "").trim().toLowerCase();
}

function shouldAutoLockReservation(startAt: string | null): boolean {
  if (!startAt) return false;
  const parsed = new Date(startAt);
  if (Number.isNaN(parsed.getTime())) return false;
  const msUntilStart = parsed.getTime() - Date.now();
  return msUntilStart >= 0 && msUntilStart <= AUTO_LOCK_WINDOW_MS;
}

function toCreateFailureResponse(
  error: unknown,
  fallbackRecordId = "unknown",
): { status: number; body: CreateCreditReservationFailureResponseDto } {
  if (error instanceof CreditReservationEndpointError) {
    return {
      status: error.status,
      body: {
        ok: false,
        endpoint: CREATE_ENDPOINT,
        recordId: error.recordId,
        stage: error.stage,
        error: error.message,
      },
    };
  }

  if (error instanceof SyncEndpointError) {
    return {
      status: error.status,
      body: {
        ok: false,
        endpoint: CREATE_ENDPOINT,
        recordId: fallbackRecordId,
        stage: "validation",
        error: error.exposeMessage ? error.message : "Unexpected server error.",
      },
    };
  }

  return {
    status: 500,
    body: {
      ok: false,
      endpoint: CREATE_ENDPOINT,
      recordId: fallbackRecordId,
      stage: "execution",
      error: error instanceof Error ? error.message : "Unexpected server error.",
    },
  };
}

function toLockFailureResponse(
  error: unknown,
  fallbackRecordId = "unknown",
): { status: number; body: ReservationLockFailureResponseDto } {
  if (error instanceof CreditReservationEndpointError) {
    return {
      status: error.status,
      body: {
        ok: false,
        endpoint: LOCK_ENDPOINT,
        recordId: error.recordId,
        stage: error.stage,
        error: error.message,
      },
    };
  }

  if (error instanceof SyncEndpointError) {
    return {
      status: error.status,
      body: {
        ok: false,
        endpoint: LOCK_ENDPOINT,
        recordId: fallbackRecordId,
        stage: "validation",
        error: error.exposeMessage ? error.message : "Unexpected server error.",
      },
    };
  }

  return {
    status: 500,
    body: {
      ok: false,
      endpoint: LOCK_ENDPOINT,
      recordId: fallbackRecordId,
      stage: "execution",
      error: error instanceof Error ? error.message : "Unexpected server error.",
    },
  };
}

function toReleaseFailureResponse(
  error: unknown,
  fallbackRecordId = "unknown",
): { status: number; body: ReservationReleaseFailureResponseDto } {
  if (error instanceof CreditReservationEndpointError) {
    return {
      status: error.status,
      body: {
        ok: false,
        endpoint: RELEASE_ENDPOINT,
        recordId: error.recordId,
        stage: error.stage,
        error: error.message,
      },
    };
  }

  if (error instanceof SyncEndpointError) {
    return {
      status: error.status,
      body: {
        ok: false,
        endpoint: RELEASE_ENDPOINT,
        recordId: fallbackRecordId,
        stage: "validation",
        error: error.exposeMessage ? error.message : "Unexpected server error.",
      },
    };
  }

  return {
    status: 500,
    body: {
      ok: false,
      endpoint: RELEASE_ENDPOINT,
      recordId: fallbackRecordId,
      stage: "execution",
      error: error instanceof Error ? error.message : "Unexpected server error.",
    },
  };
}

function toVoidFailureResponse(
  error: unknown,
  fallbackRecordId = "unknown",
): { status: number; body: ReservationVoidFailureResponseDto } {
  if (error instanceof CreditReservationEndpointError) {
    return {
      status: error.status,
      body: {
        ok: false,
        endpoint: VOID_ENDPOINT,
        recordId: error.recordId,
        stage: error.stage,
        error: error.message,
      },
    };
  }

  if (error instanceof SyncEndpointError) {
    return {
      status: error.status,
      body: {
        ok: false,
        endpoint: VOID_ENDPOINT,
        recordId: fallbackRecordId,
        stage: "validation",
        error: error.exposeMessage ? error.message : "Unexpected server error.",
      },
    };
  }

  return {
    status: 500,
    body: {
      ok: false,
      endpoint: VOID_ENDPOINT,
      recordId: fallbackRecordId,
      stage: "execution",
      error: error instanceof Error ? error.message : "Unexpected server error.",
    },
  };
}

export async function runCreateCreditReservation(
  input: CreateCreditReservationRequestDto,
): Promise<CreateCreditReservationSuccessResponseDto> {
  const lesson = await getLessonForReservationCreate(input.recordId);

  if (normalizeStatus(lesson.status) !== "scheduled") {
    fail("validation", input.recordId, "Lesson Status must be Scheduled.");
  }

  const isFuture =
    lesson.futureStartAtFlag ??
    (() => {
      if (!lesson.startAt) return false;
      const parsed = new Date(lesson.startAt);
      return !Number.isNaN(parsed.getTime()) && parsed.getTime() > Date.now();
    })();
  if (!isFuture) {
    fail("validation", input.recordId, "Lesson must be future.");
  }

  if (lesson.hasNoCriticalErrors === false) {
    fail("validation", input.recordId, "Lesson has critical errors.");
  }

  if (!lesson.payingCreditAccountId || lesson.hasPayingCreditAccount === false) {
    fail("validation", input.recordId, "Lesson must link a Paying Credit Account.");
  }

  if (
    lesson.expectedLessonCreditCost == null ||
    !Number.isInteger(lesson.expectedLessonCreditCost) ||
    lesson.expectedLessonCreditCost <= 0
  ) {
    fail("validation", input.recordId, "Expected Lesson Credit Cost must be a positive integer.");
  }
  const shouldAutoLock = shouldAutoLockReservation(lesson.startAt);

  const reservations = await listReservationsForLesson(input.recordId);
  const active = reservations.filter((row) => {
    const normalized = normalizeStatus(row.status);
    return normalized === "reserved" || normalized === "locked";
  });
  if (active.length > 1) {
    fail("ambiguity", input.recordId, "Multiple active reservations exist for this Lesson.", 409);
  }
  if (active.length === 1) {
    let writebackStatus: "Succeeded" | "Failed" = "Succeeded";
    if (shouldAutoLock && normalizeStatus(active[0].status) === "reserved") {
      try {
        const lockResult = await runReservationLock({
          recordId: active[0].recordId,
          idempotencyKey: input.idempotencyKey,
        });
        writebackStatus = lockResult.writebackStatus;
      } catch (error) {
        console.error("[CREDIT_RESERVATION_CREATE] Auto-lock failed for existing reservation:", error);
        writebackStatus = "Failed";
      }
    }
    return {
      ok: true,
      endpoint: CREATE_ENDPOINT,
      recordId: input.recordId,
      result: "noop",
      reservationId: active[0].recordId,
      reservedCredits: lesson.expectedLessonCreditCost,
      writebackStatus,
    };
  }

  const hasConsumed = reservations.some(
    (row) => normalizeStatus(row.status) === "consumed",
  );
  if (hasConsumed) {
    fail(
      "validation",
      input.recordId,
      "Cannot create reservation because a Consumed reservation already exists for this Lesson.",
    );
  }

  const account = await getCreditAccountForReservationCreate(lesson.payingCreditAccountId);
  if (normalizeStatus(account.status) !== "active") {
    fail("validation", input.recordId, "Credit Account Status must be Active.");
  }

  if (
    account.availableCredits != null &&
    Number.isFinite(account.availableCredits) &&
    account.availableCredits < lesson.expectedLessonCreditCost
  ) {
    console.warn(
      `[CREDIT_RESERVATION_CREATE] Available Credits (${account.availableCredits}) below expected cost (${lesson.expectedLessonCreditCost}) for lesson ${input.recordId}. Continuing per policy.`,
    );
  }

  const created = await createCreditReservation({
    lessonRecordId: lesson.recordId,
    creditAccountRecordId: lesson.payingCreditAccountId,
    reservedCredits: lesson.expectedLessonCreditCost,
  });

  let writebackStatus: "Succeeded" | "Failed" = "Succeeded";
  if (shouldAutoLock) {
    try {
      const lockResult = await runReservationLock({
        recordId: created.recordId,
        idempotencyKey: input.idempotencyKey,
      });
      writebackStatus = lockResult.writebackStatus;
    } catch (error) {
      console.error("[CREDIT_RESERVATION_CREATE] Auto-lock failed for new reservation:", error);
      writebackStatus = "Failed";
    }
  }

  return {
    ok: true,
    endpoint: CREATE_ENDPOINT,
    recordId: input.recordId,
    result: "succeeded",
    reservationId: created.recordId,
    reservedCredits: lesson.expectedLessonCreditCost,
    writebackStatus,
  };
}

export async function runReservationLock(
  input: ReservationLockRequestDto,
): Promise<ReservationLockSuccessResponseDto> {
  const reservation = await getCreditReservationById(input.recordId);
  const status = normalizeStatus(reservation.status);

  if (
    reservation.reservedCredits == null ||
    !Number.isInteger(reservation.reservedCredits) ||
    reservation.reservedCredits <= 0
  ) {
    fail("validation", input.recordId, "Reserved Credits must be a positive integer.");
  }

  const expectedDelta = -1 * reservation.reservedCredits;
  const existingLockEntries = await listReservationLockEntries(input.recordId);

  if (status === "locked") {
    if (existingLockEntries.length === 0) {
      fail("validation", input.recordId, "Reservation is Locked but no Reservation Lock Debit exists.");
    }
    if (existingLockEntries.length > 1) {
      fail("validation", input.recordId, "Reservation is Locked with multiple Reservation Lock Debits.");
    }
    const existing = existingLockEntries[0];
    if (existing.deltaCredits !== expectedDelta) {
      fail(
        "validation",
        input.recordId,
        "Existing Reservation Lock Debit amount does not match Reserved Credits.",
      );
    }
    return {
      ok: true,
      endpoint: LOCK_ENDPOINT,
      recordId: input.recordId,
      result: "noop",
      ledgerEntryId: existing.recordId,
      deltaCredits: existing.deltaCredits ?? undefined,
      writebackStatus: "Succeeded",
    };
  }

  if (status === "consumed" || status === "released" || status === "voided") {
    fail("validation", input.recordId, "Reservation is terminal and cannot be locked.");
  }
  if (status !== "reserved") {
    fail("validation", input.recordId, "Reservation Status must be Reserved.");
  }

  if (normalizeStatus(reservation.lessonStatus) !== "scheduled") {
    fail("validation", input.recordId, "Lesson Status must be Scheduled.");
  }
  if (!reservation.lessonId) {
    fail("validation", input.recordId, "Reservation is missing Lesson link.");
  }
  const lesson = await getLessonForReservationCreate(reservation.lessonId);
  if (!lesson.startAt) {
    fail("validation", input.recordId, "Lesson Start At is missing.");
  }
  const lessonStartAt = new Date(lesson.startAt);
  if (Number.isNaN(lessonStartAt.getTime())) {
    fail("validation", input.recordId, "Lesson Start At is invalid.");
  }
  const msUntilStart = lessonStartAt.getTime() - Date.now();
  const hoursUntilStart = msUntilStart / (1000 * 60 * 60);
  if (hoursUntilStart > 48 || hoursUntilStart < 0) {
    fail("validation", input.recordId, "Lesson is outside the 48-hour lock window.");
  }

  if (normalizeStatus(reservation.creditAccountStatus) !== "active") {
    fail("validation", input.recordId, "Credit Account Status must be Active.");
  }
  if (!reservation.creditAccountId) {
    fail("validation", input.recordId, "Reservation is missing Credit Account link.");
  }
  if (reservation.lockDebitCount > 0 || existingLockEntries.length > 0) {
    fail("validation", input.recordId, "Reservation already has a lock debit.");
  }

  let reservationLocked = false;
  try {
    await updateReservationStatusLocked(input.recordId);
    reservationLocked = true;

    const created = await createReservationLockEntry({
      creditAccountRecordId: reservation.creditAccountId,
      creditReservationRecordId: input.recordId,
      deltaCredits: expectedDelta,
    });

    return {
      ok: true,
      endpoint: LOCK_ENDPOINT,
      recordId: input.recordId,
      result: "succeeded",
      ledgerEntryId: created.recordId,
      deltaCredits: created.deltaCredits ?? expectedDelta,
      writebackStatus: "Succeeded",
    };
  } catch (error) {
    if (reservationLocked) {
      console.error("[RESERVATION_LOCK] Ledger writeback failed after status update:", error);
      return {
        ok: true,
        endpoint: LOCK_ENDPOINT,
        recordId: input.recordId,
        result: "succeeded",
        deltaCredits: expectedDelta,
        writebackStatus: "Failed",
      };
    }
    fail(
      "execution",
      input.recordId,
      error instanceof Error ? error.message : "Failed to lock reservation.",
      500,
    );
  }
}

export async function runReservationRelease(
  input: ReservationReleaseRequestDto,
): Promise<ReservationReleaseSuccessResponseDto> {
  const reservation = await getCreditReservationById(input.recordId);
  const status = normalizeStatus(reservation.status);

  if (status === "released") {
    return {
      ok: true,
      endpoint: RELEASE_ENDPOINT,
      recordId: input.recordId,
      result: "noop",
      priorStatus: null,
      reversalCreated: false,
      reversalEntryId: null,
      writebackStatus: "Succeeded",
    };
  }

  if (status === "consumed" || status === "voided") {
    fail("validation", input.recordId, "Reservation is terminal and cannot be released.");
  }
  if (!(status === "reserved" || status === "locked")) {
    fail("validation", input.recordId, "Reservation Status must be Reserved or Locked.");
  }

  const priorStatus = status === "locked" ? "Locked" : "Reserved";
  let reversalInput:
    | {
        creditAccountId: string;
        lockEntryId: string;
        reversalDeltaCredits: number;
        existing: string | null;
      }
    | null = null;

  if (status === "locked") {
    if (!reservation.creditAccountId) {
      fail("validation", input.recordId, "Reservation is missing Credit Account link.");
    }
    if (
      reservation.reservedCredits == null ||
      !Number.isInteger(reservation.reservedCredits) ||
      reservation.reservedCredits <= 0
    ) {
      fail("validation", input.recordId, "Reserved Credits must be a positive integer.");
    }

    const lockEntries = await listReservationLockEntries(input.recordId);
    if (lockEntries.length > 1) {
      fail("ambiguity", input.recordId, "Multiple lock debit entries found for reservation.", 409);
    }
    if (lockEntries.length === 0) {
      fail("validation", input.recordId, "Locked reservation has no lock debit entry.");
    }
    const lockEntry = lockEntries[0];
    if (lockEntry.deltaCredits == null || !Number.isInteger(lockEntry.deltaCredits)) {
      fail("validation", input.recordId, "Lock debit delta is missing or invalid.");
    }
    if (lockEntry.deltaCredits !== -1 * reservation.reservedCredits) {
      fail("validation", input.recordId, "Lock debit amount does not match Reserved Credits.");
    }
    const existingReversal = await findReversalByTargetLedgerEntry(lockEntry.recordId);
    reversalInput = {
      creditAccountId: reservation.creditAccountId,
      lockEntryId: lockEntry.recordId,
      reversalDeltaCredits: reservation.reservedCredits,
      existing: existingReversal?.recordId ?? null,
    };
  }

  let reservationReleased = false;
  let reversalCreated = false;
  let reversalEntryId: string | null = reversalInput?.existing ?? null;
  try {
    await updateReservationReleased({
      creditReservationRecordId: input.recordId,
      resolutionReason: input.resolutionReason,
      notes: input.notes,
    });
    reservationReleased = true;

    if (reversalInput && !reversalInput.existing) {
      const created = await createReservationLockReversal({
        creditAccountRecordId: reversalInput.creditAccountId,
        reversesLedgerEntryId: reversalInput.lockEntryId,
        reversalDeltaCredits: reversalInput.reversalDeltaCredits,
      });
      reversalCreated = true;
      reversalEntryId = created.recordId;
    }

    return {
      ok: true,
      endpoint: RELEASE_ENDPOINT,
      recordId: input.recordId,
      result: "succeeded",
      priorStatus,
      reversalCreated,
      reversalEntryId,
      writebackStatus: "Succeeded",
    };
  } catch (error) {
    if (reservationReleased) {
      console.error("[RESERVATION_RELEASE] Reversal writeback failed:", error);
      return {
        ok: true,
        endpoint: RELEASE_ENDPOINT,
        recordId: input.recordId,
        result: "succeeded",
        priorStatus,
        reversalCreated: false,
        reversalEntryId,
        writebackStatus: "Failed",
      };
    }
    fail(
      "execution",
      input.recordId,
      error instanceof Error ? error.message : "Failed to release reservation.",
      500,
    );
  }
}

export async function runReservationVoid(
  input: ReservationVoidRequestDto,
): Promise<ReservationVoidSuccessResponseDto> {
  const reservation = await getCreditReservationById(input.recordId);
  const status = normalizeStatus(reservation.status);

  if (status === "voided") {
    return {
      ok: true,
      endpoint: VOID_ENDPOINT,
      recordId: input.recordId,
      result: "noop",
      priorStatus: null,
      reversalCreated: false,
      reversalEntryId: null,
      writebackStatus: "Succeeded",
    };
  }

  if (status === "consumed" || status === "released") {
    fail("validation", input.recordId, "Reservation is terminal and cannot be voided.");
  }
  if (!(status === "reserved" || status === "locked")) {
    fail("validation", input.recordId, "Reservation Status must be Reserved or Locked.");
  }
  if (status === "locked" && input.force !== true) {
    fail(
      "validation",
      input.recordId,
      "Locked reservation cannot be voided unless force=true is provided.",
    );
  }

  const priorStatus = status === "locked" ? "Locked" : "Reserved";
  let reversalInput:
    | {
        creditAccountId: string;
        lockEntryId: string;
        reversalDeltaCredits: number;
        existing: string | null;
      }
    | null = null;

  if (status === "locked") {
    if (reservation.lockDebitCount === 0) {
      fail("validation", input.recordId, "Locked reservation is missing lock debit.");
    }
    if (reservation.lockDebitCount > 1) {
      fail("ambiguity", input.recordId, "Locked reservation has multiple lock debits.", 409);
    }
    if (!reservation.creditAccountId) {
      fail("validation", input.recordId, "Reservation is missing Credit Account link.");
    }
    if (
      reservation.reservedCredits == null ||
      !Number.isInteger(reservation.reservedCredits) ||
      reservation.reservedCredits <= 0
    ) {
      fail("validation", input.recordId, "Reserved Credits must be a positive integer.");
    }

    const lockEntries = await listReservationLockEntries(input.recordId);
    if (lockEntries.length > 1) {
      fail("ambiguity", input.recordId, "Multiple lock debit entries found for reservation.", 409);
    }
    if (lockEntries.length === 0) {
      fail("validation", input.recordId, "Locked reservation has no lock debit entry.");
    }
    const lockEntry = lockEntries[0];
    if (lockEntry.deltaCredits == null || !Number.isInteger(lockEntry.deltaCredits)) {
      fail("validation", input.recordId, "Lock debit delta is missing or invalid.");
    }
    if (lockEntry.deltaCredits !== -1 * reservation.reservedCredits) {
      fail("validation", input.recordId, "Lock debit amount does not match Reserved Credits.");
    }
    const existingReversal = await findReversalByTargetLedgerEntry(lockEntry.recordId);
    reversalInput = {
      creditAccountId: reservation.creditAccountId,
      lockEntryId: lockEntry.recordId,
      reversalDeltaCredits: reservation.reservedCredits,
      existing: existingReversal?.recordId ?? null,
    };
  }

  let reservationVoided = false;
  let reversalCreated = false;
  let reversalEntryId: string | null = reversalInput?.existing ?? null;
  try {
    await updateReservationVoided({
      creditReservationRecordId: input.recordId,
      notes: input.notes,
    });
    reservationVoided = true;

    if (reversalInput && !reversalInput.existing) {
      const created = await createReservationLockReversal({
        creditAccountRecordId: reversalInput.creditAccountId,
        reversesLedgerEntryId: reversalInput.lockEntryId,
        reversalDeltaCredits: reversalInput.reversalDeltaCredits,
        reversalReason: "Lock Debit Reversal - Administrative Void",
      });
      reversalCreated = true;
      reversalEntryId = created.recordId;
    }

    return {
      ok: true,
      endpoint: VOID_ENDPOINT,
      recordId: input.recordId,
      result: "succeeded",
      priorStatus,
      reversalCreated,
      reversalEntryId,
      writebackStatus: "Succeeded",
    };
  } catch (error) {
    if (reservationVoided) {
      console.error("[RESERVATION_VOID] Reversal writeback failed:", error);
      return {
        ok: true,
        endpoint: VOID_ENDPOINT,
        recordId: input.recordId,
        result: "succeeded",
        priorStatus,
        reversalCreated: false,
        reversalEntryId,
        writebackStatus: "Failed",
      };
    }
    fail(
      "execution",
      input.recordId,
      error instanceof Error ? error.message : "Failed to void reservation.",
      500,
    );
  }
}

export async function handleCreateCreditReservation(
  request: Request,
): Promise<NextResponse<CreateCreditReservationResponseDto>> {
  let recordId = "unknown";
  try {
    assertAuthorizedSyncRequest(request);
    assertJsonRequest(request);
    const body = await parseJsonBody(request);
    const parsed = parseCreateCreditReservationBody(body);
    recordId = parsed.recordId;
    const response = await runCreateCreditReservation(parsed);
    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    const { status, body } = toCreateFailureResponse(error, recordId);
    return NextResponse.json(body, { status });
  }
}

export async function handleReservationLock(
  request: Request,
): Promise<NextResponse<ReservationLockResponseDto>> {
  let recordId = "unknown";
  try {
    assertAuthorizedSyncRequest(request);
    assertJsonRequest(request);
    const body = await parseJsonBody(request);
    const parsed = parseReservationLockBody(body);
    recordId = parsed.recordId;
    const response = await runReservationLock(parsed);
    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    const { status, body } = toLockFailureResponse(error, recordId);
    return NextResponse.json(body, { status });
  }
}

export async function handleReservationRelease(
  request: Request,
): Promise<NextResponse<ReservationReleaseResponseDto>> {
  let recordId = "unknown";
  try {
    assertAuthorizedSyncRequest(request);
    assertJsonRequest(request);
    const body = await parseJsonBody(request);
    const parsed = parseReservationReleaseBody(body);
    recordId = parsed.recordId;
    const response = await runReservationRelease(parsed);
    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    const { status, body } = toReleaseFailureResponse(error, recordId);
    return NextResponse.json(body, { status });
  }
}

export async function handleReservationVoid(
  request: Request,
): Promise<NextResponse<ReservationVoidResponseDto>> {
  let recordId = "unknown";
  try {
    assertAuthorizedSyncRequest(request);
    assertJsonRequest(request);
    const body = await parseJsonBody(request);
    const parsed = parseReservationVoidBody(body);
    recordId = parsed.recordId;
    const response = await runReservationVoid(parsed);
    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    const { status, body } = toVoidFailureResponse(error, recordId);
    return NextResponse.json(body, { status });
  }
}
