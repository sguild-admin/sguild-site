import { NextResponse } from "next/server";
import { assertJsonRequest, parseJsonBody } from "@/lib/http/request";
import { SyncEndpointError } from "@/lib/errors";
import { assertAuthorizedSyncRequest } from "@/modules/integrations";
import {
  ensureCreditAccountForProfile,
  getCreditAccountById,
} from "@/modules/credit-accounts";
import type {
  AppendCreditLedgerEntryRequestDto,
  AppendCreditLedgerEntryResponseDto,
  AppendLessonDebitRequestDto,
  AppendLessonDebitResponseDto,
  AppendPurchaseCreditEntriesInputDto,
  AppendPurchaseCreditEntriesResultDto,
  CreditLedgerEntriesErrorResponseDto,
  CreditLedgerEntryType,
} from "./dto";
import {
  createCreditLedgerEntry,
  findClientProfileByClientId,
  findLedgerEntryBySource,
  getLessonCreditsRecord,
  getOrderClientId,
  getOrderItemCredits,
  listOrderItemsForOrder,
} from "./repo";
import { parseAppendCreditLedgerEntryBody, parseAppendLessonDebitBody } from "./schema";

function assertIntegerDelta(deltaCredits: number): void {
  if (!Number.isInteger(deltaCredits)) {
    throw new SyncEndpointError("deltaCredits must be an integer.", 422);
  }
}

function assertSourceShape(input: {
  entryType: CreditLedgerEntryType;
  orderItemRecordId?: string;
  lessonRecordId?: string;
  refundItemRecordId?: string;
  creditReservationRecordId?: string;
}): void {
  const hasOrderItem = Boolean(input.orderItemRecordId);
  const hasLesson = Boolean(input.lessonRecordId);
  const hasRefundItem = Boolean(input.refundItemRecordId);
  const hasCreditReservation = Boolean(input.creditReservationRecordId);

  if (input.entryType === "Purchase Credit") {
    if (!hasOrderItem || hasLesson || hasRefundItem || hasCreditReservation) {
      throw new SyncEndpointError(
        "Purchase Credit requires orderItemRecordId only.",
        422,
      );
    }
    return;
  }

  if (input.entryType === "Lesson Debit") {
    if (!hasLesson || hasOrderItem || hasRefundItem || hasCreditReservation) {
      throw new SyncEndpointError(
        "Lesson Debit requires lessonRecordId only.",
        422,
      );
    }
    return;
  }

  if (input.entryType === "Credit Forfeit") {
    if (!hasLesson || hasOrderItem || hasRefundItem || hasCreditReservation) {
      throw new SyncEndpointError(
        "Credit Forfeit requires lessonRecordId only.",
        422,
      );
    }
    return;
  }

  if (input.entryType === "Refund Debit") {
    if (!hasRefundItem || hasOrderItem || hasLesson || hasCreditReservation) {
      throw new SyncEndpointError(
        "Refund Debit requires refundItemRecordId only.",
        422,
      );
    }
    return;
  }

  if (input.entryType === "Reservation Lock Debit") {
    if (!hasCreditReservation || hasOrderItem || hasLesson || hasRefundItem) {
      throw new SyncEndpointError(
        "Reservation Lock Debit requires creditReservationRecordId only.",
        422,
      );
    }
    return;
  }

  if (
    input.entryType === "Adjustment" &&
    (hasOrderItem || hasLesson || hasRefundItem || hasCreditReservation)
  ) {
    throw new SyncEndpointError(
      "Adjustment cannot include source links.",
      422,
    );
  }
}

async function assertAmountMatches(input: AppendCreditLedgerEntryRequestDto): Promise<void> {
  if (input.entryType === "Purchase Credit" && input.orderItemRecordId) {
    const orderItem = await getOrderItemCredits(input.orderItemRecordId);
    if (orderItem.creditsGrantedTotal == null) {
      throw new SyncEndpointError(
        "Order Item is missing Credits Granted Total.",
        422,
      );
    }
    if (!Number.isInteger(orderItem.creditsGrantedTotal)) {
      throw new SyncEndpointError(
        "Order Item Credits Granted Total must be an integer.",
        422,
      );
    }
    if (input.deltaCredits !== orderItem.creditsGrantedTotal) {
      throw new SyncEndpointError(
        "Purchase Credit delta does not match Order Item Credits Granted Total.",
        422,
      );
    }
  }

  if (input.entryType === "Lesson Debit" && input.lessonRecordId) {
    const lesson = await getLessonCreditsRecord(input.lessonRecordId);
    if (lesson.creditsCost == null) {
      throw new SyncEndpointError("Lesson is missing Credits Cost.", 422);
    }
    if (!Number.isInteger(lesson.creditsCost)) {
      throw new SyncEndpointError("Lesson Credits Cost must be an integer.", 422);
    }
    const expectedDelta = -1 * lesson.creditsCost;
    if (input.deltaCredits !== expectedDelta) {
      throw new SyncEndpointError(
        "Lesson Debit delta does not match -1 * Lesson Credits Cost.",
        422,
      );
    }
  }

  if (input.entryType === "Credit Forfeit" && input.lessonRecordId) {
    const lesson = await getLessonCreditsRecord(input.lessonRecordId);
    if (lesson.creditsCost == null) {
      throw new SyncEndpointError("Lesson is missing Credits Cost.", 422);
    }
    if (!Number.isInteger(lesson.creditsCost)) {
      throw new SyncEndpointError("Lesson Credits Cost must be an integer.", 422);
    }
    const expectedDelta = -1 * lesson.creditsCost;
    if (input.deltaCredits !== expectedDelta) {
      throw new SyncEndpointError(
        "Credit Forfeit delta does not match -1 * Lesson Credits Cost.",
        422,
      );
    }
  }
}

function assertAccountAcceptsEntries(status: string | null): void {
  if (status === "Closed") {
    throw new SyncEndpointError("Credit Account is Closed.", 422);
  }
}

export async function appendCreditLedgerEntry(
  input: AppendCreditLedgerEntryRequestDto,
): Promise<AppendCreditLedgerEntryResponseDto> {
  if (!input.creditAccountRecordId) {
    throw new SyncEndpointError("Missing creditAccountRecordId.", 422);
  }

  assertIntegerDelta(input.deltaCredits);
  assertSourceShape(input);
  await assertAmountMatches(input);

  const account = await getCreditAccountById(input.creditAccountRecordId);
  assertAccountAcceptsEntries(account.status);

  if (input.entryType === "Purchase Credit" && input.orderItemRecordId) {
    const existing = await findLedgerEntryBySource({
      entryType: "Purchase Credit",
      orderItemRecordId: input.orderItemRecordId,
    });
    if (existing) {
      return {
        ok: true,
        creditLedgerEntryRecordId: existing.recordId,
        created: false,
      };
    }
  }

  if (input.entryType === "Lesson Debit" && input.lessonRecordId) {
    const existing = await findLedgerEntryBySource({
      entryType: "Lesson Debit",
      lessonRecordId: input.lessonRecordId,
    });
    if (existing) {
      return {
        ok: true,
        creditLedgerEntryRecordId: existing.recordId,
        created: false,
      };
    }
  }

  if (input.entryType === "Credit Forfeit" && input.lessonRecordId) {
    const existing = await findLedgerEntryBySource({
      entryType: "Credit Forfeit",
      lessonRecordId: input.lessonRecordId,
    });
    if (existing) {
      return {
        ok: true,
        creditLedgerEntryRecordId: existing.recordId,
        created: false,
      };
    }
  }

  if (input.entryType === "Reservation Lock Debit" && input.creditReservationRecordId) {
    const existing = await findLedgerEntryBySource({
      entryType: "Reservation Lock Debit",
      creditReservationRecordId: input.creditReservationRecordId,
    });
    if (existing) {
      return {
        ok: true,
        creditLedgerEntryRecordId: existing.recordId,
        created: false,
      };
    }
  }

  const occurredAt = input.occurredAt ?? new Date().toISOString();
  const created = await createCreditLedgerEntry({
    creditAccountRecordId: input.creditAccountRecordId,
    deltaCredits: input.deltaCredits,
    entryType: input.entryType,
    occurredAt,
    notes: input.notes,
    createdVia: input.createdVia,
    orderItemRecordId: input.orderItemRecordId,
    lessonRecordId: input.lessonRecordId,
    refundItemRecordId: input.refundItemRecordId,
    creditReservationRecordId: input.creditReservationRecordId,
  });

  return {
    ok: true,
    creditLedgerEntryRecordId: created.recordId,
    created: true,
  };
}

function normalizeStatus(value: string | null): string {
  return (value ?? "").trim().toLowerCase();
}

function isLessonConsumableStatus(value: string | null): boolean {
  const normalized = normalizeStatus(value);
  return (
    normalized === "completed" ||
    normalized === "complete" ||
    normalized === "no show" ||
    normalized === "no-show" ||
    normalized === "noshow"
  );
}

export async function appendLessonDebitEntry(
  input: AppendLessonDebitRequestDto,
): Promise<AppendLessonDebitResponseDto> {
  const lesson = await getLessonCreditsRecord(input.lessonRecordId);
  if (!isLessonConsumableStatus(lesson.status)) {
    throw new SyncEndpointError(
      "Lesson Debit requires Lesson status Completed or No Show.",
      422,
    );
  }
  if (lesson.creditsCost == null || !Number.isInteger(lesson.creditsCost) || lesson.creditsCost <= 0) {
    throw new SyncEndpointError("Lesson Credits Cost must be a positive integer.", 422);
  }

  const resolvedProfileRecordId =
    input.clientProfileRecordId ?? lesson.clientProfileId ?? null;
  if (!resolvedProfileRecordId) {
    throw new SyncEndpointError("Unable to resolve Client Profile from Lesson.", 422);
  }

  const ensured = await ensureCreditAccountForProfile({
    clientProfileRecordId: resolvedProfileRecordId,
  });
  const resolvedCreditAccountRecordId =
    input.creditAccountRecordId ?? ensured.creditAccountRecordId;

  if (input.creditAccountRecordId) {
    const account = await getCreditAccountById(input.creditAccountRecordId);
    if (!account.clientProfileId) {
      throw new SyncEndpointError("Provided Credit Account is missing Client Profile link.", 422);
    }
    if (account.clientProfileId !== resolvedProfileRecordId) {
      throw new SyncEndpointError(
        "Provided Credit Account does not belong to resolved Client Profile.",
        422,
      );
    }
  }

  const deltaCredits = -1 * lesson.creditsCost;
  const entry = await appendCreditLedgerEntry({
    creditAccountRecordId: resolvedCreditAccountRecordId,
    deltaCredits,
    entryType: "Lesson Debit",
    occurredAt: input.occurredAt,
    notes: input.notes,
    lessonRecordId: input.lessonRecordId,
  });

  return {
    ...entry,
    creditAccountRecordId: resolvedCreditAccountRecordId,
    lessonRecordId: input.lessonRecordId,
    deltaCredits,
  };
}

export async function appendPurchaseCreditEntriesForOrder(
  input: AppendPurchaseCreditEntriesInputDto,
): Promise<AppendPurchaseCreditEntriesResultDto> {
  const clientRecordId = await getOrderClientId(input.orderRecordId);
  if (!clientRecordId) {
    throw new SyncEndpointError("Order is missing Client link.", 422);
  }
  const clientProfileRecordId = await findClientProfileByClientId(clientRecordId);
  const ensured = await ensureCreditAccountForProfile({ clientProfileRecordId });

  const orderItems = await listOrderItemsForOrder(input.orderRecordId);
  let entriesCreated = 0;
  let entriesReused = 0;

  for (const item of orderItems) {
    if (item.creditsGrantedTotal == null || item.creditsGrantedTotal <= 0) continue;
    if (!Number.isInteger(item.creditsGrantedTotal)) {
      throw new SyncEndpointError(
        `Order Item ${item.recordId} Credits Granted Total must be an integer.`,
        422,
      );
    }

    const result = await appendCreditLedgerEntry({
      creditAccountRecordId: ensured.creditAccountRecordId,
      deltaCredits: item.creditsGrantedTotal,
      entryType: "Purchase Credit",
      occurredAt: input.occurredAt,
      notes: input.notes,
      orderItemRecordId: item.recordId,
    });

    if (result.created) entriesCreated += 1;
    else entriesReused += 1;
  }

  return {
    orderRecordId: input.orderRecordId,
    creditAccountRecordId: ensured.creditAccountRecordId,
    totalOrderItemsEvaluated: orderItems.length,
    entriesCreated,
    entriesReused,
  };
}

function toErrorResponse(
  error: unknown,
): { status: number; body: CreditLedgerEntriesErrorResponseDto } {
  if (error instanceof SyncEndpointError) {
    return {
      status: error.status,
      body: {
        ok: false,
        error: error.exposeMessage ? error.message : "Unexpected server error.",
      },
    };
  }
  return {
    status: 500,
    body: {
      ok: false,
      error: error instanceof Error ? error.message : "Unexpected server error.",
    },
  };
}

export async function handleAppendCreditLedgerEntry(request: Request): Promise<NextResponse> {
  try {
    assertAuthorizedSyncRequest(request);
    assertJsonRequest(request);
    const body = await parseJsonBody(request);
    const parsed = parseAppendCreditLedgerEntryBody(body);
    const response = await appendCreditLedgerEntry(parsed);
    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    const { status, body } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}

export async function handleAppendLessonDebit(request: Request): Promise<NextResponse> {
  try {
    assertAuthorizedSyncRequest(request);
    assertJsonRequest(request);
    const body = await parseJsonBody(request);
    const parsed = parseAppendLessonDebitBody(body);
    const response = await appendLessonDebitEntry(parsed);
    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    const { status, body } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
