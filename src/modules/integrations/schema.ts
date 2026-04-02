import { SyncEndpointError } from "@/lib/errors";
import type { SyncRecordRequestDto } from "./dto";

export type ProcessOrderBillingBody = {
  orderRecordId?: unknown;
  orderExternalRecordId?: unknown;
  orgIntegrationRecordId?: unknown;
  invoiceRecordId?: unknown;
  externalInvoiceId?: unknown;
  externalAction?: unknown;
  writebackAction?: unknown;
  action?: unknown;
};

export function parseSyncRecordId(body: unknown): SyncRecordRequestDto["recordId"] {
  if (typeof body !== "object" || body == null || Array.isArray(body)) {
    throw new SyncEndpointError("Invalid request body.", 400);
  }

  const recordId = typeof (body as { recordId?: unknown }).recordId === "string"
    ? (body as { recordId: string }).recordId.trim()
    : "";

  if (!recordId) {
    throw new SyncEndpointError("Missing recordId.", 400);
  }

  return recordId;
}
