import { NextResponse } from "next/server";
import {
  applyInvoicePaymentFailureFromError,
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
  try {
    assertAuthorizedOrderBillingRequest(request);
    assertJsonRequest(request);
    const body = await parseJsonBody(request);
    const response = await runOpenOrder(body);
    return NextResponse.json(response, { status: 200 });
  } catch (error) {
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
