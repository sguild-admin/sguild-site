import { SyncEndpointError } from "@/lib/errors";
import { squarePost } from "./client";
import type { SquareListEventsInput, SquareListEventsResult } from "./types";

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function listSquareEvents(
  input: SquareListEventsInput,
): Promise<SquareListEventsResult> {
  const body = await squarePost(
    "/v2/events",
    {
      query: {
        filter: {
          created_at: {
            start_at: input.startAt,
            end_at: input.endAt,
          },
          ...(input.eventTypes?.length ? { event_types: input.eventTypes } : {}),
        },
      },
      cursor: input.cursor ?? undefined,
      limit: input.pageSize,
    },
    input.context,
  );

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new SyncEndpointError("Square events API returned an invalid response.", 502);
  }

  const parsed = body as { events?: unknown; cursor?: unknown };
  return {
    events: Array.isArray(parsed.events) ? parsed.events : [],
    cursor: readString(parsed.cursor),
  };
}
