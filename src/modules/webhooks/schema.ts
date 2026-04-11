import { readString } from "@/lib/utils/strings";
import { SyncEndpointError } from "@/lib/errors";
import type {
  BackfillExternalActionsFromWebhookEventsRequestDto,
  BackfillSquareWebhooksRequestDto,
  MetaWebhookPayload,
  SquareWebhookPayload,
} from "./dto";

export const SUPPORTED_SQUARE_WEBHOOK_EVENTS = new Set([
  "invoice.payment_made",
  "invoice.canceled",
  "invoice.refunded",
  "refund.updated",
]);

type BackfillSquareWebhooksBody = {
  accessTokenAlias?: unknown;
  hours?: unknown;
  startAt?: unknown;
  endAt?: unknown;
  eventTypes?: unknown;
  dryRun?: unknown;
  pageSize?: unknown;
  maxEvents?: unknown;
};

type BackfillExternalActionsFromWebhookEventsBody = {
  dryRun?: unknown;
  pageSize?: unknown;
  maxEvents?: unknown;
  onlySupportedEvents?: unknown;
};

function asPositiveInt(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return value;
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    if (Number.isInteger(parsed) && parsed > 0) return parsed;
  }
  return null;
}

function asIsoDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const parsed = new Date(value.trim());
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const result: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const trimmed = item.trim();
    if (!trimmed) continue;
    result.push(trimmed);
  }
  return [...new Set(result)];
}

export function parseBackfillSquareWebhooksBody(
  body: unknown,
): BackfillSquareWebhooksRequestDto {
  if (typeof body !== "object" || body == null || Array.isArray(body)) {
    throw new SyncEndpointError("Invalid request body.", 400);
  }

  const typed = body as BackfillSquareWebhooksBody;
  const accessTokenAlias = readString(typed.accessTokenAlias);
  if (!accessTokenAlias) {
    throw new SyncEndpointError("accessTokenAlias is required.", 400);
  }

  const dryRun = typed.dryRun === undefined ? true : Boolean(typed.dryRun);
  const pageSize = asPositiveInt(typed.pageSize) ?? 100;
  const maxEvents = asPositiveInt(typed.maxEvents) ?? 2000;

  if (pageSize > 100) {
    throw new SyncEndpointError("pageSize cannot exceed 100.", 400);
  }
  if (maxEvents > 20000) {
    throw new SyncEndpointError("maxEvents cannot exceed 20000.", 400);
  }

  const hours = asPositiveInt(typed.hours);
  const startAt = asIsoDate(typed.startAt);
  const endAt = asIsoDate(typed.endAt);

  if (hours != null && (startAt || endAt)) {
    throw new SyncEndpointError("Use either hours or startAt/endAt, not both.", 400);
  }

  let resolvedStartAt: string;
  let resolvedEndAt: string;

  if (hours != null) {
    const end = new Date();
    const start = new Date(end.getTime() - hours * 60 * 60 * 1000);
    resolvedStartAt = start.toISOString();
    resolvedEndAt = end.toISOString();
  } else {
    if (!startAt || !endAt) {
      throw new SyncEndpointError("Provide hours or both startAt and endAt.", 400);
    }
    if (startAt >= endAt) {
      throw new SyncEndpointError("startAt must be earlier than endAt.", 400);
    }
    resolvedStartAt = startAt;
    resolvedEndAt = endAt;
  }

  return {
    accessTokenAlias,
    dryRun,
    startAt: resolvedStartAt,
    endAt: resolvedEndAt,
    eventTypes: asStringArray(typed.eventTypes),
    maxEvents,
    pageSize,
  };
}

export function parseBackfillExternalActionsFromWebhookEventsBody(
  body: unknown,
): BackfillExternalActionsFromWebhookEventsRequestDto {
  if (body == null) {
    return {
      dryRun: true,
      pageSize: 100,
      maxEvents: 5000,
      onlySupportedEvents: true,
    };
  }

  if (typeof body !== "object" || Array.isArray(body)) {
    throw new SyncEndpointError("Invalid request body.", 400);
  }

  const typed = body as BackfillExternalActionsFromWebhookEventsBody;
  const dryRun = typed.dryRun === undefined ? true : Boolean(typed.dryRun);
  const pageSize = asPositiveInt(typed.pageSize) ?? 100;
  const maxEvents = asPositiveInt(typed.maxEvents) ?? 5000;
  const onlySupportedEvents =
    typed.onlySupportedEvents === undefined ? true : Boolean(typed.onlySupportedEvents);

  if (pageSize > 100) {
    throw new SyncEndpointError("pageSize cannot exceed 100.", 400);
  }
  if (maxEvents > 50000) {
    throw new SyncEndpointError("maxEvents cannot exceed 50000.", 400);
  }

  return {
    dryRun,
    pageSize,
    maxEvents,
    onlySupportedEvents,
  };
}

export type { MetaWebhookPayload, SquareWebhookPayload };
export { readString };
