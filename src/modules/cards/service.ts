import { SyncEndpointError } from "@/lib/errors";
import { cardsRepo } from "./repo";
import {
  parseSyncRecordId,
  resolveSquareContext,
} from "./schema";
import type { CardSyncErrorResponse, CardSyncSuccessResponse } from "./dto";

const OPERATION = "sync_card_external";

function toCardSummary(card: {
  brand: string;
  last4: string;
  expMonth: number | null;
  expYear: number | null;
}): string {
  const mm = card.expMonth != null ? String(card.expMonth).padStart(2, "0") : "??";
  const yyyy = card.expYear != null ? String(card.expYear) : "????";
  const last4 = card.last4 || "????";
  return `${card.brand} •••• ${last4} | ${mm}/${yyyy}`;
}

function assertOperationalPrerequisites(clientExternal: {
  providerAccountId: string | null;
  clientId: string | null;
  externalCustomerId: string | null;
  cardSyncEligible: boolean | null;
}): void {
  if (!clientExternal.providerAccountId) {
    throw new SyncEndpointError("Missing provider account.", 422);
  }

  if (!clientExternal.clientId) {
    throw new SyncEndpointError("Missing client link.", 422);
  }

  if (!clientExternal.externalCustomerId) {
    throw new SyncEndpointError("Missing external customer id.", 422);
  }

  if (clientExternal.cardSyncEligible === false) {
    throw new SyncEndpointError("Card sync not eligible for this Client External.", 422);
  }
}

function existingByExternalCardId(
  existingRows: Array<{ externalCardId: string | null; recordId: string; enabled: boolean }>,
): Map<string, { externalCardId: string | null; recordId: string; enabled: boolean }> {
  const map = new Map<string, { externalCardId: string | null; recordId: string; enabled: boolean }>();
  for (const row of existingRows) {
    if (row.externalCardId) map.set(row.externalCardId, row);
  }
  return map;
}

function successResponse(cardsFound: number): CardSyncSuccessResponse {
  return {
    ok: true,
    syncStatus: "Synced",
    cardsFound,
  };
}

export function mapCardSyncError(error: unknown): { status: number; body: CardSyncErrorResponse } {
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
      error: "Unexpected server error.",
    },
  };
}

export async function runCardExternalSync(recordId: string): Promise<CardSyncSuccessResponse> {
  const clientExternal = await cardsRepo.loadClientExternal(recordId);
  assertOperationalPrerequisites(clientExternal);

  const squareContext = resolveSquareContext(clientExternal);
  const externalCustomerId = clientExternal.externalCustomerId as string;
  const cards = await cardsRepo.fetchSquareCardsForCustomer(squareContext, externalCustomerId);
  const existingRows = await cardsRepo.listExistingCardExternals(clientExternal.recordId);
  const existingMap = existingByExternalCardId(existingRows);

  let createdCount = 0;
  let updatedCount = 0;
  let disabledCount = 0;
  const returnedIds = new Set<string>();

  for (const card of cards) {
    returnedIds.add(card.id);
    const baseFields = {
      "External Card ID": card.id,
      "Client External": [clientExternal.recordId],
      "Card Brand": card.brand,
      "Last 4": card.last4,
      "Exp Month": card.expMonth,
      "Exp Year": card.expYear,
      "Cardholder Name": card.cardholderName,
      Enabled: true,
      "Card Summary": toCardSummary(card),
    };

    const existing = existingMap.get(card.id);
    const fallbackExisting =
      existing ??
      (await cardsRepo.findExistingCardExternalByKey(clientExternal.recordId, card.id));

    if (fallbackExisting) {
      await cardsRepo.updateCardExternalRecord(fallbackExisting.recordId, baseFields);
      updatedCount += 1;
      existingMap.set(card.id, fallbackExisting);
    } else {
      await cardsRepo.createCardExternalRecord(baseFields);
      createdCount += 1;
    }
  }

  for (const row of existingRows) {
    if (!row.externalCardId) continue;
    if (returnedIds.has(row.externalCardId)) continue;
    if (!row.enabled) continue;
    await cardsRepo.disableCardExternalRecord(row.recordId);
    disabledCount += 1;
  }

  console.info("Card external sync completed", {
    operation: OPERATION,
    recordId: clientExternal.recordId,
    provider: squareContext.provider,
    providerAccountId: squareContext.providerAccountId,
    externalCustomerId,
    cardsReturned: cards.length,
    rowsCreated: createdCount,
    rowsUpdated: updatedCount,
    rowsDisabled: disabledCount,
    outcome: "success",
  });

  return successResponse(cards.length);
}

export async function runCardSync(body: unknown) {
  const recordId = parseSyncRecordId(body);
  return runCardExternalSync(recordId);
}

