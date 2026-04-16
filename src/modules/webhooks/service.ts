import { NextResponse } from "next/server";
import { airtableSchema } from "@/config/airtable-schema";
import { readOptionalEnv } from "@/lib/env";
import { assertJsonRequest, parseJsonBody } from "@/lib/http/request";
import { SyncEndpointError } from "@/lib/errors";
import { resolveSquareAuthContextFromAlias } from "@/lib/providers/square/provider-context";
import { listSquareEvents } from "@/lib/providers/square/events";
import { webhooksIngestRepo, webhooksRepo } from "./repo";
import { assertAuthorizedSyncRequest } from "@/modules/integrations";
import { ordersRepo, runApplyInvoicePayment } from "@/modules/orders";
import { externalActionsRepo } from "@/modules/external-actions";
import { refundExternalsRepo } from "@/modules/refund-externals";
import { updateRefundStatusCompleted } from "@/modules/refunds";
import type {
  BackfillExternalActionsFromWebhookEventsResponseDto,
  BackfillSquareWebhooksResponseDto,
  MetaWebhookPayload,
  SquareWebhookPayload,
} from "./dto";
import {
  parseBackfillExternalActionsFromWebhookEventsBody,
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

function readAtPathValue(value: unknown, path: string[]): unknown {
  let current: unknown = value;
  for (const segment of path) {
    if (typeof current !== "object" || current == null || Array.isArray(current)) return null;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function readNonNegativeInteger(value: unknown): number | null {
  if (value == null) return null;
  const str = typeof value === "string" ? value.trim() : String(value);
  const parsed = Number(str);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.trunc(parsed);
}

function parseIso(value: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function parseSquareInvoicePaymentEventFromPayload(input: {
  payload: unknown;
  rawBody: string;
  providerEventId: string;
  occurredAt: string | null;
}): {
  provider: string;
  providerEventId: string;
  providerEventType: string;
  externalInvoiceId: string;
  externalPaymentId: string;
  amountPaidCents: number;
  paidAt: string;
  rawPayload: string;
} | null {
  const readFirstPaymentRequestPath = (path: string[]): string | null => {
    const paymentRequests = readAtPath(input.payload, ["data", "object", "invoice", "payment_requests"]);
    if (!paymentRequests) return null;
    let parsed: unknown;
    try {
      parsed = JSON.parse(paymentRequests);
    } catch {
      parsed = undefined;
    }

    // If readAtPath couldn't represent the array (object traversal helper limitation),
    // fall back to direct object access.
    if (!Array.isArray(parsed)) {
      let current: unknown = input.payload;
      for (const segment of ["data", "object", "invoice", "payment_requests"]) {
        if (typeof current !== "object" || current == null || Array.isArray(current)) {
          current = null;
          break;
        }
        current = (current as Record<string, unknown>)[segment];
      }
      if (!Array.isArray(current) || current.length === 0) return null;
      let node: unknown = current[0];
      for (const segment of path) {
        if (typeof node !== "object" || node == null || Array.isArray(node)) return null;
        node = (node as Record<string, unknown>)[segment];
      }
      return readString(node);
    }

    if (parsed.length === 0) return null;
    let node: unknown = parsed[0];
    for (const segment of path) {
      if (typeof node !== "object" || node == null || Array.isArray(node)) return null;
      node = (node as Record<string, unknown>)[segment];
    }
    return readString(node);
  };

  const readFirstPaymentRequestPathValue = (path: string[]): unknown => {
    let current: unknown = input.payload;
    for (const segment of ["data", "object", "invoice", "payment_requests"]) {
      if (typeof current !== "object" || current == null || Array.isArray(current)) {
        return null;
      }
      current = (current as Record<string, unknown>)[segment];
    }
    if (!Array.isArray(current) || current.length === 0) return null;
    let node: unknown = current[0];
    for (const segment of path) {
      if (typeof node !== "object" || node == null || Array.isArray(node)) return null;
      node = (node as Record<string, unknown>)[segment];
    }
    return node;
  };

  const providerEventType = readAtPath(input.payload, ["type"]) ?? "invoice.payment_made";
  const externalInvoiceId =
    readAtPath(input.payload, ["data", "object", "payment", "invoice_id"]) ??
    readAtPath(input.payload, ["data", "object", "invoice", "id"]) ??
    readAtPath(input.payload, ["data", "id"]);
  const externalPaymentId =
    readAtPath(input.payload, ["data", "object", "payment", "id"]) ??
    readAtPath(input.payload, ["data", "object", "payment", "payment_id"]) ??
    readFirstPaymentRequestPath(["uid"]) ??
    input.providerEventId;
  const amountPaidCents =
    readNonNegativeInteger(readAtPathValue(input.payload, ["data", "object", "payment", "amount_money", "amount"])) ??
    readNonNegativeInteger(readAtPathValue(input.payload, ["data", "object", "payment", "paid_money", "amount"])) ??
    readNonNegativeInteger(readAtPathValue(input.payload, ["data", "object", "payment", "total_money", "amount"])) ??
    readNonNegativeInteger(readFirstPaymentRequestPathValue(["total_completed_amount_money", "amount"])) ??
    readNonNegativeInteger(readFirstPaymentRequestPathValue(["computed_amount_money", "amount"]));
  const paidAt =
    parseIso(readAtPath(input.payload, ["data", "object", "payment", "updated_at"])) ??
    parseIso(readAtPath(input.payload, ["data", "object", "payment", "created_at"])) ??
    parseIso(readAtPath(input.payload, ["data", "object", "invoice", "updated_at"])) ??
    parseIso(input.occurredAt);

  if (!externalInvoiceId || !externalPaymentId || amountPaidCents == null || !paidAt) {
    console.error("Failed to parse Square invoice.payment_made payload", {
      providerEventId: input.providerEventId,
      externalInvoiceId,
      externalPaymentId,
      amountPaidCents,
      paidAt,
      payload: JSON.stringify(input.payload, null, 2),
    });
    return null;
  }

  return {
    provider: "Square",
    providerEventId: input.providerEventId,
    providerEventType,
    externalInvoiceId,
    externalPaymentId,
    amountPaidCents,
    paidAt,
    rawPayload: input.rawBody,
  };
}

function parseSquareRefundSignalFromPayload(input: {
  payload: unknown;
  occurredAt: string | null;
}): {
  externalRefundId: string | null;
  externalStatus: string | null;
  externalPaymentId: string | null;
  externalOrderId: string | null;
  externalInvoiceId: string | null;
  activityAt: string;
} {
  const externalRefundId =
    readAtPath(input.payload, ["data", "object", "refund", "id"]) ??
    readAtPath(input.payload, ["data", "object", "id"]) ??
    readAtPath(input.payload, ["data", "id"]);

  const externalStatus =
    readAtPath(input.payload, ["data", "object", "refund", "status"]) ??
    readAtPath(input.payload, ["data", "object", "status"]);
  const externalPaymentId =
    readAtPath(input.payload, ["data", "object", "refund", "payment_id"]) ??
    readAtPath(input.payload, ["data", "object", "payment_id"]) ??
    readAtPath(input.payload, ["data", "object", "payment", "id"]);
  const externalOrderId =
    readAtPath(input.payload, ["data", "object", "refund", "order_id"]) ??
    readAtPath(input.payload, ["data", "object", "order_id"]) ??
    readAtPath(input.payload, ["data", "object", "order", "id"]);
  const externalInvoiceId =
    readAtPath(input.payload, ["data", "object", "refund", "invoice_id"]) ??
    readAtPath(input.payload, ["data", "object", "invoice_id"]) ??
    readAtPath(input.payload, ["data", "object", "invoice", "id"]);

  const activityAt =
    parseIso(readAtPath(input.payload, ["data", "object", "refund", "updated_at"])) ??
    parseIso(readAtPath(input.payload, ["data", "object", "refund", "created_at"])) ??
    parseIso(readAtPath(input.payload, ["data", "object", "updated_at"])) ??
    parseIso(input.occurredAt) ??
    new Date().toISOString();

  return {
    externalRefundId,
    externalStatus,
    externalPaymentId,
    externalOrderId,
    externalInvoiceId,
    activityAt,
  };
}

async function runRefundWebhookWriteback(input: {
  payload: unknown;
  occurredAt: string | null;
  externalActionRecordId: string | null;
}): Promise<{ refundExternalRecordId: string; externalRefundId: string }> {
  const signal = parseSquareRefundSignalFromPayload({
    payload: input.payload,
    occurredAt: input.occurredAt,
  });
  if (!signal.externalRefundId) {
    throw new SyncEndpointError(
      "Refund webhook payload is missing External Refund ID. Cannot run refund writeback.",
      422,
    );
  }

  let refundExternal = await refundExternalsRepo.findRefundExternalByExternalRefundId(
    signal.externalRefundId,
  );
  if (!refundExternal) {
    let matchedOrderExternalId = await resolveOrderExternalLinkFromSquareWebhook(input.payload);
    if (!matchedOrderExternalId && signal.externalPaymentId) {
      const matchedByPayment = await webhooksIngestRepo.findOrderExternalByExternalPaymentId(
        signal.externalPaymentId,
      );
      matchedOrderExternalId = matchedByPayment?.recordId ?? null;
    }
    if (!matchedOrderExternalId && signal.externalOrderId) {
      const matchedByOrder = await webhooksIngestRepo.findOrderExternalByExternalOrderId(
        signal.externalOrderId,
      );
      matchedOrderExternalId = matchedByOrder?.recordId ?? null;
    }
    if (!matchedOrderExternalId && signal.externalInvoiceId) {
      const matchedByInvoice = await webhooksIngestRepo.findOrderExternalByExternalInvoiceId(
        signal.externalInvoiceId,
      );
      matchedOrderExternalId = matchedByInvoice?.recordId ?? null;
    }

    if (matchedOrderExternalId) {
      const orderExternal = await ordersRepo.getOrderExternalRecord(matchedOrderExternalId);
      if (orderExternal.orderId) {
        const candidates = await refundExternalsRepo.listRefundExternalsByOrder(orderExternal.orderId);
        const runnableCandidates = candidates.filter((row) => {
          const syncStatus = (row.syncStatus ?? "").trim().toLowerCase();
          const refundStatus = (row.refundStatus ?? "").trim().toLowerCase();
          if (row.externalRefundId) return false;
          if (syncStatus && syncStatus !== "pending" && syncStatus !== "failed") return false;
          if (refundStatus && refundStatus !== "approved" && refundStatus !== "completed") return false;
          return true;
        });
        if (runnableCandidates.length > 1) {
          throw new SyncEndpointError(
            `Multiple Refund Externals matched webhook context for External Refund ID ${signal.externalRefundId}.`,
            409,
          );
        }
        refundExternal = runnableCandidates[0] ?? null;
      }
    }
  }

  if (!refundExternal) {
    throw new SyncEndpointError(
      `No Refund External found for External Refund ID ${signal.externalRefundId}.`,
      409,
    );
  }

  // Update Refund External with the provider's latest status signal.
  // Per spec: only currentExternalStatus and lastProviderActivityAt on any event;
  // additionally syncStatus=Failed and syncError on terminal failure.
  const resolvedExternalStatus = (signal.externalStatus ?? "").trim().toLowerCase();
  const isTerminalSuccess = resolvedExternalStatus === "succeeded" || resolvedExternalStatus === "completed";
  const isTerminalFailure =
    resolvedExternalStatus === "failed" ||
    resolvedExternalStatus === "canceled" ||
    resolvedExternalStatus === "rejected";

  const refundExternalUpdate: Record<string, unknown> = {
    [airtableSchema.operations.fields.refundExternals.currentExternalStatus]: signal.externalStatus ?? "",
    [airtableSchema.operations.fields.refundExternals.lastProviderActivityAt]: signal.activityAt,
  };
  if (isTerminalFailure) {
    refundExternalUpdate[airtableSchema.operations.fields.refundExternals.syncStatus] = "Failed";
    refundExternalUpdate[airtableSchema.operations.fields.refundExternals.syncError] =
      `Refund ${signal.externalStatus ?? "failed"} at provider.`;
  }
  await refundExternalsRepo.updateRefundExternalRecord(refundExternal.recordId, refundExternalUpdate);

  // Canonical write: set Refund Status to Completed on terminal success.
  let writebackErrorMessage: string | null = null;
  if (isTerminalSuccess && refundExternal.refundId) {
    try {
      await updateRefundStatusCompleted(refundExternal.refundId);
    } catch (err) {
      writebackErrorMessage = err instanceof Error ? err.message : "Failed to set Refund Completed.";
    }
  }

  // Update the inbound External Action with writeback outcome.
  // Step 1: scalar writeback fields only — these are safe and must not be blocked by
  // linked-record operations, which can throw non-strippable table-mismatch errors.
  if (input.externalActionRecordId) {
    const nowIso = new Date().toISOString();
    try {
      await externalActionsRepo.updateExternalAction({
        recordId: input.externalActionRecordId,
        status: writebackErrorMessage ? "Failed" : "Succeeded",
        writebackStatus: writebackErrorMessage ? "Failed" : "Succeeded",
        writebackError: writebackErrorMessage ?? "",
        writebackLastAttemptAt: nowIso,
        ...(writebackErrorMessage ? {} : { writebackSucceededAt: nowIso }),
        retryable: Boolean(writebackErrorMessage),
      });
    } catch (err) {
      console.error("runRefundWebhookWriteback: failed to set writeback status on inbound EA", {
        externalActionRecordId: input.externalActionRecordId,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // Step 2: linked record fields — best effort; a table-mismatch on org/provider fields
    // must not roll back the writeback status written in step 1.
    try {
      await externalActionsRepo.updateExternalAction({
        recordId: input.externalActionRecordId,
        refundExternalRecordId: refundExternal.recordId,
        ...(refundExternal.orgIntegrationId ? { orgIntegrationRecordId: refundExternal.orgIntegrationId } : {}),
        ...(refundExternal.providerAccountId ? { providerAccountRecordId: refundExternal.providerAccountId } : {}),
      });
    } catch (err) {
      console.error("runRefundWebhookWriteback: failed to link EA to refund context", {
        externalActionRecordId: input.externalActionRecordId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (writebackErrorMessage) {
    throw new SyncEndpointError(writebackErrorMessage, 502);
  }

  return {
    refundExternalRecordId: refundExternal.recordId,
    externalRefundId: signal.externalRefundId,
  };
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
  // Compatibility: some bases do not include "Invoice" as an allowed option for External Entity Type.
  // Invoice webhook events in this app are applied through Order Externals, so normalize to "Order".
  const externalEntityType = "Order" as const;

  if (existing) {
    const attemptNumber = (existing.attemptNumber ?? 1) + 1;
    await webhooksIngestRepo.updateExternalAction(existing.recordId, {
      occurredAt: input.occurredAt ?? new Date().toISOString(),
      status: input.status,
      actionType: "Webhook",
      externalEntityType,
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
    externalEntityType,
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

    if (identity.eventType === "invoice.payment_made") {
      const orderExternalRecordId = await resolveOrderExternalLinkFromSquareWebhook(input.payload);
      if (!orderExternalRecordId) {
        throw new SyncEndpointError(
          "Cannot reconcile invoice.payment_made to exactly one Order External.",
          409,
        );
      }
      const providerEvent = parseSquareInvoicePaymentEventFromPayload({
        payload: input.payload,
        rawBody: input.rawBody,
        providerEventId: identity.providerEventId,
        occurredAt: identity.occurredAt,
      });
      if (!providerEvent) {
        throw new SyncEndpointError(
          "invoice.payment_made payload is missing required invoice/payment identifiers or amount.",
          422,
        );
      }

      await runApplyInvoicePayment({
        recordId: orderExternalRecordId,
        force: false,
        idempotencyKey: `apply-invoice-payment|Square|${identity.providerEventId}`,
        providerEvent,
      });
    } else if (
      identity.eventType === "refund.updated" ||
      identity.eventType === "invoice.refunded"
    ) {
      await runRefundWebhookWriteback({
        payload: input.payload,
        occurredAt: identity.occurredAt,
        externalActionRecordId,
      });
    }

    await webhooksRepo.updateWebhookEvent(event.recordId, {
      status: "processed",
      processedAt: new Date().toISOString(),
      lastError: null,
    });

    // Refund events: inbound EA writeback fields are set inside runRefundWebhookWriteback.
    if (
      externalActionRecordId &&
      identity.eventType !== "invoice.payment_made" &&
      identity.eventType !== "refund.updated" &&
      identity.eventType !== "invoice.refunded"
    ) {
      await webhooksIngestRepo.updateExternalAction(externalActionRecordId, {
        status: "Succeeded",
        occurredAt: identity.occurredAt ?? new Date().toISOString(),
        httpStatusCode: 200,
        errorSummary: "",
        writebackStatus: "Succeeded",
        writebackSucceededAt: new Date().toISOString(),
        writebackError: "",
        writebackLastAttemptAt: new Date().toISOString(),
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

    try {
      await webhooksRepo.updateWebhookEvent(event.recordId, {
        status: "failed",
        lastError: message,
      });
    } catch {
      // best effort — do not let event update failure block EA status write
    }

    if (externalActionRecordId) {
      const nowIso = new Date().toISOString();
      if (
        identity.eventType === "invoice.payment_made" ||
        identity.eventType === "refund.updated" ||
        identity.eventType === "invoice.refunded"
      ) {
        // Scalar fields only — no linked records to avoid table-mismatch blocking the status write.
        try {
          await externalActionsRepo.updateExternalAction({
            recordId: externalActionRecordId,
            status: "Failed",
            httpStatusCode: 500,
            errorSummary: message,
            occurredAt: identity.occurredAt ?? nowIso,
            retryable: true,
            writebackStatus: "Failed",
            writebackError: message,
            writebackLastAttemptAt: nowIso,
          });
        } catch (eaErr) {
          console.error("ingestSquareEvent: failed to update EA on error path", {
            externalActionRecordId,
            error: eaErr instanceof Error ? eaErr.message : String(eaErr),
          });
        }
      } else {
        try {
          await webhooksIngestRepo.updateExternalAction(externalActionRecordId, {
            status: "Failed",
            httpStatusCode: 500,
            errorSummary: message,
            occurredAt: identity.occurredAt ?? nowIso,
            retryable: true,
          });
        } catch {
          // best effort
        }
      }
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

export async function backfillExternalActionsFromWebhookEvents(
  body: unknown,
): Promise<BackfillExternalActionsFromWebhookEventsResponseDto> {
  const parsed = parseBackfillExternalActionsFromWebhookEventsBody(body);

  let offset: string | null = null;
  let scannedEvents = 0;
  let eligibleEvents = 0;
  let createdOrUpdatedExternalActions = 0;
  let skippedUnsupportedEvents = 0;
  let failedEvents = 0;
  const failures: Array<{
    eventRecordId: string;
    providerEventId: string | null;
    eventType: string | null;
    error: string;
  }> = [];

  do {
    const page = await webhooksRepo.listWebhookEvents({
      pageSize: parsed.pageSize,
      ...(offset ? { offset } : {}),
    });

    for (const event of page.events) {
      if (scannedEvents >= parsed.maxEvents) {
        offset = null;
        break;
      }

      scannedEvents += 1;

      const provider = (event.provider ?? "").trim().toLowerCase();
      if (provider !== "square" || !event.providerEventId || !event.eventType) {
        continue;
      }
      if (parsed.onlySupportedEvents && !SUPPORTED_SQUARE_WEBHOOK_EVENTS.has(event.eventType)) {
        skippedUnsupportedEvents += 1;
        continue;
      }
      if (!event.payloadJson) {
        failedEvents += 1;
        failures.push({
          eventRecordId: event.recordId,
          providerEventId: event.providerEventId,
          eventType: event.eventType,
          error: "Missing Payload JSON on Webhook Event.",
        });
        continue;
      }

      eligibleEvents += 1;

      try {
        const payload = JSON.parse(event.payloadJson) as SquareWebhookPayload;

        if (!parsed.dryRun) {
          const externalActionRecordId = await upsertSquareInboundExternalAction({
            payload,
            rawBody: event.payloadJson,
            providerEventId: event.providerEventId,
            eventType: event.eventType,
            occurredAt: event.occurredAt,
            status: event.status === "failed" ? "Failed" : "Succeeded",
            errorSummary: event.status === "failed" ? (event.lastError ?? "Webhook Event marked failed.") : "",
            httpStatusCode: event.status === "failed" ? 500 : 200,
            triggerSource: "Backfill",
          });

          if (event.eventType === "invoice.payment_made") {
            const orderExternalRecordId = await resolveOrderExternalLinkFromSquareWebhook(payload);
            if (!orderExternalRecordId) {
              throw new SyncEndpointError(
                "Cannot reconcile invoice.payment_made to exactly one Order External.",
                409,
              );
            }
            const providerEvent = parseSquareInvoicePaymentEventFromPayload({
              payload,
              rawBody: event.payloadJson,
              providerEventId: event.providerEventId,
              occurredAt: event.occurredAt,
            });
            if (!providerEvent) {
              throw new SyncEndpointError(
                "invoice.payment_made payload is missing required invoice/payment identifiers or amount.",
                422,
              );
            }

            await runApplyInvoicePayment({
              recordId: orderExternalRecordId,
              force: false,
              idempotencyKey: `apply-invoice-payment|Square|${event.providerEventId}`,
              providerEvent,
            });
          } else if (
            event.eventType === "refund.updated" ||
            event.eventType === "invoice.refunded"
          ) {
            // Inbound EA writeback fields are set inside runRefundWebhookWriteback.
            await runRefundWebhookWriteback({
              payload,
              occurredAt: event.occurredAt,
              externalActionRecordId,
            });
          } else if (externalActionRecordId) {
            const nowIso = new Date().toISOString();
            await webhooksIngestRepo.updateExternalAction(externalActionRecordId, {
              status: event.status === "failed" ? "Failed" : "Succeeded",
              occurredAt: event.occurredAt ?? nowIso,
              httpStatusCode: event.status === "failed" ? 500 : 200,
              errorSummary: event.status === "failed" ? (event.lastError ?? "Webhook Event marked failed.") : "",
              writebackStatus: "Succeeded",
              writebackSucceededAt: nowIso,
              writebackLastAttemptAt: nowIso,
              writebackError: "",
            });
          }
        }

        createdOrUpdatedExternalActions += 1;
      } catch (error) {
        failedEvents += 1;
        failures.push({
          eventRecordId: event.recordId,
          providerEventId: event.providerEventId,
          eventType: event.eventType,
          error: error instanceof Error ? error.message : "Unknown backfill error",
        });
      }
    }

    offset = page.nextOffset;
  } while (offset);

  return {
    ok: true,
    dryRun: parsed.dryRun,
    scannedEvents,
    eligibleEvents,
    createdOrUpdatedExternalActions,
    skippedUnsupportedEvents,
    failedEvents,
    failures,
  };
}

export async function handleBackfillExternalActionsFromWebhookEvents(request: Request) {
  try {
    assertAuthorizedSyncRequest(request);
    assertJsonRequest(request);
    const body = await parseJsonBody(request);
    const response = await backfillExternalActionsFromWebhookEvents(body);
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
