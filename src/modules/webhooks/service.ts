import { NextResponse } from "next/server";
import { readOptionalEnv } from "@/lib/env";
import {
  createMetaSignature,
  createWebhookDelivery,
  createWebhookEvent,
  findWebhookEventByEventKey,
  timingSafeEqual,
  updateWebhookEvent,
  validateSquareSignature,
} from "./repo";
import {
  MetaWebhookPayload,
  readString,
  SquareWebhookPayload,
  SUPPORTED_SQUARE_WEBHOOK_EVENTS,
} from "./schema";

function getSignatureKey(): string | null {
  return (
    readOptionalEnv("SQUARE_WEBHOOK_SIGNATURE_KEY") ??
    readOptionalEnv("SQUARE_SIGNATURE_KEY")
  );
}

function resolveNotificationUrl(request: Request): string {
  const configured = readOptionalEnv("SQUARE_WEBHOOK_NOTIFICATION_URL");
  return configured ?? request.url;
}

export async function handleSquareWebhookGet() {
  return NextResponse.json({
    ok: true,
    provider: "Square",
    supportedEvents: [...SUPPORTED_SQUARE_WEBHOOK_EVENTS],
    hasSignatureKey: Boolean(getSignatureKey()),
    hasAirtableOperationsToken: Boolean(readOptionalEnv("AIRTABLE_OPERATIONS_TOKEN")),
    hasAirtableOperationsBaseId: Boolean(readOptionalEnv("AIRTABLE_OPERATIONS_BASE_ID")),
    hasNotificationUrlOverride: Boolean(readOptionalEnv("SQUARE_WEBHOOK_NOTIFICATION_URL")),
  });
}

export async function handleSquareWebhookPost(request: Request) {
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

  if (!SUPPORTED_SQUARE_WEBHOOK_EVENTS.has(eventType)) {
    try {
      await createWebhookDelivery({
        signatureValid: true,
        responseCode: 200,
        errorMessage: `Ignored unsupported event type: ${eventType}`,
      });
    } catch (error) {
      console.error("Failed to write webhook delivery for ignored event type", error);
    }

    return NextResponse.json({
      ok: true,
      acknowledged: true,
      ignored: true,
      reason: "Unsupported event type.",
      eventType,
    });
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
      });
    } catch (deliveryError) {
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

export async function handleMetaWebhookGet(request: Request) {
  const verifyToken = readOptionalEnv("META_WEBHOOK_VERIFY_TOKEN");
  if (!verifyToken) {
    return NextResponse.json(
      { error: "META_WEBHOOK_VERIFY_TOKEN is not configured." },
      { status: 500 },
    );
  }

  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === verifyToken && challenge) {
    return new NextResponse(challenge, { status: 200 });
  }

  return new NextResponse(null, { status: 403 });
}

export async function handleMetaWebhookPost(request: Request) {
  const appSecret = readOptionalEnv("META_APP_SECRET");
  if (!appSecret) {
    return NextResponse.json(
      { error: "META_APP_SECRET is not configured." },
      { status: 500 },
    );
  }

  const rawBody = await request.text();
  const signature = request.headers.get("x-hub-signature-256") ?? "";
  const expected = createMetaSignature(rawBody, appSecret);

  if (!timingSafeEqual(expected, signature)) {
    return new NextResponse(null, { status: 401 });
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const payload = body as MetaWebhookPayload;

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field === "leadgen") {
        const leadgenId = change.value?.leadgen_id;
        const pageId = change.value?.page_id ?? entry.id;
        console.log("Meta leadgen webhook event received", { leadgenId, pageId });
      }
    }
  }

  return new NextResponse(null, { status: 200 });
}
