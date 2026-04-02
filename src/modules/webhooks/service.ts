import { NextResponse } from "next/server";
import { readOptionalEnv } from "@/lib/env";
import { assertJsonRequest, parseJsonBody } from "@/lib/http/request";
import { SyncEndpointError } from "@/lib/errors";
import { resolveSquareAuthContextFromAlias } from "@/lib/providers/square/provider-context";
import { listSquareEvents } from "@/lib/providers/square/events";
import { webhooksIngestRepo, webhooksRepo } from "./repo";
import { assertAuthorizedSyncRequest } from "@/modules/integrations";
import type {
  BackfillSquareWebhooksResponseDto,
  MetaWebhookPayload,
  SquareWebhookPayload,
} from "./dto";
import {
  parseBackfillSquareWebhooksBody,
  readString,
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

function readAtPath(value: unknown, path: string[]): string | null {
  let current: unknown = value;
  for (const segment of path) {
    if (typeof current !== "object" || current == null || Array.isArray(current)) return null;
    current = (current as Record<string, unknown>)[segment];
  }
  return readString(current);
}

function parseSquareEventIdentity(payload: SquareWebhookPayload): {
  providerEventId: string;
  eventType: string;
  merchantId: string | null;
  occurredAt: string | null;
  eventKey: string;
} {
  const providerEventId = readString(payload.event_id);
  const eventType = readString(payload.type);
  if (!providerEventId || !eventType) {
    throw new SyncEndpointError("Missing required fields: event_id or type.", 400);
  }

  return {
    providerEventId,
    eventType,
    merchantId: readString(payload.merchant_id),
    occurredAt: readString(payload.created_at),
    eventKey: webhooksRepo.buildWebhookEventKey({
      provider: "Square",
      eventType,
      providerEventId,
    }),
  };
}

async function resolveOrderExternalLinkFromSquareWebhook(payload: unknown): Promise<string | null> {
  const externalInvoiceId = readAtPath(payload, ["data", "object", "invoice", "id"]);
  if (externalInvoiceId) {
    const byInvoice = await webhooksIngestRepo.findOrderExternalByExternalInvoiceId(externalInvoiceId);
    if (byInvoice) return byInvoice.recordId;
  }

  const externalOrderId =
    readAtPath(payload, ["data", "object", "invoice", "order_id"]) ??
    readAtPath(payload, ["data", "object", "refund", "order_id"]) ??
    readAtPath(payload, ["data", "object", "payment", "order_id"]) ??
    readAtPath(payload, ["data", "object", "order", "id"]);
  if (!externalOrderId) return null;

  const byOrder = await webhooksIngestRepo.findOrderExternalByExternalOrderId(externalOrderId);
  return byOrder?.recordId ?? null;
}

async function upsertSquareInboundExternalAction(input: {
  payload: unknown;
  rawBody: string;
  providerEventId: string;
  eventType: string;
  occurredAt: string | null;
  status: "Pending" | "Succeeded" | "Failed" | "Ignored";
  errorSummary?: string | null;
  httpStatusCode?: number;
  triggerSource: "Webhook" | "Backfill";
}): Promise<string | null> {
  const existing = await webhooksIngestRepo.findInboundExternalActionByIdentity({
    provider: "Square",
    providerEventId: input.providerEventId,
  });
  const orderExternalRecordId = await resolveOrderExternalLinkFromSquareWebhook(input.payload);
  const externalInvoiceId = readAtPath(input.payload, ["data", "object", "invoice", "id"]);
  const externalOrderId =
    readAtPath(input.payload, ["data", "object", "invoice", "order_id"]) ??
    readAtPath(input.payload, ["data", "object", "order", "id"]);
  const providerReferenceId = externalInvoiceId ?? externalOrderId ?? input.providerEventId;

  if (existing) {
    const attemptNumber = (existing.attemptNumber ?? 1) + 1;
    await webhooksIngestRepo.updateExternalAction(existing.recordId, {
      occurredAt: input.occurredAt ?? new Date().toISOString(),
      status: input.status,
      actionType: "Webhook",
      externalEntityType: externalInvoiceId ? "Invoice" : "Order",
      provider: "Square",
      providerEventType: input.eventType,
      providerEventId: input.providerEventId,
      providerReferenceId,
      rawProviderPayload: input.rawBody,
      httpStatusCode: input.httpStatusCode,
      errorSummary: input.errorSummary ?? "",
      attemptNumber,
      retryable: input.status === "Failed",
      writebackStatus: "Not Started",
      orderExternalRecordId: orderExternalRecordId ?? undefined,
      triggerSource: input.triggerSource,
      direction: "Inbound",
    });
    return existing.recordId;
  }

  return await webhooksIngestRepo.createExternalAction({
    externalEntityType: externalInvoiceId ? "Invoice" : "Order",
    actionType: "Webhook",
    direction: "Inbound",
    triggerSource: input.triggerSource,
    occurredAt: input.occurredAt ?? new Date().toISOString(),
    status: input.status,
    attemptNumber: 1,
    retryable: input.status === "Failed",
    provider: "Square",
    providerEventType: input.eventType,
    providerEventId: input.providerEventId,
    providerReferenceId,
    rawProviderPayload: input.rawBody,
    httpStatusCode: input.httpStatusCode,
    errorSummary: input.errorSummary ?? "",
    writebackStatus: "Not Started",
    orderExternalRecordId: orderExternalRecordId ?? undefined,
  });
}

async function createDeliveryAttempt(input: {
  signatureValid?: boolean | null;
  responseCode?: number | null;
  errorMessage?: string | null;
}): Promise<string | null> {
  try {
    return await webhooksRepo.createWebhookDelivery({
      signatureValid: input.signatureValid,
      responseCode: input.responseCode,
      errorMessage: input.errorMessage,
    });
  } catch (error) {
    console.error("Failed to create webhook delivery row", error);
    return null;
  }
}

async function finalizeDeliveryAttempt(input: {
  deliveryRecordId: string | null;
  eventRecordId?: string | null;
  signatureValid?: boolean | null;
  responseCode: number;
  errorMessage?: string | null;
}): Promise<void> {
  if (!input.deliveryRecordId) return;

  try {
    await webhooksRepo.updateWebhookDelivery(input.deliveryRecordId, {
      eventRecordId: input.eventRecordId,
      signatureValid: input.signatureValid,
      responseCode: input.responseCode,
      errorMessage: input.errorMessage,
    });
  } catch (error) {
    console.error("Failed to update webhook delivery row", error);
  }
}

async function resolveWebhookEventRecord(input: {
  providerEventId: string;
  eventKey: string;
  eventType: string;
  merchantId: string | null;
  occurredAt: string | null;
  payloadJson: string;
}): Promise<{ recordId: string; status: "received" | "processing" | "processed" | "failed" | null; created: boolean }> {
  const canonical = await webhooksRepo.findWebhookEventByProviderEventId({
    provider: "Square",
    providerEventId: input.providerEventId,
  });
  if (canonical) {
    await webhooksRepo.updateWebhookEvent(canonical.recordId, {
      eventKey: input.eventKey,
      eventType: input.eventType,
      provider: "Square",
      providerEventId: input.providerEventId,
      merchantId: input.merchantId,
      occurredAt: input.occurredAt,
      payloadJson: input.payloadJson,
    });
    return {
      recordId: canonical.recordId,
      status: canonical.status,
      created: false,
    };
  }

  const legacy = await webhooksRepo.findWebhookEventByEventKey(input.eventKey);
  if (legacy) {
    await webhooksRepo.updateWebhookEvent(legacy.recordId, {
      provider: "Square",
      providerEventId: input.providerEventId,
      eventType: input.eventType,
      merchantId: input.merchantId,
      occurredAt: input.occurredAt,
      payloadJson: input.payloadJson,
      eventKey: input.eventKey,
    });
    return {
      recordId: legacy.recordId,
      status: legacy.status,
      created: false,
    };
  }

  const created = await webhooksRepo.createWebhookEvent({
    eventKey: input.eventKey,
    provider: "Square",
    providerEventId: input.providerEventId,
    eventType: input.eventType,
    merchantId: input.merchantId,
    payloadJson: input.payloadJson,
    occurredAt: input.occurredAt,
    status: "received",
  });

  return {
    recordId: created.recordId,
    status: created.status,
    created: true,
  };
}

async function ingestSquareEvent(input: {
  payload: SquareWebhookPayload;
  rawBody: string;
  deliveryRecordId: string | null;
  signatureValid: boolean;
  triggerSource: "Webhook" | "Backfill";
}): Promise<{
  eventRecordId: string;
  createdEvent: boolean;
  processed: boolean;
  alreadyProcessed: boolean;
}> {
  const identity = parseSquareEventIdentity(input.payload);
  const event = await resolveWebhookEventRecord({
    providerEventId: identity.providerEventId,
    eventKey: identity.eventKey,
    eventType: identity.eventType,
    merchantId: identity.merchantId,
    occurredAt: identity.occurredAt,
    payloadJson: input.rawBody,
  });

  await finalizeDeliveryAttempt({
    deliveryRecordId: input.deliveryRecordId,
    eventRecordId: event.recordId,
    signatureValid: input.signatureValid,
    responseCode: 200,
  });

  if (event.status === "processed") {
    return {
      eventRecordId: event.recordId,
      createdEvent: event.created,
      processed: false,
      alreadyProcessed: true,
    };
  }

  await webhooksRepo.updateWebhookEvent(event.recordId, {
    status: "processing",
    lastError: null,
  });

  if (!SUPPORTED_SQUARE_WEBHOOK_EVENTS.has(identity.eventType)) {
    await webhooksRepo.updateWebhookEvent(event.recordId, {
      status: "processed",
      processedAt: new Date().toISOString(),
      lastError: null,
    });

    return {
      eventRecordId: event.recordId,
      createdEvent: event.created,
      processed: true,
      alreadyProcessed: false,
    };
  }

  let externalActionRecordId: string | null = null;
  try {
    externalActionRecordId = await upsertSquareInboundExternalAction({
      payload: input.payload,
      rawBody: input.rawBody,
      providerEventId: identity.providerEventId,
      eventType: identity.eventType,
      occurredAt: identity.occurredAt,
      status: "Pending",
      httpStatusCode: 200,
      triggerSource: input.triggerSource,
    });

    await webhooksRepo.updateWebhookEvent(event.recordId, {
      status: "processed",
      processedAt: new Date().toISOString(),
      lastError: null,
    });

    if (externalActionRecordId) {
      await webhooksIngestRepo.updateExternalAction(externalActionRecordId, {
        status: "Succeeded",
        occurredAt: identity.occurredAt ?? new Date().toISOString(),
        httpStatusCode: 200,
        errorSummary: "",
      });
    }

    return {
      eventRecordId: event.recordId,
      createdEvent: event.created,
      processed: true,
      alreadyProcessed: false,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown webhook ingest error.";

    await webhooksRepo.updateWebhookEvent(event.recordId, {
      status: "failed",
      lastError: message,
    });

    if (externalActionRecordId) {
      await webhooksIngestRepo.updateExternalAction(externalActionRecordId, {
        status: "Failed",
        httpStatusCode: 500,
        errorSummary: message,
        occurredAt: identity.occurredAt ?? new Date().toISOString(),
        retryable: true,
      });
    }

    throw error;
  }
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

  const deliveryRecordId = await createDeliveryAttempt({});
  const isSignatureValid = webhooksRepo.validateSquareSignature({
    signatureKey,
    notificationUrl: resolveNotificationUrl(request),
    rawBody,
    signatureHeader,
  });

  if (!isSignatureValid) {
    await finalizeDeliveryAttempt({
      deliveryRecordId,
      signatureValid: false,
      responseCode: 401,
      errorMessage: "Invalid Square webhook signature.",
    });

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
    await finalizeDeliveryAttempt({
      deliveryRecordId,
      signatureValid: true,
      responseCode: 400,
      errorMessage: "Invalid JSON payload.",
    });
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  try {
    await ingestSquareEvent({
      payload,
      rawBody,
      deliveryRecordId,
      signatureValid: true,
      triggerSource: "Webhook",
    });
    return new NextResponse(null, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown webhook ingest error.";
    const isBadRequest = error instanceof SyncEndpointError && error.status === 400;
    const responseCode = isBadRequest ? 400 : 500;

    await finalizeDeliveryAttempt({
      deliveryRecordId,
      signatureValid: true,
      responseCode,
      errorMessage: message,
    });

    if (isBadRequest) {
      return NextResponse.json({ error: message }, { status: 400 });
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

export async function backfillSquareWebhooks(
  body: unknown,
): Promise<BackfillSquareWebhooksResponseDto> {
  const parsed = parseBackfillSquareWebhooksBody(body);
  const context = resolveSquareAuthContextFromAlias(parsed.accessTokenAlias);

  let cursor: string | null = null;
  let fetchedEvents = 0;
  let scannedEvents = 0;
  let createdEvents = 0;
  let existingEvents = 0;
  let processedEvents = 0;
  let alreadyProcessedEvents = 0;
  let failedEvents = 0;
  const failures: Array<{ providerEventId: string; eventType: string; error: string }> = [];

  outer: do {
    const page = await listSquareEvents({
      context,
      startAt: parsed.startAt,
      endAt: parsed.endAt,
      eventTypes: parsed.eventTypes,
      pageSize: parsed.pageSize,
      cursor,
    });

    fetchedEvents += page.events.length;

    for (const rawEvent of page.events) {
      if (scannedEvents >= parsed.maxEvents) {
        break outer;
      }

      scannedEvents += 1;
      const payload = rawEvent as SquareWebhookPayload;
      const rawBody = JSON.stringify(rawEvent);

      let identity: ReturnType<typeof parseSquareEventIdentity>;
      try {
        identity = parseSquareEventIdentity(payload);
      } catch (error) {
        failedEvents += 1;
        failures.push({
          providerEventId: "(missing)",
          eventType: "(missing)",
          error: error instanceof Error ? error.message : "Invalid event payload",
        });
        continue;
      }

      try {
        const canonical = await webhooksRepo.findWebhookEventByProviderEventId({
          provider: "Square",
          providerEventId: identity.providerEventId,
        });
        const legacy = canonical ? null : await webhooksRepo.findWebhookEventByEventKey(identity.eventKey);
        if (canonical || legacy) existingEvents += 1;
        else createdEvents += 1;

        if (parsed.dryRun) {
          if ((canonical?.status ?? legacy?.status) === "processed") {
            alreadyProcessedEvents += 1;
          } else {
            processedEvents += 1;
          }
          continue;
        }

        const deliveryRecordId = await createDeliveryAttempt({
          signatureValid: true,
          responseCode: 200,
          errorMessage: "Historical fetch delivery",
        });

        try {
          const result = await ingestSquareEvent({
            payload,
            rawBody,
            deliveryRecordId,
            signatureValid: true,
            triggerSource: "Backfill",
          });

          if (result.alreadyProcessed) {
            alreadyProcessedEvents += 1;
          } else {
            processedEvents += 1;
          }
        } catch (error) {
          failedEvents += 1;
          const message = error instanceof Error ? error.message : "Unknown ingest error";
          failures.push({
            providerEventId: identity.providerEventId,
            eventType: identity.eventType,
            error: message,
          });

          await finalizeDeliveryAttempt({
            deliveryRecordId,
            signatureValid: true,
            responseCode: 500,
            errorMessage: `Historical fetch failed: ${message}`,
          });
        }
      } catch (error) {
        failedEvents += 1;
        failures.push({
          providerEventId: identity.providerEventId,
          eventType: identity.eventType,
          error: error instanceof Error ? error.message : "Unknown backfill error",
        });
      }
    }

    cursor = page.cursor;
  } while (cursor);

  return {
    ok: true,
    dryRun: parsed.dryRun,
    accessTokenAlias: parsed.accessTokenAlias,
    startAt: parsed.startAt,
    endAt: parsed.endAt,
    eventTypes: parsed.eventTypes,
    fetchedEvents,
    scannedEvents,
    createdEvents,
    existingEvents,
    processedEvents,
    alreadyProcessedEvents,
    failedEvents,
    failures,
  };
}

export async function handleBackfillSquareWebhooks(request: Request) {
  try {
    assertAuthorizedSyncRequest(request);
    assertJsonRequest(request);
    const body = await parseJsonBody(request);
    const response = await backfillSquareWebhooks(body);
    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    const status = error instanceof SyncEndpointError ? error.status : 500;
    const message =
      error instanceof SyncEndpointError
        ? (error.exposeMessage ? error.message : "Unexpected server error.")
        : (error instanceof Error ? error.message : "Unexpected server error.");
    return NextResponse.json({ ok: false, error: message }, { status });
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
  const expected = webhooksRepo.createMetaSignature(rawBody, appSecret);

  if (!webhooksRepo.timingSafeEqual(expected, signature)) {
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
