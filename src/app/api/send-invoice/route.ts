import { NextResponse } from "next/server";

import {
  createInvoiceExternal,
  findInvoiceExternalByInvoiceAndOrgIntegration,
  getInvoiceExternalById,
  getInvoiceRecord,
  getOrderRecord,
  getOrgIntegrationRecord,
  listOrderExternalsByInvoice,
  updateInvoicePaymentLink,
  updateInvoiceExternal,
} from "@/lib/integrations/order-billing-processor/airtable";
import { validateAirtableSecret } from "@/lib/integrations/order-billing-processor/auth";
import { resolveProviderContext } from "@/lib/integrations/order-billing-processor/provider-context";
import { failureFromError, SyncEndpointError } from "@/lib/integrations/order-billing-processor/response";
import {
  getInvoiceDetails,
  getInvoicePublicUrl,
  publishInvoice,
} from "@/lib/integrations/order-billing-processor/square";

export const runtime = "nodejs";

type SendInvoiceBody = {
  invoiceRecordId?: unknown;
  orderRecordId?: unknown;
  orgIntegrationRecordId?: unknown;
  invoiceExternalRecordId?: unknown;
  externalInvoiceId?: unknown;
  deliveryMethod?: unknown;
  phoneSnapshot?: unknown;
  idempotencyKey?: unknown;
  forceResend?: unknown;
};

type DeliveryMethod = "Email" | "Sms" | "Link";

function methodNotAllowed(): NextResponse {
  return NextResponse.json(
    { ok: false, error: "Method Not Allowed" },
    { status: 405, headers: { Allow: "POST" } },
  );
}

function parseDeliveryMethod(value: unknown): DeliveryMethod {
  if (value === "Email" || value === "Sms" || value === "Link") return value;
  if (value === "URL") return "Link";
  throw new SyncEndpointError("Invalid deliveryMethod. Must be Email, Sms, or Link.", 400);
}

function coerceDeliveryMethod(value: unknown): DeliveryMethod | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === "email") return "Email";
  if (normalized === "sms" || normalized === "text") return "Sms";
  if (
    normalized === "link" ||
    normalized === "url" ||
    normalized === "share_manually" ||
    normalized === "share manually"
  ) {
    return "Link";
  }
  return null;
}

function asTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseBody(body: unknown): {
  invoiceRecordId: string;
  orderRecordId?: string;
  orgIntegrationRecordId: string;
  invoiceExternalRecordId?: string;
  externalInvoiceId?: string;
  deliveryMethod?: DeliveryMethod;
  phoneSnapshot?: string;
  idempotencyKey?: string;
  forceResend: boolean;
} {
  if (typeof body !== "object" || body == null || Array.isArray(body)) {
    throw new SyncEndpointError("Invalid request body.", 400);
  }

  const typed = body as SendInvoiceBody;
  const invoiceRecordId = asTrimmedString(typed.invoiceRecordId);
  const orderRecordId = asTrimmedString(typed.orderRecordId);
  const orgIntegrationRecordId = asTrimmedString(typed.orgIntegrationRecordId);
  const invoiceExternalRecordId = asTrimmedString(typed.invoiceExternalRecordId) ?? undefined;
  const externalInvoiceId = asTrimmedString(typed.externalInvoiceId) ?? undefined;
  const idempotencyKey = asTrimmedString(typed.idempotencyKey) ?? undefined;
  const phoneSnapshot = asTrimmedString(typed.phoneSnapshot) ?? undefined;
  const requestedDeliveryMethodRaw = asTrimmedString(typed.deliveryMethod);
  const requestedDeliveryMethod = requestedDeliveryMethodRaw
    ? parseDeliveryMethod(requestedDeliveryMethodRaw)
    : undefined;

  if (!invoiceRecordId) throw new SyncEndpointError("Missing invoiceRecordId.", 400);
  if (!orgIntegrationRecordId) throw new SyncEndpointError("Missing orgIntegrationRecordId.", 400);

  return {
    invoiceRecordId,
    ...(orderRecordId ? { orderRecordId } : {}),
    orgIntegrationRecordId,
    invoiceExternalRecordId,
    externalInvoiceId,
    ...(requestedDeliveryMethod ? { deliveryMethod: requestedDeliveryMethod } : {}),
    phoneSnapshot,
    idempotencyKey,
    forceResend: typed.forceResend === true,
  };
}

function mapSquareInvoiceStatusToExternal(value: string | null):
  | "Draft"
  | "Sent"
  | "Partially Paid"
  | "Paid"
  | "Voided"
  | "Refunded"
  | "Failed" {
  const normalized = (value ?? "").trim().toUpperCase();
  if (normalized === "DRAFT") return "Draft";
  if (normalized === "PAID") return "Paid";
  if (normalized === "PARTIALLY_PAID") return "Partially Paid";
  if (normalized === "CANCELED") return "Voided";
  if (normalized === "REFUNDED") return "Refunded";
  if (normalized === "UNPAID" || normalized === "SCHEDULED") return "Sent";
  return "Failed";
}

function defaultSendIdempotencyKey(input: {
  provider: string;
  invoiceRecordId: string;
  deliveryMethod: DeliveryMethod;
}): string {
  return `invoice-send:${input.provider.toLowerCase()}:${input.invoiceRecordId}:${input.deliveryMethod.toLowerCase()}`;
}

export async function POST(request: Request) {
  let parsed:
    | {
        invoiceRecordId: string;
        orderRecordId?: string;
        orgIntegrationRecordId: string;
        invoiceExternalRecordId?: string;
        externalInvoiceId?: string;
        deliveryMethod?: DeliveryMethod;
        phoneSnapshot?: string;
        idempotencyKey?: string;
        forceResend: boolean;
      }
    | null = null;
  let invoiceExternalRecordIdForFailure: string | null = null;

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

    const [invoice, orgIntegration] = await Promise.all([
      getInvoiceRecord(parsed.invoiceRecordId),
      getOrgIntegrationRecord(parsed.orgIntegrationRecordId),
    ]);

    const resolvedOrderRecordId = parsed.orderRecordId ?? invoice.orderId ?? null;
    if (!resolvedOrderRecordId) {
      throw new SyncEndpointError("Missing orderRecordId and Invoice is not linked to an Order.", 422);
    }

    if (parsed.orderRecordId && invoice.orderId && invoice.orderId !== parsed.orderRecordId) {
      throw new SyncEndpointError("Invoice is not linked to the provided Order.", 422);
    }

    const order = await getOrderRecord(resolvedOrderRecordId);

    if (!order.recordId) {
      throw new SyncEndpointError("Order not found.", 404);
    }

    const context = resolveProviderContext(orgIntegration, "Invoice");

    let invoiceExternal = parsed.invoiceExternalRecordId
      ? await getInvoiceExternalById(parsed.invoiceExternalRecordId)
      : await findInvoiceExternalByInvoiceAndOrgIntegration(
          parsed.invoiceRecordId,
          parsed.orgIntegrationRecordId,
        );

    const deliveryMethod =
      parsed.deliveryMethod ??
      coerceDeliveryMethod(invoiceExternal?.deliveryMethod) ??
      coerceDeliveryMethod(invoice.deliveryMethod) ??
      "Link";
    const phoneSnapshot = parsed.phoneSnapshot ?? invoiceExternal?.phoneSnapshot ?? undefined;

    let externalInvoiceId = parsed.externalInvoiceId ?? invoiceExternal?.externalInvoiceId ?? null;

    if (!externalInvoiceId) {
      const orderExternals = await listOrderExternalsByInvoice(parsed.invoiceRecordId);
      const derivedExternalInvoiceIds = [...new Set(
        orderExternals
          .map((row) => row.externalInvoiceId)
          .filter((value): value is string => typeof value === "string" && value.trim().length > 0),
      )];

      if (derivedExternalInvoiceIds.length > 1) {
        throw new SyncEndpointError(
          "Multiple external invoice IDs found across linked Order Externals.",
          409,
        );
      }

      externalInvoiceId = derivedExternalInvoiceIds[0] ?? null;
    }

    if (!externalInvoiceId) {
      throw new SyncEndpointError(
        "Missing externalInvoiceId and unable to derive one from Invoice External or linked Order Externals.",
        422,
      );
    }

    if (!invoiceExternal) {
      invoiceExternal = await createInvoiceExternal({
        Invoice: [parsed.invoiceRecordId],
        Order: [resolvedOrderRecordId],
        "Org Integration": [parsed.orgIntegrationRecordId],
        "External Invoice ID": externalInvoiceId,
        "External Status": "Draft",
        "Amount Due": invoice.amountDue ?? order.amountDue ?? 0,
        "Amount Paid": invoice.amountPaid ?? 0,
        "Amount Refunded": 0,
        ...(invoice.issuedAt ? { "Issued At": invoice.issuedAt } : {}),
        ...(invoice.dueAt ? { "Due At": invoice.dueAt } : {}),
        ...(invoice.paidAt ? { "Paid At": invoice.paidAt } : {}),
        "External Process Action": "Send Invoice",
        "External Process Status": "Not Started",
        "Writeback Status": "Not Started",
        "Reconciliation Status": "Not Started",
        "Last Synced At": new Date().toISOString(),
        "Last Sync Activity At": new Date().toISOString(),
      });
    }

    invoiceExternalRecordIdForFailure = invoiceExternal.recordId;

    if (!invoiceExternal.externalInvoiceId) {
      await updateInvoiceExternal(invoiceExternal.recordId, {
        "External Invoice ID": externalInvoiceId,
      });
      invoiceExternal = {
        ...invoiceExternal,
        externalInvoiceId,
      };
    }

    const idempotencyKey =
      parsed.idempotencyKey ??
      defaultSendIdempotencyKey({
        provider: context.provider,
        invoiceRecordId: parsed.invoiceRecordId,
        deliveryMethod,
      });

    await updateInvoiceExternal(invoiceExternal.recordId, {
      "Delivery Method": deliveryMethod,
      ...(phoneSnapshot ? { "Phone Snapshot": phoneSnapshot } : {}),
      "Send Attempt Count": (invoiceExternal.sendAttemptCount ?? 0) + 1,
      "External Process Action": "Send Invoice",
      "External Process Status": "Pending",
      "External Process At": new Date().toISOString(),
      "External Process Error": "",
      "External Action Idempotency Key": idempotencyKey,
      "Writeback Status": "Pending",
      "Writeback Last Attempt At": new Date().toISOString(),
      "Writeback Error": "",
      "Reconciliation Status": "In Progress",
      "Last Sync Activity At": new Date().toISOString(),
      "Last API Response Code": 200,
      "Last API Message": "Send Invoice started",
    });

    const details = await getInvoiceDetails({
      context,
      externalInvoiceId,
    });

    const externalStatusNow = mapSquareInvoiceStatusToExternal(details.status);
    const alreadySentLike =
      externalStatusNow === "Sent" ||
      externalStatusNow === "Partially Paid" ||
      externalStatusNow === "Paid";

    if (alreadySentLike && !parsed.forceResend) {
      const hostedInvoiceUrl =
        details.publicUrl ??
        (await getInvoicePublicUrl({
          context,
          externalInvoiceId,
        }));

      await updateInvoiceExternal(invoiceExternal.recordId, {
        "External Status": externalStatusNow,
        ...(hostedInvoiceUrl ? { "Hosted Invoice URL": hostedInvoiceUrl } : {}),
        "Sent At": invoiceExternal.sentAt ?? new Date().toISOString(),
        "Last Send Error": "",
        "External Process Status": "Succeeded",
        "External Process At": new Date().toISOString(),
        "External Process Raw Payload": details.rawPayload,
        "Writeback Status": "Succeeded",
        "Writeback At": new Date().toISOString(),
        "Writeback Error": "",
        "Reconciliation Status": "Complete",
        "Last Synced At": new Date().toISOString(),
        "Last Sync Activity At": new Date().toISOString(),
        "Last API Response Code": 200,
        "Last API Message": "Send Invoice noop; already sent-like status",
      });

      if (hostedInvoiceUrl) {
        await updateInvoicePaymentLink(parsed.invoiceRecordId, hostedInvoiceUrl);
      }

      return NextResponse.json(
        {
          ok: true,
          action: "Send Invoice",
          result: "noop",
          invoiceId: parsed.invoiceRecordId,
          orderId: resolvedOrderRecordId,
          invoiceExternalRecordId: invoiceExternal.recordId,
          externalInvoiceId,
          externalStatus: externalStatusNow,
          deliveryMethod,
          hostedInvoiceUrl,
        },
        { status: 200 },
      );
    }

    if (details.version == null) {
      throw new SyncEndpointError("Unable to send invoice: provider invoice version is missing.", 409);
    }

    const publishResult = await publishInvoice({
      context,
      externalInvoiceId,
      version: details.version,
      idempotencyKey,
    });

    const hostedInvoiceUrl =
      publishResult.hostedInvoiceUrl ??
      details.publicUrl ??
      (await getInvoicePublicUrl({
        context,
        externalInvoiceId,
      }));

    const mappedStatus = mapSquareInvoiceStatusToExternal(publishResult.externalStatus);

    await updateInvoiceExternal(invoiceExternal.recordId, {
      "External Invoice ID": externalInvoiceId,
      ...(details.externalOrderId ? { "External Order ID": details.externalOrderId } : {}),
      "External Status": mappedStatus,
      ...(hostedInvoiceUrl ? { "Hosted Invoice URL": hostedInvoiceUrl } : {}),
      "Sent At": new Date().toISOString(),
      "Last Send Error": "",
      "External Process Status": "Succeeded",
      "External Process At": new Date().toISOString(),
      "External Process Error": "",
      "External Process Raw Payload": publishResult.rawPayload,
      "Writeback Status": "Succeeded",
      "Writeback At": new Date().toISOString(),
      "Writeback Error": "",
      "Reconciliation Status": "Complete",
      "Last Synced At": new Date().toISOString(),
      "Last Sync Activity At": new Date().toISOString(),
      "Last API Response Code": 200,
      "Last API Message": "Send Invoice processed",
    });

    if (hostedInvoiceUrl) {
      await updateInvoicePaymentLink(parsed.invoiceRecordId, hostedInvoiceUrl);
    }

    return NextResponse.json(
      {
        ok: true,
        action: "Send Invoice",
        result: "processed",
        invoiceId: parsed.invoiceRecordId,
        orderId: resolvedOrderRecordId,
        invoiceExternalRecordId: invoiceExternal.recordId,
        externalInvoiceId,
        externalStatus: mappedStatus,
        deliveryMethod,
        hostedInvoiceUrl,
        sentAt: new Date().toISOString(),
      },
      { status: 200 },
    );
  } catch (error) {
    if (invoiceExternalRecordIdForFailure) {
      const message = error instanceof Error ? error.message : "Unexpected server error.";
      const statusCode = error instanceof SyncEndpointError ? error.status : 500;
      const rawPayload = error instanceof SyncEndpointError ? error.rawPayload : undefined;

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
