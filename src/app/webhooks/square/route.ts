import { NextResponse } from "next/server";
import {
  createWebhookDelivery,
  createWebhookEvent,
  findWebhookEventByEventKey,
  updateWebhookEvent,
  validateSquareSignature,
} from "@/lib/integrations/order-billing-processor/webhook-airtable";

export const runtime = "nodejs";

type SquareWebhookPayload = {
  merchant_id?: string;
  type?: string;
  event_id?: string;
  created_at?: string;
};

function readString(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  return null;
}

function resolveNotificationUrl(request: Request): string {
  const configured = readString(process.env.SQUARE_WEBHOOK_NOTIFICATION_URL);
  return configured ?? request.url;
}

function getSignatureKey(): string | null {
  return (
    readString(process.env.SQUARE_WEBHOOK_SIGNATURE_KEY) ??
    readString(process.env.SQUARE_SIGNATURE_KEY)
  );
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    provider: "Square",
    hasSignatureKey: Boolean(getSignatureKey()),
    hasAirtableOperationsToken: Boolean(process.env.AIRTABLE_OPERATIONS_TOKEN),
    hasAirtableOperationsBaseId: Boolean(process.env.AIRTABLE_OPERATIONS_BASE_ID),
    hasNotificationUrlOverride: Boolean(process.env.SQUARE_WEBHOOK_NOTIFICATION_URL),
  });
}

export async function POST(request: Request) {
  const signatureKey = getSignatureKey();
  if (!signatureKey) {
    return NextResponse.json(
      {
        error:
          "Square signature key is not configured. Set SQUARE_WEBHOOK_SIGNATURE_KEY or SQUARE_SIGNATURE_KEY.",
      },
      { status: 500 },
    );
  }

  const rawBody = await request.text();
  const signatureHeader = request.headers.get("x-square-hmacsha256-signature") ?? "";
  const subscriptionIdHeader = request.headers.get("square-subscription-id") ?? "";

  const isSignatureValid = validateSquareSignature({
    signatureKey,
    notificationUrl: resolveNotificationUrl(request),
    rawBody,
    signatureHeader,
  });

  if (!isSignatureValid) {
    try {
      await createWebhookDelivery({
        signatureValid: false,
        responseCode: 401,
        errorMessage: "Invalid Square webhook signature.",
      });
    } catch (error) {
      console.error("Failed to write webhook delivery for invalid signature", error);
    }

    return NextResponse.json(
      {
        error: "Invalid Square webhook signature.",
        hint:
          "Ensure SQUARE_WEBHOOK_NOTIFICATION_URL exactly matches the URL configured in Square (including trailing slash and domain).",
      },
      { status: 401 },
    );
  }

  let payload: SquareWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as SquareWebhookPayload;
  } catch {
    try {
      await createWebhookDelivery({
        signatureValid: true,
        responseCode: 400,
        errorMessage: "Invalid JSON payload.",
      });
    } catch (error) {
      console.error("Failed to write webhook delivery for invalid JSON", error);
    }

    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const providerEventId = readString(payload.event_id);
  const eventType = readString(payload.type);
  const merchantId = readString(payload.merchant_id);
  const occurredAt = readString(payload.created_at);

  if (!providerEventId || !eventType) {
    try {
      await createWebhookDelivery({
        signatureValid: true,
        responseCode: 400,
        errorMessage: "Missing required fields: event_id or type.",
      });
    } catch (error) {
      console.error("Failed to write webhook delivery for missing fields", error);
    }

    return NextResponse.json({ error: "Missing required fields: event_id or type." }, { status: 400 });
  }

  const eventKey = `Square | ${eventType} | ${providerEventId}`;
  let eventRecordId: string | null = null;

  try {
    const existing = await findWebhookEventByEventKey(eventKey);
    if (existing) {
      eventRecordId = existing.recordId;
    } else {
      const created = await createWebhookEvent({
        eventKey,
        provider: "Square",
        providerEventId,
        eventType,
        merchantId,
        payloadJson: rawBody,
        occurredAt,
        status: "received",
      });
      eventRecordId = created.recordId;
    }

    if (eventRecordId) {
      await updateWebhookEvent(eventRecordId, {
        status: "processed",
        processedAt: new Date().toISOString(),
        lastError: null,
      });
    }

    try {
      await createWebhookDelivery({
        eventRecordId,
        signatureValid: true,
        responseCode: 200,
      });
    } catch (deliveryError) {
      // Ingest is already successful; do not fail the webhook ack on delivery-log issues.
      console.error("Failed to write webhook delivery success row", deliveryError);
    }

    return new NextResponse(null, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown webhook ingest error.";

    console.error("Square webhook ingest failure", {
      message,
      eventType,
      providerEventId,
      merchantId,
      subscriptionIdHeader,
    });

    if (eventRecordId) {
      try {
        await updateWebhookEvent(eventRecordId, {
          status: "failed",
          lastError: message,
        });
      } catch (updateError) {
        console.error("Failed to write webhook event failure state", updateError);
      }
    }

    try {
      await createWebhookDelivery({
        eventRecordId,
        signatureValid: true,
        responseCode: 500,
        errorMessage: message,
      });
    } catch (deliveryError) {
      console.error("Failed to write webhook delivery failure state", deliveryError);
    }

    // Fail-open acknowledgment to prevent provider retry storms while we diagnose.
    return NextResponse.json(
      {
        ok: false,
        acknowledged: true,
        error: "Webhook ingest failed.",
        detail: message,
      },
      { status: 200 },
    );
  }
}
