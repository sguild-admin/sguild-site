import { NextResponse } from "next/server";
import { assertAuthorizedSyncRequest } from "@/modules/integrations/service";
import { failureFromError } from "@/modules/orders/service";
import { SyncEndpointError as BillingSyncEndpointError } from "@/lib/errors";
import { assertJsonRequest, parseJsonBody } from "@/lib/http/request";
import { sendInvoice, reconcileInvoiceExternals } from "./service";
import { updateInvoiceExternal } from "./repo";

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
      const message = error instanceof Error ? error.message : "Unexpected server error.";
      const statusCode = error instanceof BillingSyncEndpointError ? error.status : 500;
      const rawPayload = error instanceof BillingSyncEndpointError ? error.rawPayload : undefined;

      try {
        await updateInvoiceExternal(invoiceExternalRecordIdForFailure, {
          "External Process Action": "Send Invoice",
          "External Process Status": "Failed",
          "External Process At": new Date().toISOString(),
          "External Process Error": message,
          ...(rawPayload ? { "External Process Raw Payload": rawPayload } : {}),
          "Writeback Status": "Failed",
          "Writeback At": new Date().toISOString(),
          "Writeback Error": message,
          "Writeback Last Attempt At": new Date().toISOString(),
          "Reconciliation Status": "Needs Review",
          "Last Synced At": new Date().toISOString(),
          "Last Sync Activity At": new Date().toISOString(),
          "Last API Response Code": statusCode,
          "Last API Message": message,
          "Last Send Error": message,
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
