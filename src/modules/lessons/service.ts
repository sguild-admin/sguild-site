import { SyncEndpointError } from "@/lib/errors";
import { getCreditAccountById } from "@/modules/credit-accounts";
import {
  createCreditForfeit,
  createLessonDebit,
  createLockDebitReversal,
  findReversalByTargetLedgerEntry,
  listCreditForfeitEntriesForLesson,
  listLessonDebitEntriesForLesson,
} from "@/modules/credit-ledger-entries";
import { allocateDebitAcrossOpenLots } from "@/modules/lesson-debit/repo";
import { reservationsRepo } from "@/modules/reservations";
import type {
  LessonCancelSuccessResponseDto,
  LessonCancellationReason,
  LessonCompleteSuccessResponseDto,
  LessonNoShowSuccessResponseDto,
  LessonOutcomeFailureResponseDto,
  LessonOutcomeFailureStage,
} from "./dto";
import {
  getLessonForOutcome,
  updateLessonToCanceled,
  updateLessonToCompleted,
  updateLessonToNoShow,
} from "./repo";

type LessonEndpoint =
  | "/api/lessons/complete"
  | "/api/lessons/cancel"
  | "/api/lessons/no-show"
  | "/api/lessons/process-outcome";

type ActiveReservationRecord = Awaited<
  ReturnType<typeof reservationsRepo.listReservationsForLesson>
>[number];

type LockedReservationContext = {
  reservation: ActiveReservationRecord;
  creditAccountId: string;
  lockEntryId: string;
  reservedCredits: number;
  existingReversalId: string | null;
};

class LessonOutcomeError extends SyncEndpointError {
  readonly stage: LessonOutcomeFailureStage;
  readonly recordId: string;
  readonly endpoint: LessonEndpoint;

  constructor(
    endpoint: LessonEndpoint,
    stage: LessonOutcomeFailureStage,
    recordId: string,
    message: string,
    status: number,
  ) {
    super(message, status);
    this.name = "LessonOutcomeError";
    this.endpoint = endpoint;
    this.stage = stage;
    this.recordId = recordId;
  }
}

function fail(
  endpoint: LessonEndpoint,
  stage: LessonOutcomeFailureStage,
  recordId: string,
  message: string,
  status = 422,
): never {
  throw new LessonOutcomeError(endpoint, stage, recordId, message, status);
}

function normalizeStatus(value: string | null): string {
  return (value ?? "").trim().toLowerCase();
}

function isClientCanceledReason(value: string | null): boolean {
  const normalized = normalizeStatus(value);
  return normalized === "client canceled" || normalized === "client cancelled";
}

function isActiveReservationStatus(status: string | null): boolean {
  const normalized = normalizeStatus(status);
  return normalized === "reserved" || normalized === "locked";
}

function deriveReversalCredits(recordId: string, reservedCredits: number | null, lockDelta: number): number {
  if (!Number.isInteger(lockDelta) || lockDelta === 0) {
    throw new SyncEndpointError(
      `Reservation Lock Debit on lesson ${recordId} is missing valid integer Delta Credits.`,
      422,
    );
  }

  const absoluteFromLock = Math.abs(lockDelta);
  if (reservedCredits == null || !Number.isInteger(reservedCredits) || reservedCredits <= 0) {
    console.warn(
      `[LESSON_OUTCOME] Reserved Credits missing/invalid for lesson ${recordId}; using lock debit delta (${absoluteFromLock}) for settlement.`,
    );
    return absoluteFromLock;
  }

  if (lockDelta !== -1 * reservedCredits) {
    console.warn(
      `[LESSON_OUTCOME] Reserved Credits (${reservedCredits}) mismatch lock debit (${lockDelta}) for lesson ${recordId}; using lock debit delta (${absoluteFromLock}) for settlement.`,
    );
    return absoluteFromLock;
  }

  return reservedCredits;
}

async function getActiveReservationForLesson(
  endpoint: LessonEndpoint,
  recordId: string,
): Promise<ActiveReservationRecord | null> {
  const reservations = await reservationsRepo.listReservationsForLesson(recordId);
  const activeReservations = reservations.filter((row) => isActiveReservationStatus(row.status));
  if (activeReservations.length > 1) {
    fail(endpoint, "ambiguity", recordId, "Multiple active reservations found for Lesson.", 409);
  }
  return activeReservations[0] ?? null;
}

async function getLockedReservationContext(
  endpoint: LessonEndpoint,
  recordId: string,
  reservation: ActiveReservationRecord | null,
  fallbackCreditAccountId: string | null,
): Promise<LockedReservationContext | null> {
  if (!reservation) return null;
  if (normalizeStatus(reservation.status) !== "locked") return null;

  const lockEntries = await reservationsRepo.listLockDebitEntries(reservation.recordId);
  if (lockEntries.length > 1) {
    fail(endpoint, "ambiguity", recordId, "Multiple Reservation Lock Debit entries found for reservation.", 409);
  }
  if (lockEntries.length === 0) {
    fail(endpoint, "validation", recordId, "Locked reservation is missing lock debit entry.");
  }

  const lockEntry = lockEntries[0];
  if (lockEntry.deltaCredits == null) {
    fail(endpoint, "validation", recordId, "Reservation Lock Debit is missing Delta Credits.");
  }
  const reservedCredits = deriveReversalCredits(recordId, reservation.reservedCredits, lockEntry.deltaCredits);
  const creditAccountId = reservation.creditAccountId ?? fallbackCreditAccountId;
  if (!creditAccountId) {
    fail(endpoint, "validation", recordId, "Locked reservation is missing Credit Account link.");
  }
  const existingReversalId = (await findReversalByTargetLedgerEntry(lockEntry.recordId))?.recordId ?? null;

  return {
    reservation,
    creditAccountId,
    lockEntryId: lockEntry.recordId,
    reservedCredits,
    existingReversalId,
  };
}

async function ensureSingleLessonDebit(
  endpoint: LessonEndpoint,
  recordId: string,
  input: {
    creditAccountRecordId: string;
    lessonRecordId: string;
    deltaCredits: number;
  },
): Promise<string> {
  const existingLessonDebits = await listLessonDebitEntriesForLesson(recordId);
  if (existingLessonDebits.length > 1) {
    fail(endpoint, "ambiguity", recordId, "Multiple Lesson Debit entries already exist for lesson.", 409);
  }
  if (existingLessonDebits.length === 1) {
    const existing = existingLessonDebits[0];
    if (existing.deltaCredits == null || existing.deltaCredits !== input.deltaCredits) {
      fail(
        endpoint,
        "validation",
        recordId,
        "Existing Lesson Debit amount does not match expected locked settlement delta.",
      );
    }
    return existing.recordId;
  }
  const created = await createLessonDebit(input);
  return created.recordId;
}

async function ensureSingleCreditForfeit(
  endpoint: LessonEndpoint,
  recordId: string,
  input: {
    creditAccountRecordId: string;
    lessonRecordId: string;
    deltaCredits: number;
  },
): Promise<string> {
  const existingForfeits = await listCreditForfeitEntriesForLesson(recordId);
  if (existingForfeits.length > 1) {
    fail(endpoint, "ambiguity", recordId, "Multiple Credit Forfeit entries already exist for lesson.", 409);
  }
  if (existingForfeits.length === 1) {
    const existing = existingForfeits[0];
    if (existing.deltaCredits == null || existing.deltaCredits !== input.deltaCredits) {
      fail(
        endpoint,
        "validation",
        recordId,
        "Existing Credit Forfeit amount does not match expected locked settlement delta.",
      );
    }
    return existing.recordId;
  }
  const created = await createCreditForfeit(input);
  return created.recordId;
}

export function toLessonOutcomeFailureResponse(
  endpoint: LessonEndpoint,
  error: unknown,
  fallbackRecordId = "unknown",
): { status: number; body: LessonOutcomeFailureResponseDto } {
  if (error instanceof LessonOutcomeError) {
    return {
      status: error.status,
      body: {
        ok: false,
        endpoint: error.endpoint,
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
        endpoint,
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
      endpoint,
      recordId: fallbackRecordId,
      stage: "execution",
      error: error instanceof Error ? error.message : "Unexpected server error.",
    },
  };
}

export async function completeLesson(
  recordId: string,
  opts?: { outcomeNotes?: string; idempotencyKey?: string },
): Promise<LessonCompleteSuccessResponseDto> {
  const endpoint: LessonEndpoint = "/api/lessons/complete";
  const lesson = await getLessonForOutcome(recordId);
  const status = normalizeStatus(lesson.status);

  if (status === "completed") {
    return {
      ok: true,
      endpoint,
      recordId,
      result: "noop",
      reservationResolved: false,
      writebackStatus: "Succeeded",
      reversalCreated: false,
      reservationResolution: null,
    } as LessonCompleteSuccessResponseDto;
  }
  if (status === "canceled" || status === "cancelled") {
    fail(endpoint, "validation", recordId, "Lesson is already Canceled.");
  }
  if (status === "no-show" || status === "no show" || status === "noshow") {
    fail(endpoint, "validation", recordId, "Lesson is already No-Show.");
  }
  if (status === "draft") {
    fail(endpoint, "validation", recordId, "Cannot complete a Draft lesson.");
  }
  if (status !== "scheduled") {
    fail(endpoint, "validation", recordId, "Lesson Status must be Scheduled.");
  }
  if (lesson.futureStartAt === true) {
    fail(endpoint, "validation", recordId, "Lesson must be past-due.");
  }
  if (lesson.isTerminalLesson === true) {
    fail(endpoint, "validation", recordId, "Lesson is already terminal.");
  }
  if (lesson.missingRequiredLinks === true) {
    fail(endpoint, "validation", recordId, "Lesson is missing required links.");
  }
  if (lesson.hasException === true) {
    fail(endpoint, "validation", recordId, "Lesson has exception.");
  }
  if (lesson.hasCreditLedgerImpactingException === true) {
    console.warn(
      `[LESSON_COMPLETE] Proceeding despite Has Credit Ledger Impacting Exception on lesson ${recordId}.`,
    );
  }
  if (!lesson.payingCreditAccountId) {
    fail(endpoint, "validation", recordId, "Lesson must link a Paying Credit Account.");
  }

  const account = await getCreditAccountById(lesson.payingCreditAccountId);
  if (normalizeStatus(account.status) !== "active") {
    fail(endpoint, "validation", recordId, "Credit Account Status must be Active.");
  }

  const reservation = await getActiveReservationForLesson(endpoint, recordId);
  const lockContext = await getLockedReservationContext(
    endpoint,
    recordId,
    reservation,
    lesson.payingCreditAccountId,
  );

  // Ordering requirement: write Lesson terminal status + Resolution Status first.
  await updateLessonToCompleted({
    lessonRecordId: recordId,
    outcomeNotes: lesson.outcomeNotes ? undefined : opts?.outcomeNotes,
    resolutionStatus: "Consumed",
  });

  if (!reservation) {
    return {
      ok: true,
      endpoint,
      recordId,
      result: "succeeded",
      reservationResolved: false,
      writebackStatus: "Succeeded",
      reversalCreated: false,
      reservationResolution: null,
    } as LessonCompleteSuccessResponseDto;
  }

  try {
    let reversalCreated = false;

    if (lockContext) {
      if (!lockContext.existingReversalId) {
        await createLockDebitReversal({
          creditAccountRecordId: lockContext.creditAccountId,
          lockDebitEntryId: lockContext.lockEntryId,
          reservedCredits: lockContext.reservedCredits,
          reversalReason: "Lock Debit Reversal - Credits Consumed",
        });
        reversalCreated = true;
      }

      const expectedDelta = -1 * lockContext.reservedCredits;
      const lessonDebitId = await ensureSingleLessonDebit(endpoint, recordId, {
        creditAccountRecordId: lockContext.creditAccountId,
        lessonRecordId: recordId,
        deltaCredits: expectedDelta,
      });

      await allocateDebitAcrossOpenLots({
        lessonRecordId: recordId,
        creditAccountRecordId: lockContext.creditAccountId,
        ledgerEntryRecordId: lessonDebitId,
        debitCredits: Math.abs(expectedDelta),
      });
    }

    await reservationsRepo.consumeReservation(
      reservation.recordId,
      "Lesson Completed",
      new Date().toISOString(),
    );

    return {
      ok: true,
      endpoint,
      recordId,
      result: "succeeded",
      reservationResolved: true,
      writebackStatus: "Succeeded",
      reversalCreated: reversalCreated || Boolean(lockContext?.existingReversalId),
      reservationResolution: "Consumed",
    } as LessonCompleteSuccessResponseDto;
  } catch (error) {
    console.error("[LESSON_COMPLETE] Reservation/ledger writeback failed:", error);
    return {
      ok: true,
      endpoint,
      recordId,
      result: "succeeded",
      reservationResolved: false,
      writebackStatus: "Failed",
      reversalCreated: false,
      reservationResolution: null,
    } as LessonCompleteSuccessResponseDto;
  }
}

export async function cancelLesson(
  recordId: string,
  cancellationReason: LessonCancellationReason,
  notes?: string,
  _opts?: { idempotencyKey?: string },
): Promise<LessonCancelSuccessResponseDto> {
  const endpoint: LessonEndpoint = "/api/lessons/cancel";
  const lesson = await getLessonForOutcome(recordId);
  const status = normalizeStatus(lesson.status);
  const alreadyCanceled = status === "canceled" || status === "cancelled";

  if (alreadyCanceled) {
    if ((lesson.cancellationReason ?? "").trim() !== cancellationReason) {
      fail(endpoint, "validation", recordId, "Lesson already canceled with a different Cancellation Reason.");
    }
    return {
      ok: true,
      endpoint,
      recordId,
      result: "noop",
      reservationResolved: false,
      reservationResolution: null,
      reversalCreated: false,
      writebackStatus: "Succeeded",
    };
  }

  if (status === "completed") fail(endpoint, "validation", recordId, "Lesson is already Completed.");
  if (status === "no-show" || status === "no show" || status === "noshow") {
    fail(endpoint, "validation", recordId, "Lesson is already No-Show.");
  }
  if (lesson.isTerminalLesson === true) {
    fail(endpoint, "validation", recordId, "Lesson is already terminal.");
  }
  if (!(status === "draft" || status === "scheduled")) {
    fail(endpoint, "validation", recordId, "Only Draft or Scheduled lessons can be canceled.");
  }

  const reservation = await getActiveReservationForLesson(endpoint, recordId);
  const lockContext = await getLockedReservationContext(
    endpoint,
    recordId,
    reservation,
    lesson.payingCreditAccountId,
  );
  const isClientCanceled = isClientCanceledReason(cancellationReason);
  const resolutionStatus = lockContext && isClientCanceled ? "Forfeited" : "Released";

  // Ordering requirement: write Lesson terminal status + Resolution Status first.
  await updateLessonToCanceled({
    lessonRecordId: recordId,
    cancellationReason,
    notes,
    resolutionStatus,
  });

  if (!reservation) {
    return {
      ok: true,
      endpoint,
      recordId,
      result: "succeeded",
      reservationResolved: false,
      reservationResolution: null,
      reversalCreated: false,
      writebackStatus: "Succeeded",
    };
  }

  try {
    let reversalCreated = false;
    if (lockContext) {
      const reversalReason = isClientCanceled
        ? "Lock Debit Reversal - Credits Forfeited"
        : "Lock Debit Reversal - Credits Released";
      if (!lockContext.existingReversalId) {
        await createLockDebitReversal({
          creditAccountRecordId: lockContext.creditAccountId,
          lockDebitEntryId: lockContext.lockEntryId,
          reservedCredits: lockContext.reservedCredits,
          reversalReason,
        });
        reversalCreated = true;
      }

      if (isClientCanceled) {
        const expectedDelta = -1 * lockContext.reservedCredits;
        const forfeitEntryId = await ensureSingleCreditForfeit(endpoint, recordId, {
          creditAccountRecordId: lockContext.creditAccountId,
          lessonRecordId: recordId,
          deltaCredits: expectedDelta,
        });
        await allocateDebitAcrossOpenLots({
          lessonRecordId: recordId,
          creditAccountRecordId: lockContext.creditAccountId,
          ledgerEntryRecordId: forfeitEntryId,
          debitCredits: Math.abs(expectedDelta),
        });
      }
    }

    await reservationsRepo.releaseReservation(
      reservation.recordId,
      "Lesson Canceled",
      new Date().toISOString(),
    );

    return {
      ok: true,
      endpoint,
      recordId,
      result: "succeeded",
      reservationResolved: true,
      reservationResolution: "Released",
      reversalCreated: reversalCreated || Boolean(lockContext?.existingReversalId),
      writebackStatus: "Succeeded",
    };
  } catch (error) {
    console.error("[LESSON_CANCEL] Reservation/ledger writeback failed:", error);
    return {
      ok: true,
      endpoint,
      recordId,
      result: "succeeded",
      reservationResolved: false,
      reservationResolution: null,
      reversalCreated: false,
      writebackStatus: "Failed",
    };
  }
}

export async function recordNoShow(
  recordId: string,
  notes?: string,
  _opts?: { idempotencyKey?: string },
): Promise<LessonNoShowSuccessResponseDto> {
  const endpoint: LessonEndpoint = "/api/lessons/no-show";
  const lesson = await getLessonForOutcome(recordId);
  const status = normalizeStatus(lesson.status);

  if (status === "no-show" || status === "no show" || status === "noshow") {
    return {
      ok: true,
      endpoint,
      recordId,
      result: "noop",
      reservationResolved: false,
      reservationResolution: null,
      writebackStatus: "Succeeded",
      reversalCreated: false,
    } as LessonNoShowSuccessResponseDto;
  }
  if (status === "completed") fail(endpoint, "validation", recordId, "Lesson is already Completed.");
  if (status === "canceled" || status === "cancelled") fail(endpoint, "validation", recordId, "Lesson is already Canceled.");
  if (status === "draft") fail(endpoint, "validation", recordId, "Cannot mark a Draft lesson as No-Show.");
  if (lesson.isTerminalLesson === true) fail(endpoint, "validation", recordId, "Lesson is already terminal.");
  if (status !== "scheduled") fail(endpoint, "validation", recordId, "Lesson Status must be Scheduled.");
  if (lesson.futureStartAt === true) fail(endpoint, "validation", recordId, "Lesson must be past-due.");

  const reservation = await getActiveReservationForLesson(endpoint, recordId);
  const lockContext = await getLockedReservationContext(
    endpoint,
    recordId,
    reservation,
    lesson.payingCreditAccountId,
  );
  const resolutionStatus = lockContext ? "Forfeited" : "Released";

  // Ordering requirement: write Lesson terminal status + Resolution Status first.
  await updateLessonToNoShow({ lessonRecordId: recordId, notes, resolutionStatus });

  if (!reservation) {
    return {
      ok: true,
      endpoint,
      recordId,
      result: "succeeded",
      reservationResolved: false,
      reservationResolution: null,
      writebackStatus: "Succeeded",
      reversalCreated: false,
    } as LessonNoShowSuccessResponseDto;
  }

  try {
    let reversalCreated = false;
    if (lockContext) {
      if (!lockContext.existingReversalId) {
        await createLockDebitReversal({
          creditAccountRecordId: lockContext.creditAccountId,
          lockDebitEntryId: lockContext.lockEntryId,
          reservedCredits: lockContext.reservedCredits,
          reversalReason: "Lock Debit Reversal - Credits Forfeited",
        });
        reversalCreated = true;
      }

      const expectedDelta = -1 * lockContext.reservedCredits;
      const forfeitEntryId = await ensureSingleCreditForfeit(endpoint, recordId, {
        creditAccountRecordId: lockContext.creditAccountId,
        lessonRecordId: recordId,
        deltaCredits: expectedDelta,
      });
      await allocateDebitAcrossOpenLots({
        lessonRecordId: recordId,
        creditAccountRecordId: lockContext.creditAccountId,
        ledgerEntryRecordId: forfeitEntryId,
        debitCredits: Math.abs(expectedDelta),
      });
    }

    await reservationsRepo.releaseReservation(
      reservation.recordId,
      "Lesson No-Show",
      new Date().toISOString(),
    );

    return {
      ok: true,
      endpoint,
      recordId,
      result: "succeeded",
      reservationResolved: true,
      reservationResolution: "Released",
      writebackStatus: "Succeeded",
      reversalCreated: reversalCreated || Boolean(lockContext?.existingReversalId),
    } as LessonNoShowSuccessResponseDto;
  } catch (error) {
    console.error("[LESSON_NO_SHOW] Reservation/ledger writeback failed:", error);
    return {
      ok: true,
      endpoint,
      recordId,
      result: "succeeded",
      reservationResolved: false,
      reservationResolution: null,
      writebackStatus: "Failed",
      reversalCreated: false,
    } as LessonNoShowSuccessResponseDto;
  }
}
