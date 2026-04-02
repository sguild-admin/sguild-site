import { NextResponse } from "next/server";
import { assertAuthorizedSyncRequest } from "@/modules/integrations";
import { failureFromError } from "@/modules/orders";
import { assertJsonRequest, parseJsonBody } from "@/lib/http/request";
import { reconcileInvoiceExternals, sendInvoice, writeSendInvoiceFailure } from "./service";

export function methodNotAllowed(): NextResponse {
  return NextResponse.json(
    { ok: false, error: "Method Not Allowed" },
    { status: 405, headers: { Allow: "POST" } },
  );
}

export async function handleSendInvoice(request: Request) {
  let invoiceExternalRecordIdForFailure: string | null = null;

  try {
    assertAuthorizedSyncRequest(request);
    assertJsonRequest(request);
    const body = await parseJsonBody(request);

    const parsed = body as { invoiceExternalRecordId?: unknown };
    if (typeof parsed.invoiceExternalRecordId === "string" && parsed.invoiceExternalRecordId.trim()) {
      invoiceExternalRecordIdForFailure = parsed.invoiceExternalRecordId.trim();
    }

    const response = await sendInvoice(body);
    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    if (invoiceExternalRecordIdForFailure) {
      try {
        await writeSendInvoiceFailure({
          invoiceExternalRecordId: invoiceExternalRecordIdForFailure,
          error,
        });
      } catch {
        // preserve original error response
      }
    }

    const { status, body } = failureFromError(error);
    return NextResponse.json(body, { status });
  }
}

export async function handleReconcileInvoiceExternals(request: Request) {
  try {
    assertAuthorizedSyncRequest(request);
    assertJsonRequest(request);
    const body = await parseJsonBody(request);
    const response = await reconcileInvoiceExternals(body);
    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    const { status, body } = failureFromError(error);
    return NextResponse.json(body, { status });
  }
}

