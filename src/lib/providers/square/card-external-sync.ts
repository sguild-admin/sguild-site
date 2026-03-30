import { SyncEndpointError } from "@/lib/errors";
import { SquareContext } from "@/modules/cards/schema";

const DEFAULT_SQUARE_BASE_URL = "https://connect.squareup.com";
const DEFAULT_SQUARE_VERSION = "2024-06-04";

type SquareErrorResponse = {
  errors?: Array<{
    category?: string;
    code?: string;
    detail?: string;
  }>;
};

type SquareCard = {
  id: string;
  card_brand?: string;
  last_4?: string;
  exp_month?: number;
  exp_year?: number;
  cardholder_name?: string;
  enabled?: boolean;
};

type SquareListCardsResponse = {
  cards?: SquareCard[];
  cursor?: string;
};

export type NormalizedSquareCard = {
  id: string;
  brand: string;
  last4: string;
  expMonth: number | null;
  expYear: number | null;
  cardholderName: string;
  enabled: boolean;
};

function getSquareBaseUrl(): string {
  return process.env.SQUARE_API_BASE_URL?.trim() || DEFAULT_SQUARE_BASE_URL;
}

function squareHeaders(accessToken: string): HeadersInit {
  return {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    "Square-Version": process.env.SQUARE_API_VERSION?.trim() || DEFAULT_SQUARE_VERSION,
  };
}

function parseSquareErrorMessage(body: unknown): string {
  const data = body as SquareErrorResponse;
  const first = data.errors?.[0];
  return first?.detail || first?.code || "Square request failed.";
}

function sanitizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

async function squareRequest(
  pathWithQuery: string,
  context: SquareContext,
): Promise<Response> {
  const response = await fetch(`${getSquareBaseUrl()}${pathWithQuery}`, {
    method: "GET",
    headers: squareHeaders(context.accessToken),
    cache: "no-store",
  });
  return response;
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
  context: SquareContext,
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

    const response = await squareRequest(`/v2/cards?${params.toString()}`, context);

    let body: SquareListCardsResponse | SquareErrorResponse = {};
    try {
      body = (await response.json()) as SquareListCardsResponse | SquareErrorResponse;
    } catch {
      // handled below via response.ok
    }

    if (!response.ok) {
      throw new SyncEndpointError(
        `Failed to fetch Square cards: ${parseSquareErrorMessage(body)}`,
        502,
      );
    }

    if ("cards" in body && Array.isArray(body.cards)) {
      for (const card of body.cards) {
        if (typeof card.id !== "string" || card.id.trim().length === 0) continue;
        cards.push(normalizeCard(card));
      }
    }

    cursor = "cursor" in body && typeof body.cursor === "string" ? body.cursor : null;
  } while (cursor);

  return cards;
}

