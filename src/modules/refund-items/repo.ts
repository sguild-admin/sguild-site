import { SyncEndpointError } from "@/lib/errors";
import { airtableSchema } from "@/config/airtable-schema";
import { airtableRequest, parseAirtableError } from "@/lib/airtable/client";
import type { RefundItemScaffoldRecordDto } from "./dto";

type AirtableRecord = {
  id: string;
  fields?: Record<string, unknown>;
};

const REFUND_ITEMS_TABLE = airtableSchema.operations.tables.refundItems;
const REFUND_ITEM_FIELDS = airtableSchema.operations.fields.refundItems;

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readFirstLinkedId(value: unknown): string | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const [first] = value;
  return typeof first === "string" && first.trim().length > 0
    ? first.trim()
    : null;
}

export async function getRefundItemById(
  recordId: string,
): Promise<RefundItemScaffoldRecordDto> {
  const response = await airtableRequest(
    `${encodeURIComponent(REFUND_ITEMS_TABLE)}/${encodeURIComponent(recordId)}`,
    { method: "GET" },
  );

  if (response.status === 404) {
    throw new SyncEndpointError("Refund Item not found.", 404);
  }

  if (!response.ok) {
    const message = await parseAirtableError(response);
    throw new SyncEndpointError(`Failed to load Refund Item: ${message}`, 502);
  }

  const record = (await response.json()) as AirtableRecord;
  const fields = record.fields ?? {};

  return {
    recordId: record.id,
    refundAmount: readNumber(fields[REFUND_ITEM_FIELDS.refundAmount]),
    creditsRevoked: readNumber(fields[REFUND_ITEM_FIELDS.creditsRevoked]),
    refundId: readFirstLinkedId(fields[REFUND_ITEM_FIELDS.refund]),
    orderItemId: readFirstLinkedId(fields[REFUND_ITEM_FIELDS.orderItem]),
    refundStatus: readString(fields[REFUND_ITEM_FIELDS.refundStatus]),
    organization: readString(fields[REFUND_ITEM_FIELDS.organization]),
  };
}

export const refundItemsRepo = {
  getRefundItemById,
};
