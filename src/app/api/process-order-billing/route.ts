import { NextResponse } from "next/server";

import { validateAirtableSecret } from "@/lib/integrations/order-billing-processor/auth";
import {
  BillingAction,
  failureFromError,
  SyncEndpointError,
} from "@/lib/integrations/order-billing-processor/response";
import {
  OrderBillingRequest,
  runOrderBillingProcessor,
} from "@/lib/integrations/order-billing-processor/service";

export const runtime = "nodejs";

type ProcessOrderBillingBody = {
  orderRecordId?: unknown;
  orderExternalRecordId?: unknown;
  orgIntegrationRecordId?: unknown;
  invoiceRecordId?: unknown;
  externalInvoiceId?: unknown;
  action?: unknown;
};

function isDebugEnabled(): boolean {
  return process.env.ORDER_BILLING_DEBUG === "true" || process.env.NODE_ENV !== "production";
}

function debugLog(message: string, data?: Record<string, unknown>): void {
  if (!isDebugEnabled()) return;
  console.info(message, data ?? {});
}

function methodNotAllowed(): NextResponse {
  return NextResponse.json(
    { ok: false, error: "Method Not Allowed" },
    { status: 405, headers: { Allow: "POST" } },
  );
}

function parseAction(value: unknown): BillingAction {
  if (value === "Charge" || value === "Invoice" || value === "Authentication") return value;
  throw new SyncEndpointError("Invalid action. Must be Charge, Invoice, or Authentication.", 400);
}

function parseBody(body: unknown): OrderBillingRequest {
  if (typeof body !== "object" || body == null || Array.isArray(body)) {
    throw new SyncEndpointError("Invalid request body.", 400);
  }

  const typed = body as ProcessOrderBillingBody;
  const orderRecordId =
    typeof typed.orderRecordId === "string" ? typed.orderRecordId.trim() : "";
  const orderExternalRecordId =
    typeof typed.orderExternalRecordId === "string" ? typed.orderExternalRecordId.trim() : "";
  const orgIntegrationRecordId =
    typeof typed.orgIntegrationRecordId === "string" ? typed.orgIntegrationRecordId.trim() : "";
  const action = parseAction(typed.action);
  const invoiceRecordId =
    typeof typed.invoiceRecordId === "string" ? typed.invoiceRecordId.trim() : "";
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
    action,
  };
}

export async function POST(request: Request) {
  let parsed: OrderBillingRequest | null = null;

  try {
    debugLog("Order billing request received");
    validateAirtableSecret(request);
    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().includes("application/json")) {
      throw new SyncEndpointError("Content-Type must be application/json.", 400);
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new SyncEndpointError("Invalid JSON payload.", 400);
    }

    parsed = parseBody(body);
    debugLog("Order billing request parsed", {
      orderRecordId: parsed.orderRecordId,
      orderExternalRecordId: parsed.orderExternalRecordId,
      orgIntegrationRecordId: parsed.orgIntegrationRecordId,
      invoiceRecordId: parsed.invoiceRecordId ?? null,
      externalInvoiceId: parsed.externalInvoiceId ?? null,
      action: parsed.action,
    });
    const response = await runOrderBillingProcessor(parsed);
    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    const { status, body } = failureFromError(error);

    console.error("Order billing request failed", {
      operation: "process_order_billing",
      orderRecordId: parsed?.orderRecordId ?? null,
      orderExternalRecordId: parsed?.orderExternalRecordId ?? null,
      orgIntegrationRecordId: parsed?.orgIntegrationRecordId ?? null,
      invoiceRecordId: parsed?.invoiceRecordId ?? null,
      action: parsed?.action ?? null,
      status,
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : null,
    });

    return NextResponse.json(body, { status });
  }
}

export async function GET() {
  return methodNotAllowed();
}

export async function PUT() {
  return methodNotAllowed();
}

export async function PATCH() {
  return methodNotAllowed();
}

export async function DELETE() {
  return methodNotAllowed();
}
