import {
  createCardExternal,
  disableCardExternal,
  findCardExternalByKey,
  getClientExternalRecord,
  listCardExternalsByClientExternal,
  updateCardExternal,
} from "@/lib/airtable/card-external-sync";
import { fetchSquareCards } from "@/lib/providers/square/card-external-sync";
import { validateAirtableSecret } from "@/modules/clients/client.repo";
import type { SquareContext } from "./schema";

export function validateCardsSecret(request: Request): void {
  validateAirtableSecret(request);
}

export async function loadClientExternal(recordId: string) {
  return getClientExternalRecord(recordId);
}

export async function listExistingCardExternals(clientExternalRecordId: string) {
  return listCardExternalsByClientExternal(clientExternalRecordId);
}

export async function findExistingCardExternalByKey(
  clientExternalRecordId: string,
  externalCardId: string,
) {
  return findCardExternalByKey(clientExternalRecordId, externalCardId);
}

export async function createCardExternalRecord(
  fields: Parameters<typeof createCardExternal>[0],
) {
  return createCardExternal(fields);
}

export async function updateCardExternalRecord(
  recordId: string,
  fields: Parameters<typeof updateCardExternal>[1],
) {
  return updateCardExternal(recordId, fields);
}

export async function disableCardExternalRecord(recordId: string) {
  return disableCardExternal(recordId);
}

export async function fetchSquareCardsForCustomer(
  context: SquareContext,
  externalCustomerId: string,
) {
  return fetchSquareCards(context, externalCustomerId);
}
