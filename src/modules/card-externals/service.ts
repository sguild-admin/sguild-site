import { SyncEndpointError } from "@/lib/errors";
import { airtableSchema } from "@/config/airtable-schema";
import { cardExternalsRepo } from "./repo";
import {
  parseSyncRecordId,
  resolveSquareContext,
} from "./schema";
import type { CardSyncErrorResponse, CardSyncSuccessResponse } from "./dto";

const OPERATION = "sync_card_external";
const CARD_EXTERNAL_FIELDS = airtableSchema.operations.fields.cardExternals;

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
  existingRows: Array<{ externalCardId: string | null; recordId: string; active: boolean }>,
): Map<string, { externalCardId: string | null; recordId: string; active: boolean }> {
  const map = new Map<string, { externalCardId: string | null; recordId: string; active: boolean }>();
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
  const clientExternal = await cardExternalsRepo.loadClientExternal(recordId);
  assertOperationalPrerequisites(clientExternal);

  const squareContext = resolveSquareContext(clientExternal);
  const externalCustomerId = clientExternal.externalCustomerId as string;
  const cards = await cardExternalsRepo.fetchSquareCardsForCustomer(squareContext, externalCustomerId);
  const existingRows = await cardExternalsRepo.listExistingCardExternals(clientExternal.recordId);
  const existingMap = existingByExternalCardId(existingRows);

  let createdCount = 0;
  let updatedCount = 0;
  let disabledCount = 0;
  const returnedIds = new Set<string>();

  for (const card of cards) {
    returnedIds.add(card.id);
    const baseFields = {
      [CARD_EXTERNAL_FIELDS.externalCardId]: card.id,
      [CARD_EXTERNAL_FIELDS.clientExternal]: [clientExternal.recordId],
      [CARD_EXTERNAL_FIELDS.status]: "Active",
      [CARD_EXTERNAL_FIELDS.brand]: card.brand,
      [CARD_EXTERNAL_FIELDS.last4]: card.last4,
      [CARD_EXTERNAL_FIELDS.expMonth]: card.expMonth,
      [CARD_EXTERNAL_FIELDS.expYear]: card.expYear,
      [CARD_EXTERNAL_FIELDS.cardholderName]: card.cardholderName,
    };

    const existing = existingMap.get(card.id);
    const fallbackExisting =
      existing ??
      (await cardExternalsRepo.findExistingCardExternalByKey(clientExternal.recordId, card.id));

    if (fallbackExisting) {
      await cardExternalsRepo.updateCardExternalRecord(fallbackExisting.recordId, baseFields);
      updatedCount += 1;
      existingMap.set(card.id, fallbackExisting);
    } else {
      await cardExternalsRepo.createCardExternalRecord(baseFields);
      createdCount += 1;
    }
  }

  for (const row of existingRows) {
    if (!row.externalCardId) continue;
    if (returnedIds.has(row.externalCardId)) continue;
    if (!row.active) continue;
    await cardExternalsRepo.disableCardExternalRecord(row.recordId);
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
