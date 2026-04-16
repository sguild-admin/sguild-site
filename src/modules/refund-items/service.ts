import { NextResponse } from "next/server";
import { SyncEndpointError } from "@/lib/errors";
import { assertJsonRequest, parseJsonBody } from "@/lib/http/request";
import { getCreditAccountById, findCreditAccountByProfile } from "@/modules/credit-accounts";
import { assertAuthorizedSyncRequest } from "@/modules/integrations";
import type {
  RefundItemDebitFailureResponseDto,
  RefundItemDebitFailureStage,
  RefundItemDebitRequestDto,
  RefundItemDebitResponseDto,
  RefundItemDebitSuccessResponseDto,
} from "./dto";
import { parseRefundItemDebitBody } from "./schema";
import {
  createRefundDebitEntry,
  findRefundDebitBySourceKey,
  getRefundItemById,
  getRefundItemDebitRecord,
  getOrderClientProfileId,
  listRefundDebitEntriesForRefundItem,
} from "./repo";

const ENDPOINT = "/api/refund-items/debit";

class RefundItemDebitEndpointError extends SyncEndpointError {
  readonly stage: RefundItemDebitFailureStage;
  readonly recordId: string;

  constructor(
    stage: RefundItemDebitFailureStage,
    recordId: string,
    message: string,
    status: number,
  ) {
    super(message, status);
    this.name = "RefundItemDebitEndpointError";
    this.stage = stage;
    this.recordId = recordId;
  }
}

function fail(
  stage: RefundItemDebitFailureStage,
  recordId: string,
  message: string,
  status = 422,
): never {
  throw new RefundItemDebitEndpointError(stage, recordId, message, status);
}

function normalizeStatus(value: string | null): string {
  return (value ?? "").trim().toLowerCase();
}

function assertPositiveInteger(
  stage: RefundItemDebitFailureStage,
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
): { status: number; body: RefundItemDebitFailureResponseDto } {
  if (error instanceof RefundItemDebitEndpointError) {
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
        stage: error.status === 409 ? "ambiguity" : "validation",
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

export async function getRefundItem(recordId: string) {
  return getRefundItemById(recordId);
}

export async function createRefundDebit(
  input: RefundItemDebitRequestDto,
): Promise<RefundItemDebitSuccessResponseDto> {
  const refundItem = await getRefundItemDebitRecord(input.recordId);

  if (normalizeStatus(refundItem.refundStatus) !== "completed") {
    fail("validation", input.recordId, 'Refund Status must be "Completed".');
  }

  const creditsRevoked = assertPositiveInteger(
    "validation",
    input.recordId,
    refundItem.creditsRevoked,
    "Credits Revoked",
  );

  if (refundItem.hasRefundImpactingException) {
    fail(
      "validation",
      input.recordId,
      "Refund Item has Refund impacting exception.",
    );
  }

  if (!refundItem.orderId) {
    fail(
      "validation",
      input.recordId,
      "Refund Item is missing Order context.",
    );
  }

  const orderClientProfileId = await getOrderClientProfileId(refundItem.orderId);
  if (!orderClientProfileId) {
    fail(
      "validation",
      input.recordId,
      "Order is missing Client Profile link.",
    );
  }

  const expectedDelta = refundItem.expectedRefundDebitCredits ?? (-1 * creditsRevoked);
  if (!Number.isInteger(expectedDelta) || expectedDelta >= 0) {
    fail(
      "validation",
      input.recordId,
      "Expected Refund Debit Credits must be a negative integer.",
    );
  }

  if (expectedDelta !== -1 * creditsRevoked) {
    fail(
      "validation",
      input.recordId,
      "Expected Refund Debit Credits does not match Credits Revoked.",
    );
  }

  const sourceKey = `REFUND | ${input.recordId}`;
  const [sourceKeyMatch, linkedDebits] = await Promise.all([
    findRefundDebitBySourceKey(sourceKey),
    listRefundDebitEntriesForRefundItem(input.recordId),
  ]);

  const existingDebits = dedupeByRecordId(
    sourceKeyMatch ? [sourceKeyMatch, ...linkedDebits] : linkedDebits,
  );

  if (existingDebits.length > 1) {
    fail(
      "validation",
      input.recordId,
      "Multiple Refund Debit ledger entries already exist for this Refund Item.",
      409,
    );
  }

  if (existingDebits.length === 1) {
    const existing = existingDebits[0];
    if (existing.deltaCredits == null || existing.deltaCredits !== expectedDelta) {
      fail(
        "validation",
        input.recordId,
        "Existing Refund Debit amount does not match Expected Refund Debit Credits.",
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

  if (refundItem.hasRefundDebit) {
    fail(
      "validation",
      input.recordId,
      "Refund Item indicates existing debit, but no Refund Debit ledger entry was found.",
    );
  }

  let account;
  try {
    account = await findCreditAccountByProfile(orderClientProfileId);
  } catch (error) {
    if (error instanceof SyncEndpointError && error.status === 409) {
      fail("ambiguity", input.recordId, error.message, 409);
    }
    throw error;
  }

  if (!account) {
    fail(
      "validation",
      input.recordId,
      `No Credit Account found for Client Profile ${orderClientProfileId}.`,
    );
  }

  const hydratedAccount = await getCreditAccountById(account.recordId);
  if (!hydratedAccount.status) {
    fail("validation", input.recordId, "Credit Account is missing Status.");
  }
  if (hydratedAccount.status === "Closed") {
    fail("validation", input.recordId, "Credit Account is Closed.");
  }
  if (hydratedAccount.status === "Paused") {
    console.warn(
      `[REFUND_ITEM_DEBIT] Proceeding with paused Credit Account ${hydratedAccount.recordId} for Refund Item ${input.recordId}.`,
    );
  }

  const created = await createRefundDebitEntry({
    refundItemRecordId: input.recordId,
    creditAccountRecordId: hydratedAccount.recordId,
    deltaCredits: expectedDelta,
  });

  if (created.deltaCredits == null) {
    fail("execution", input.recordId, "Created Refund Debit is missing Delta Credits.", 500);
  }

  return {
    ok: true,
    endpoint: ENDPOINT,
    recordId: input.recordId,
    result: "succeeded",
    ledgerEntryId: created.recordId,
    deltaCredits: created.deltaCredits,
    writebackStatus: "Succeeded",
  };
}

export async function handleRefundItemDebit(
  request: Request,
): Promise<NextResponse<RefundItemDebitResponseDto>> {
  let recordId = "unknown";
  try {
    assertAuthorizedSyncRequest(request);
    assertJsonRequest(request);
    const body = await parseJsonBody(request);
    const parsed = parseRefundItemDebitBody(body);
    recordId = parsed.recordId;
    const response = await createRefundDebit(parsed);
    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    const { status, body } = toFailureResponse(error, recordId);
    return NextResponse.json(body, { status });
  }
}
