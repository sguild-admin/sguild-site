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
  action?: unknown;
};

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

  if (!orderRecordId) throw new SyncEndpointError("Missing orderRecordId.", 400);
  if (!orderExternalRecordId) throw new SyncEndpointError("Missing orderExternalRecordId.", 400);
  if (!orgIntegrationRecordId) throw new SyncEndpointError("Missing orgIntegrationRecordId.", 400);

  return {
    orderRecordId,
    orderExternalRecordId,
    orgIntegrationRecordId,
    action: parseAction(typed.action),
  };
}

export async function POST(request: Request) {
  let parsed: OrderBillingRequest | null = null;

  try {
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
    const response = await runOrderBillingProcessor(parsed);
    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    const { status, body } = failureFromError(error);

    console.error("Order billing request failed", {
      operation: "process_order_billing",
      orderRecordId: parsed?.orderRecordId ?? null,
      orderExternalRecordId: parsed?.orderExternalRecordId ?? null,
      orgIntegrationRecordId: parsed?.orgIntegrationRecordId ?? null,
      action: parsed?.action ?? null,
      status,
      error: error instanceof Error ? error.message : "Unknown error",
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

