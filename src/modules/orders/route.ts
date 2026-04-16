import { NextResponse } from "next/server";
import {
  applyInvoicePaymentFailureFromError,
  applyRefundToOrder,
  applyRefundToOrderFailureFromError,
  assertAuthorizedOrderBillingRequest,
  failureFromError,
  runApplyInvoicePayment,
  sendInvoiceFailureFromError,
} from "./service";
import { assertJsonRequest, parseJsonBody } from "@/lib/http/request";
import {
  runOpenOrder,
  runOrderBilling,
  runResolvePromotionRedemptions,
  runSendInvoice,
} from "./service";
import { ordersRepo } from "./repo";

export function methodNotAllowed(): NextResponse {
	return NextResponse.json(
		{ ok: false, error: "Method Not Allowed" },
		{ status: 405, headers: { Allow: "POST" } },
	);
}

export async function handleProcessOrderBilling(request: Request) {
	try {
		assertAuthorizedOrderBillingRequest(request);
		assertJsonRequest(request);
		const body = await parseJsonBody(request);
		const response = await runOrderBilling(body);
		return NextResponse.json(response, { status: 200 });
	} catch (error) {
		const { status, body } = failureFromError(error);
		return NextResponse.json(body, { status });
	}
}

export async function handleResolvePromotionRedemptions(request: Request) {
  try {
    assertAuthorizedOrderBillingRequest(request);
    assertJsonRequest(request);
    const body = await parseJsonBody(request);
    const response = await runResolvePromotionRedemptions(body);
    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    const { status, body } = failureFromError(error);
    return NextResponse.json(body, { status });
  }
}

export async function handleOpenOrder(request: Request) {
  let recordId: string | null = null;
  try {
    assertAuthorizedOrderBillingRequest(request);
    assertJsonRequest(request);
    const body = await parseJsonBody(request);
    const parsed = body as { recordId?: unknown };
    if (typeof parsed.recordId === "string" && parsed.recordId.trim()) {
      recordId = parsed.recordId.trim();
    }
    const response = await runOpenOrder(body);
    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    // Try to write error to Order External if we have a recordId
    if (recordId) {
      try {
        const errorMessage = error instanceof Error ? error.message : "Unexpected error";
        const orderExternals = await ordersRepo.listOrderExternalsByOrder(recordId);
        for (const ext of orderExternals) {
          await ordersRepo.writeOrderExternalFailure(ext.recordId, "Create Order", errorMessage);
        }
      } catch (writeError) {
        console.error("[OPEN_ORDER] Failed to write error to Order Externals:", writeError);
        // Don't re-throw, just log it
      }
    }

    const { status, body } = failureFromError(error);
    return NextResponse.json(body, { status });
  }
}

export async function handleSendInvoice(request: Request) {
  let recordId: string | null = null;
  try {
    assertAuthorizedOrderBillingRequest(request);
    assertJsonRequest(request);
    const body = await parseJsonBody(request);
    const parsed = body as { recordId?: unknown };
    if (typeof parsed.recordId === "string" && parsed.recordId.trim()) {
      recordId = parsed.recordId.trim();
    }
    const response = await runSendInvoice(body);
    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    const { status, body } = sendInvoiceFailureFromError(error, recordId);
    return NextResponse.json(body, { status });
  }
}

export async function handleApplyInvoicePayment(request: Request) {
  let recordId: string | null = null;
  try {
    assertAuthorizedOrderBillingRequest(request);
    assertJsonRequest(request);
    const body = await parseJsonBody(request);
    const parsed = body as { recordId?: unknown };
    if (typeof parsed.recordId === "string" && parsed.recordId.trim()) {
      recordId = parsed.recordId.trim();
    }
    const response = await runApplyInvoicePayment(body);
    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    const { status, body } = applyInvoicePaymentFailureFromError(error, recordId);
    return NextResponse.json(body, { status });
  }
}

export async function handleApplyRefundToOrder(request: Request) {
  let recordId: string | null = null;
  try {
    assertAuthorizedOrderBillingRequest(request);
    assertJsonRequest(request);
    const body = await parseJsonBody(request);
    const parsed = body as { recordId?: unknown };
    if (typeof parsed.recordId === "string" && parsed.recordId.trim()) {
      recordId = parsed.recordId.trim();
    }
    const response = await applyRefundToOrder(body);
    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    const { status, body } = applyRefundToOrderFailureFromError(error, recordId);
    return NextResponse.json(body, { status });
  }
}
