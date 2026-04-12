import { SyncEndpointError } from "@/lib/errors";
import { getCreditAccountById } from "@/modules/credit-accounts";
import {
  createLessonDebit,
  createLockDebitReversal,
  findReversalByTargetLedgerEntry,
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
      `[LESSON_CANCEL] Reserved Credits missing/invalid for lesson ${recordId}; using lock debit delta (${absoluteFromLock}) for reversal.`,
    );
    return absoluteFromLock;
  }

  if (lockDelta !== -1 * reservedCredits) {
    console.warn(
      `[LESSON_CANCEL] Reserved Credits (${reservedCredits}) mismatch lock debit (${lockDelta}) for lesson ${recordId}; using lock debit delta (${absoluteFromLock}) for reversal.`,
    );
    return absoluteFromLock;
  }

  return reservedCredits;
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
    };
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

  const reservations = await reservationsRepo.listReservationsForLesson(recordId);
  const activeReservations = reservations.filter((row) => isActiveReservationStatus(row.status));
  if (activeReservations.length > 1) {
    fail(endpoint, "ambiguity", recordId, "Multiple active reservations found for Lesson.", 409);
  }

  await updateLessonToCompleted({
    lessonRecordId: recordId,
    outcomeNotes: lesson.outcomeNotes ? undefined : opts?.outcomeNotes,
  });

  if (activeReservations.length === 0) {
    return {
      ok: true,
      endpoint,
      recordId,
      result: "succeeded",
      reservationResolved: false,
      writebackStatus: "Succeeded",
    };
  }

  try {
    await reservationsRepo.consumeReservation(
      activeReservations[0].recordId,
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
    };
  } catch (error) {
    console.error("[LESSON_COMPLETE] Reservation writeback failed:", error);
    return {
      ok: true,
      endpoint,
      recordId,
      result: "succeeded",
      reservationResolved: false,
      writebackStatus: "Failed",
    };
  }
}

export async function cancelLesson(
  recordId: string,
  cancellationReason: LessonCancellationReason,
  notes?: string,
  _opts?: { idempotencyKey?: string },
): Promise<LessonCancelSuccessResponseDto> {
  const endpoint: LessonEndpoint = "/api/lessons/cancel";
  console.info(
    `[LESSON_CANCEL] Start lesson=${recordId} cancellationReason="${cancellationReason}"`,
  );
  const lesson = await getLessonForOutcome(recordId);
  const status = normalizeStatus(lesson.status);
  const alreadyCanceled = status === "canceled" || status === "cancelled";
  console.info(
    `[LESSON_CANCEL] Current lesson status=${lesson.status ?? "null"} alreadyCanceled=${alreadyCanceled}`,
  );

  if (alreadyCanceled) {
    if ((lesson.cancellationReason ?? "").trim() !== cancellationReason) {
      fail(endpoint, "validation", recordId, "Lesson already canceled with a different Cancellation Reason.");
    }
  }

  if (!alreadyCanceled) {
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
  }

  const isClientCanceled = isClientCanceledReason(cancellationReason);
  const reservations = await reservationsRepo.listReservationsForLesson(recordId);
  const activeReservations = reservations.filter((row) => isActiveReservationStatus(row.status));
  console.info(
    `[LESSON_CANCEL] Reservations found lesson=${recordId} total=${reservations.length} active=${activeReservations.length} statuses=[${reservations.map((r) => r.status ?? "null").join(", ")}]`,
  );
  
  // Log detailed status information for each reservation
  for (const res of reservations) {
    const normalized = normalizeStatus(res.status);
    const isActive = normalized === "reserved" || normalized === "locked";
    console.info(`[LESSON_CANCEL] Reservation ${res.recordId}: status=${res.status} normalized=${normalized} isActive=${isActive}`);
  }
  
  if (activeReservations.length > 1) {
    fail(endpoint, "ambiguity", recordId, "Multiple active reservations found for Lesson.", 409);
  }

  const reservation = activeReservations[0] ?? null;
  let lockContext:
    | {
        creditAccountId: string;
        lockEntryId: string;
        reservedCredits: number;
        existingReversalId: string | null;
      }
    | null = null;

  if (reservation) {
    const lockEntries = await reservationsRepo.listLockDebitEntries(reservation.recordId);
    if (lockEntries.length > 1) {
      fail(endpoint, "ambiguity", recordId, "Multiple Reservation Lock Debit entries found for reservation.", 409);
    }
    const reservationStatus = normalizeStatus(reservation.status);
    if (reservationStatus === "locked" && lockEntries.length === 0) {
      fail(endpoint, "validation", recordId, "Missing Reservation Lock Debit entry for locked reservation.");
    }
    if (lockEntries.length === 1) {
      const lockEntry = lockEntries[0];
      if (lockEntry.deltaCredits == null) {
        fail(endpoint, "validation", recordId, "Reservation Lock Debit is missing Delta Credits.");
      }
      const reversalCredits = deriveReversalCredits(
        recordId,
        reservation.reservedCredits,
        lockEntry.deltaCredits,
      );
      const creditAccountId = reservation.creditAccountId ?? lesson.payingCreditAccountId;
      if (!creditAccountId) {
        fail(endpoint, "validation", recordId, "Locked reservation is missing Credit Account link.");
      }
      lockContext = {
        creditAccountId,
        lockEntryId: lockEntry.recordId,
        reservedCredits: reversalCredits,
        existingReversalId: (await findReversalByTargetLedgerEntry(lockEntry.recordId))?.recordId ?? null,
      };
    }
  }

  if (!alreadyCanceled) {
    console.info(`[LESSON_CANCEL] Writing lesson status=Canceled lesson=${recordId}`);
    await updateLessonToCanceled({
      lessonRecordId: recordId,
      cancellationReason,
      notes,
    });
    console.info(`[LESSON_CANCEL] Lesson canceled write complete lesson=${recordId}`);
  }

  if (!reservation) {
    let repairedAny = false;
    let repairedResolution: "Consumed" | "Released" | null = null;
    let repairedReversal = false;

    console.info(
      `[LESSON_CANCEL] No active reservation detected lesson=${recordId}; running lock/reversal repair scan`,
    );
    for (const candidate of reservations) {
      const lockEntries = await reservationsRepo.listLockDebitEntries(candidate.recordId);
      if (lockEntries.length > 1) {
        fail(endpoint, "ambiguity", recordId, "Multiple Reservation Lock Debit entries found for reservation.", 409);
      }
      if (lockEntries.length === 0) continue;

      const lockEntry = lockEntries[0];
      if (lockEntry.deltaCredits == null) {
        fail(endpoint, "validation", recordId, "Reservation Lock Debit is missing Delta Credits.");
      }
      const reversalCredits = deriveReversalCredits(
        recordId,
        candidate.reservedCredits,
        lockEntry.deltaCredits,
      );

      const creditAccountId = candidate.creditAccountId ?? lesson.payingCreditAccountId;
      if (!creditAccountId) {
        fail(endpoint, "validation", recordId, "Reservation with lock debit is missing Credit Account link.");
      }

      const existingReversal = await findReversalByTargetLedgerEntry(lockEntry.recordId);
      if (!existingReversal) {
        console.info(
          `[LESSON_CANCEL] Repair creating reversal reservation=${candidate.recordId} lockEntry=${lockEntry.recordId} lesson=${recordId}`,
        );
        await createLockDebitReversal({
          creditAccountRecordId: creditAccountId,
          lockDebitEntryId: lockEntry.recordId,
          reservedCredits: reversalCredits,
          reversalReason: "Lock Debit Reversal - Lesson Canceled",
        });
        repairedAny = true;
        repairedReversal = true;
      }

      if (normalizeStatus(candidate.status) === "locked") {
        console.info(
          `[LESSON_CANCEL] Repair release reservation=${candidate.recordId} lesson=${recordId}`,
        );
        await reservationsRepo.releaseReservation(
          candidate.recordId,
          "Lesson Canceled",
          new Date().toISOString(),
          notes,
        );
        console.info(
          `[LESSON_CANCEL] Repair release complete reservation=${candidate.recordId} lesson=${recordId}`,
        );
        repairedAny = true;
        repairedResolution = "Released";
      }
    }

    if (repairedAny) {
      return {
        ok: true,
        endpoint,
        recordId,
        result: "succeeded",
        reservationResolved: repairedResolution !== null,
        reservationResolution: repairedResolution,
        reversalCreated: repairedReversal,
        writebackStatus: "Succeeded",
      };
    }

    return {
      ok: true,
      endpoint,
      recordId,
      result: alreadyCanceled ? "noop" : "succeeded",
      reservationResolved: false,
      reservationResolution: null,
      reversalCreated: false,
      writebackStatus: "Succeeded",
    };
  }

  try {
    if (!lockContext) {
      console.info(
        `[LESSON_CANCEL] Releasing reservation=${reservation.recordId} lesson=${recordId} (no lock debit context)`,
      );
      await reservationsRepo.releaseReservation(reservation.recordId, "Lesson Canceled", new Date().toISOString(), notes);
      console.info(
        `[LESSON_CANCEL] Release complete reservation=${reservation.recordId} lesson=${recordId}`,
      );
      return {
        ok: true,
        endpoint,
        recordId,
        result: "succeeded",
        reservationResolved: true,
        reservationResolution: "Released",
        reversalCreated: false,
        writebackStatus: "Succeeded",
      };
    }

    let reversalCreated = false;
    if (!lockContext.existingReversalId) {
      console.info(
        `[LESSON_CANCEL] Creating lock reversal reservation=${reservation.recordId} lockEntry=${lockContext.lockEntryId} lesson=${recordId}`,
      );
      await createLockDebitReversal({
        creditAccountRecordId: lockContext.creditAccountId,
        lockDebitEntryId: lockContext.lockEntryId,
        reservedCredits: lockContext.reservedCredits,
        reversalReason: "Lock Debit Reversal - Lesson Canceled",
      });
      console.info(
        `[LESSON_CANCEL] Lock reversal created reservation=${reservation.recordId} lesson=${recordId}`,
      );
      reversalCreated = true;
    }

    console.info(
      `[LESSON_CANCEL] Releasing locked reservation=${reservation.recordId} lesson=${recordId}`,
    );
    await reservationsRepo.releaseReservation(reservation.recordId, "Lesson Canceled", new Date().toISOString(), notes);
    console.info(
      `[LESSON_CANCEL] Locked reservation released reservation=${reservation.recordId} lesson=${recordId}`,
    );

    if (isClientCanceled) {
      const expectedDelta = -1 * lockContext.reservedCredits;
      const existingLessonDebits = await listLessonDebitEntriesForLesson(recordId);
      if (existingLessonDebits.length > 1) {
        fail(endpoint, "ambiguity", recordId, "Multiple Lesson Debit entries already exist for lesson.", 409);
      }
      let lessonDebitId: string | null = null;
      if (existingLessonDebits.length === 1) {
        const existing = existingLessonDebits[0];
        if (existing.deltaCredits == null || existing.deltaCredits !== expectedDelta) {
          fail(endpoint, "validation", recordId, "Existing Lesson Debit amount does not match -1 * Reserved Credits.");
        }
        lessonDebitId = existing.recordId;
      } else {
        const created = await createLessonDebit({
          creditAccountRecordId: lockContext.creditAccountId,
          lessonRecordId: recordId,
          deltaCredits: expectedDelta,
        });
        lessonDebitId = created.recordId;
      }

      if (lessonDebitId) {
        await allocateDebitAcrossOpenLots({
          lessonRecordId: recordId,
          creditAccountRecordId: lockContext.creditAccountId,
          ledgerEntryRecordId: lessonDebitId,
          debitCredits: Math.abs(expectedDelta),
        });
      }
    }

    return {
      ok: true,
      endpoint,
      recordId,
      result: "succeeded",
      reservationResolved: true,
      reservationResolution: "Released",
      reversalCreated: reversalCreated || Boolean(lockContext.existingReversalId),
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
    };
  }
  if (status === "completed") fail(endpoint, "validation", recordId, "Lesson is already Completed.");
  if (status === "canceled" || status === "cancelled") fail(endpoint, "validation", recordId, "Lesson is already Canceled.");
  if (status === "draft") fail(endpoint, "validation", recordId, "Cannot mark a Draft lesson as No-Show.");
  if (lesson.isTerminalLesson === true) fail(endpoint, "validation", recordId, "Lesson is already terminal.");
  if (status !== "scheduled") fail(endpoint, "validation", recordId, "Lesson Status must be Scheduled.");
  if (lesson.futureStartAt === true) fail(endpoint, "validation", recordId, "Lesson must be past-due.");

  const reservations = await reservationsRepo.listReservationsForLesson(recordId);
  const activeReservations = reservations.filter((row) => isActiveReservationStatus(row.status));
  if (activeReservations.length > 1) {
    fail(endpoint, "ambiguity", recordId, "Multiple active reservations found for Lesson.", 409);
  }

  await updateLessonToNoShow({ lessonRecordId: recordId, notes });

  const reservation = activeReservations[0] ?? null;
  if (!reservation) {
    return {
      ok: true,
      endpoint,
      recordId,
      result: "succeeded",
      reservationResolved: false,
      reservationResolution: null,
      writebackStatus: "Succeeded",
    };
  }

  try {
    const lockEntries = await reservationsRepo.listLockDebitEntries(reservation.recordId);
    if (lockEntries.length > 1) {
      fail(endpoint, "ambiguity", recordId, "Multiple Reservation Lock Debit entries found for reservation.", 409);
    }
    if (lockEntries.length === 1) {
      await reservationsRepo.consumeReservation(reservation.recordId, "Lesson No-Show", new Date().toISOString());
      return {
        ok: true,
        endpoint,
        recordId,
        result: "succeeded",
        reservationResolved: true,
        reservationResolution: "Consumed",
        writebackStatus: "Succeeded",
      };
    }

    await reservationsRepo.releaseReservation(reservation.recordId, "Lesson No-Show", new Date().toISOString(), notes);
    return {
      ok: true,
      endpoint,
      recordId,
      result: "succeeded",
      reservationResolved: true,
      reservationResolution: "Released",
      writebackStatus: "Succeeded",
    };
  } catch (error) {
    console.error("[LESSON_NO_SHOW] Reservation writeback failed:", error);
    return {
      ok: true,
      endpoint,
      recordId,
      result: "succeeded",
      reservationResolved: false,
      reservationResolution: null,
      writebackStatus: "Failed",
    };
  }
}
