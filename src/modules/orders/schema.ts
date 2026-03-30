import {
  SyncEndpointError,
} from "@/lib/errors";
import type { BillingAction } from "@/lib/types/billing";
import type { OrderBillingRequest } from "./service";

type ProcessOrderBillingBody = {
  orderRecordId?: unknown;
  orderExternalRecordId?: unknown;
  orgIntegrationRecordId?: unknown;
  invoiceRecordId?: unknown;
  externalInvoiceId?: unknown;
  externalAction?: unknown;
  writebackAction?: unknown;
  action?: unknown;
};

function parseAction(value: unknown): BillingAction {
  if (
    value === "Create Order" ||
    value === "Create Invoice" ||
    value === "Charge" ||
    value === "Refund" ||
    value === "Cancel" ||
    value === "Invoice" ||
    value === "Authentication"
  ) {
    return value;
  }

  throw new SyncEndpointError(
    "Invalid action. Must be Create Order, Create Invoice, Charge, Refund, Cancel, Invoice, or Authentication.",
    400,
  );
}

function parseWritebackAction(value: unknown): "Write Result" | "Skip Writeback" {
  if (value === "Skip Writeback") return "Skip Writeback";
  return "Write Result";
}

export function parseProcessOrderBillingBody(body: unknown): OrderBillingRequest {
  if (typeof body !== "object" || body == null || Array.isArray(body)) {
    throw new SyncEndpointError("Invalid request body.", 400);
  }

  const typed = body as ProcessOrderBillingBody;
  const orderRecordId = typeof typed.orderRecordId === "string" ? typed.orderRecordId.trim() : "";
  const orderExternalRecordId =
    typeof typed.orderExternalRecordId === "string" ? typed.orderExternalRecordId.trim() : "";
  const orgIntegrationRecordId =
    typeof typed.orgIntegrationRecordId === "string" ? typed.orgIntegrationRecordId.trim() : "";
  const actionSource = typed.externalAction ?? typed.action;
  const action = parseAction(actionSource);
  const writebackAction = parseWritebackAction(typed.writebackAction);
  const invoiceRecordId = typeof typed.invoiceRecordId === "string" ? typed.invoiceRecordId.trim() : "";
  const externalInvoiceId =
    typeof typed.externalInvoiceId === "string" ? typed.externalInvoiceId.trim() : "";

  if (!orderRecordId) throw new SyncEndpointError("Missing orderRecordId.", 400);
  if (!orderExternalRecordId) throw new SyncEndpointError("Missing orderExternalRecordId.", 400);
  if (!orgIntegrationRecordId) throw new SyncEndpointError("Missing orgIntegrationRecordId.", 400);

  return {
    orderRecordId,
    orderExternalRecordId,
    orgIntegrationRecordId,
    invoiceRecordId: invoiceRecordId || undefined,
    externalInvoiceId: externalInvoiceId || undefined,
    writebackAction,
    action,
  };
}
