import { SyncEndpointError } from "@/lib/errors";
import { parseSquareErrorMessage, squareRawRequest } from "./client";
import type { SquareCard } from "./schema";
import type { SquareAuthContext } from "./types";

export type NormalizedSquareCard = {
  id: string;
  brand: string;
  last4: string;
  expMonth: number | null;
  expYear: number | null;
  cardholderName: string;
  enabled: boolean;
};

type SquareListCardsResponse = {
  cards?: SquareCard[];
  cursor?: string;
};

function sanitizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeCard(card: SquareCard): NormalizedSquareCard {
  const brand = sanitizeString(card.card_brand).toUpperCase() || "UNKNOWN";
  const last4 = sanitizeString(card.last_4);
  const cardholderName = sanitizeString(card.cardholder_name);

  return {
    id: card.id,
    brand,
    last4,
    expMonth: typeof card.exp_month === "number" ? card.exp_month : null,
    expYear: typeof card.exp_year === "number" ? card.exp_year : null,
    cardholderName,
    enabled: card.enabled !== false,
  };
}

export async function fetchSquareCards(
  context: SquareAuthContext,
  externalCustomerId: string,
): Promise<NormalizedSquareCard[]> {
  const cards: NormalizedSquareCard[] = [];
  let cursor: string | null = null;

  do {
    const params = new URLSearchParams({
      customer_id: externalCustomerId,
      include_disabled: "true",
    });
    if (cursor) params.set("cursor", cursor);

    const response = await squareRawRequest(`/v2/cards?${params.toString()}`, { method: "GET" }, context);

    let body: SquareListCardsResponse | Record<string, unknown> = {};
    try {
      body = (await response.json()) as SquareListCardsResponse | Record<string, unknown>;
    } catch {
      // handled below via response.ok
    }

    if (!response.ok) {
      throw new SyncEndpointError(
        `Failed to fetch Square cards: ${parseSquareErrorMessage(body)}`,
        502,
      );
    }

    const responseCards = (body as SquareListCardsResponse).cards;
    if (Array.isArray(responseCards)) {
      for (const card of responseCards) {
        if (typeof card.id !== "string" || card.id.trim().length === 0) continue;
        cards.push(normalizeCard(card));
      }
    }

    cursor = typeof (body as SquareListCardsResponse).cursor === "string"
      ? ((body as SquareListCardsResponse).cursor as string)
      : null;
  } while (cursor);

  return cards;
}
