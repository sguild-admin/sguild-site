import { NextResponse } from "next/server";
import { SyncEndpointError } from "@/lib/errors";
import { assertJsonRequest, parseJsonBody } from "@/lib/http/request";
import { getCreditAccountById } from "@/modules/credit-accounts";
import { assertAuthorizedSyncRequest } from "@/modules/integrations";
import type {
  LessonDebitFailureResponseDto,
  LessonDebitFailureStage,
  LessonDebitRequestDto,
  LessonDebitResponseDto,
  LessonDebitSuccessResponseDto,
} from "./dto";
import { parseLessonDebitBody } from "./schema";
import {
  allocateDebitAcrossOpenLots,
  createLessonDebitEntry,
  findLessonDebitBySourceKey,
  getLessonDebitLessonRecord,
  listLessonDebitEntriesForLesson,
} from "./repo";

const ENDPOINT = "/api/lessons/debit";

class LessonDebitEndpointError extends SyncEndpointError {
  readonly stage: LessonDebitFailureStage;
  readonly recordId: string;

  constructor(
    stage: LessonDebitFailureStage,
    recordId: string,
    message: string,
    status: number,
  ) {
    super(message, status);
    this.name = "LessonDebitEndpointError";
    this.stage = stage;
    this.recordId = recordId;
  }
}

function fail(
  stage: LessonDebitFailureStage,
  recordId: string,
  message: string,
  status = 422,
): never {
  throw new LessonDebitEndpointError(stage, recordId, message, status);
}

function normalizeStatus(value: string | null): string {
  return (value ?? "").trim().toLowerCase();
}

function assertPositiveInteger(
  stage: LessonDebitFailureStage,
  recordId: string,
  value: number | null,
  label: string,
): number {
  if (value == null || !Number.isInteger(value) || value <= 0) {
    fail(stage, recordId, `${label} must be a positive integer.`);
  }
  return value;
}

function toFailureResponse(
  error: unknown,
  fallbackRecordId = "unknown",
): { status: number; body: LessonDebitFailureResponseDto } {
  if (error instanceof LessonDebitEndpointError) {
    return {
      status: error.status,
      body: {
        ok: false,
        endpoint: ENDPOINT,
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
        endpoint: ENDPOINT,
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
      endpoint: ENDPOINT,
      recordId: fallbackRecordId,
      stage: "execution",
      error: error instanceof Error ? error.message : "Unexpected server error.",
    },
  };
}

function dedupeByRecordId<T extends { recordId: string }>(rows: T[]): T[] {
  const byId = new Map<string, T>();
  for (const row of rows) {
    byId.set(row.recordId, row);
  }
  return [...byId.values()];
}

export async function runLessonDebit(
  input: LessonDebitRequestDto,
): Promise<LessonDebitSuccessResponseDto> {
  const lesson = await getLessonDebitLessonRecord(input.recordId);

  if (normalizeStatus(lesson.status) !== "completed") {
    fail("validation", input.recordId, "Lesson Status must be Completed.");
  }

  if (lesson.hasCreditLedgerImpactingException) {
    fail(
      "validation",
      input.recordId,
      "Lesson has Credit Ledger impacting exception.",
    );
  }

  if (!lesson.payingCreditAccountId) {
    fail("validation", input.recordId, "Lesson must link a Paying Credit Account.");
  }

  const expectedCost = assertPositiveInteger(
    "validation",
    input.recordId,
    lesson.expectedLessonCreditCost,
    "Expected Lesson Credit Cost",
  );
  const expectedDelta = lesson.expectedDebitCredits ?? -1 * expectedCost;

  const sourceKey = `LESSON | ${input.recordId}`;
  const [sourceKeyMatch, linkedDebits] = await Promise.all([
    findLessonDebitBySourceKey(sourceKey),
    listLessonDebitEntriesForLesson(input.recordId),
  ]);

  const existingDebits = dedupeByRecordId(
    sourceKeyMatch ? [sourceKeyMatch, ...linkedDebits] : linkedDebits,
  );

  if (existingDebits.length > 1) {
    fail("validation", input.recordId, "Multiple Lesson Debit entries already exist.");
  }

  if (existingDebits.length === 1) {
    const existing = existingDebits[0];
    if (existing.deltaCredits == null || existing.deltaCredits !== expectedDelta) {
      fail(
        "validation",
        input.recordId,
        "Existing Lesson Debit amount does not match Expected Debit Credits.",
      );
    }
    return {
      ok: true,
      endpoint: ENDPOINT,
      recordId: input.recordId,
      result: "noop",
      ledgerEntryId: existing.recordId,
      deltaCredits: existing.deltaCredits,
      writebackStatus: "Succeeded",
    };
  }

  if (lesson.hasLockDebitViaReservation) {
    return {
      ok: true,
      endpoint: ENDPOINT,
      recordId: input.recordId,
      result: "noop",
      writebackStatus: "Succeeded",
    };
  }

  if (lesson.hasLessonDebit) {
    fail(
      "validation",
      input.recordId,
      "Lesson indicates existing debit, but no Lesson Debit ledger entry was found.",
    );
  }

  const account = await getCreditAccountById(lesson.payingCreditAccountId);
  if (account.status === "Closed") {
    fail("validation", input.recordId, "Credit Account is Closed.");
  }
  if (account.status === "Paused") {
    console.warn(
      `[LESSON_DEBIT] Proceeding with paused Credit Account ${account.recordId} for Lesson ${input.recordId}.`,
    );
  }
  if (!account.status) {
    fail("validation", input.recordId, "Credit Account is missing Status.");
  }
  if (account.balanceCredits != null && Number.isFinite(account.balanceCredits)) {
    const projectedBalance = account.balanceCredits + expectedDelta;
    if (projectedBalance < 0) {
      console.warn(
        `[LESSON_DEBIT] Projected negative balance (${projectedBalance}) for Credit Account ${account.recordId} on Lesson ${input.recordId}. Proceeding per policy.`,
      );
    }
  }

  const created = await createLessonDebitEntry({
    lessonRecordId: input.recordId,
    creditAccountRecordId: lesson.payingCreditAccountId,
    deltaCredits: expectedDelta,
  });
  if (created.deltaCredits == null) {
    fail("execution", input.recordId, "Created Lesson Debit is missing Delta Credits.", 500);
  }

  let writebackStatus: "Succeeded" | "Failed" = "Succeeded";
  try {
    await allocateDebitAcrossOpenLots({
      lessonRecordId: input.recordId,
      creditAccountRecordId: lesson.payingCreditAccountId,
      ledgerEntryRecordId: created.recordId,
      debitCredits: Math.abs(created.deltaCredits),
    });
  } catch (error) {
    console.error("[LESSON_DEBIT] Lot allocation failed:", error);
    writebackStatus = "Failed";
  }

  return {
    ok: true,
    endpoint: ENDPOINT,
    recordId: input.recordId,
    result: "succeeded",
    ledgerEntryId: created.recordId,
    deltaCredits: created.deltaCredits,
    writebackStatus,
  };
}

export async function handleLessonDebit(request: Request): Promise<NextResponse<LessonDebitResponseDto>> {
  let recordId = "unknown";
  try {
    assertAuthorizedSyncRequest(request);
    assertJsonRequest(request);
    const body = await parseJsonBody(request);
    const parsed = parseLessonDebitBody(body);
    recordId = parsed.recordId;
    const response = await runLessonDebit(parsed);
    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    const { status, body } = toFailureResponse(error, recordId);
    return NextResponse.json(body, { status });
  }
}
