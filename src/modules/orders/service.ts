import {
  invoicesRepo,
  ordersRepo,
  ordersWorkflowRepo,
  providerBillingRepo,
  providerContextRepo,
} from "./repo";
import { SyncEndpointError } from "@/lib/errors";
import type { ExternalActionType } from "@/modules/integrations";
import {
  countExternalActionsByOrderExternal,
  createExternalAction,
  findInboundExternalActionByIdentity,
  updateExternalAction,
} from "@/modules/integrations";
import { classifyRetryability, inferErrorType } from "@/modules/external-actions";
import { appendPurchaseCreditEntriesForOrder } from "@/modules/credit-ledger-entries";
import type { BillingAction } from "@/lib/types/billing";
import {
  getSquareCustomerContactIdentity,
  syncSquareCustomer,
} from "@/lib/providers/square/customers";
import { clientSyncRepo } from "@/modules/clients";
import type {
  BillingProcessExternalIds,
  BillingProcessErrorResponse,
  BillingProcessMetadata,
  BillingProcessResult,
  BillingProcessSuccessResponse,
  ApplyInvoicePaymentFailureResponse,
  ApplyInvoicePaymentSuccessResponse,
  OpenOrderResponse,
  ApplyInvoicePaymentRequest,
  OrderBillingRequest,
  ResolvePromotionRedemptionsResponse,
  SendInvoiceFailureResponse,
  SendInvoiceSuccessResponse,
} from "./dto";
import {
  parseApplyInvoicePaymentBody,
  parseOpenOrderBody,
  parseProcessOrderBillingBody,
  parseResolvePromotionRedemptionsBody,
  parseSendInvoiceBody,
} from "./schema";

export function successResponse(
  action: BillingAction,
  result: BillingProcessResult,
  externalIds?: BillingProcessExternalIds,
  metadata?: BillingProcessMetadata,
): BillingProcessSuccessResponse {
  const body: BillingProcessSuccessResponse = {
    ok: true,
    syncStatus: "Synced",
    action,
    result,
  };

  if (externalIds?.externalPaymentId) body.externalPaymentId = externalIds.externalPaymentId;
  if (externalIds?.externalOrderId) body.externalOrderId = externalIds.externalOrderId;
  if (externalIds?.externalInvoiceId) body.externalInvoiceId = externalIds.externalInvoiceId;
  if (metadata?.resolvedInvoiceRecordId) body.resolvedInvoiceRecordId = metadata.resolvedInvoiceRecordId;
  if (metadata?.externalAction) body.externalAction = metadata.externalAction;
  if (metadata?.writebackStatus) body.writebackStatus = metadata.writebackStatus;
  if (metadata?.reconciliationStatus) body.reconciliationStatus = metadata.reconciliationStatus;
  if (metadata?.invoiceId) body.invoiceId = metadata.invoiceId;
  if (metadata?.orderId) body.orderId = metadata.orderId;
  if (metadata?.invoiceExternalRecordId) body.invoiceExternalRecordId = metadata.invoiceExternalRecordId;
  if (metadata?.externalStatus) body.externalStatus = metadata.externalStatus;
  if (metadata?.amountDue != null) body.amountDue = metadata.amountDue;
  if (metadata?.amountPaid != null) body.amountPaid = metadata.amountPaid;
  if (metadata?.issuedAt) body.issuedAt = metadata.issuedAt;
  if (metadata?.dueAt) body.dueAt = metadata.dueAt;
  if (metadata?.hostedInvoiceUrl) body.hostedInvoiceUrl = metadata.hostedInvoiceUrl;
  if (typeof metadata?.wasExistingMappingReused === "boolean") {
    body.wasExistingMappingReused = metadata.wasExistingMappingReused;
  }
  if (metadata?.rawPayload) body.rawPayload = metadata.rawPayload;
  if (metadata?.canceledDuplicateExternalInvoiceIds?.length) {
    body.canceledDuplicateExternalInvoiceIds = metadata.canceledDuplicateExternalInvoiceIds;
  }
  if (metadata?.skippedDuplicateInvoiceCancellations?.length) {
    body.skippedDuplicateInvoiceCancellations = metadata.skippedDuplicateInvoiceCancellations;
  }

  return body;
}

export function failureFromError(
  error: unknown,
): { status: number; body: BillingProcessErrorResponse } {
  const isDev = process.env.NODE_ENV !== "production";

  if (error instanceof SyncEndpointError) {
    return {
      status: error.status,
      body: {
        ok: false,
        error: error.exposeMessage ? error.message : "Unexpected server error.",
        ...(isDev && error instanceof Error ? { stack: error.stack ?? null } : {}),
      },
    };
  }

  return {
    status: 500,
    body: {
      ok: false,
      error: error instanceof Error ? error.message : "Unexpected server error.",
      ...(isDev && error instanceof Error ? { stack: error.stack ?? null } : {}),
    },
  };
}

class SendInvoiceEndpointError extends SyncEndpointError {
  readonly stage: "validation" | "provider" | "writeback" | "ambiguity";
  readonly recordId: string;
  readonly crossedProviderBoundary: boolean;
  readonly externalActionId?: string;

  constructor(input: {
    message: string;
    status: number;
    stage: "validation" | "provider" | "writeback" | "ambiguity";
    recordId: string;
    crossedProviderBoundary: boolean;
    externalActionId?: string;
  }) {
    super(input.message, input.status);
    this.stage = input.stage;
    this.recordId = input.recordId;
    this.crossedProviderBoundary = input.crossedProviderBoundary;
    this.externalActionId = input.externalActionId;
  }
}

export function sendInvoiceFailureFromError(
  error: unknown,
  recordId: string | null,
): { status: number; body: SendInvoiceFailureResponse } {
  if (error instanceof SendInvoiceEndpointError) {
    return {
      status: error.status,
      body: {
        ok: false,
        endpoint: "/api/orders/send-invoice",
        recordId: error.recordId,
        crossedProviderBoundary: error.crossedProviderBoundary,
        stage: error.stage,
        error: error.message,
        ...(error.externalActionId ? { externalActionId: error.externalActionId } : {}),
      },
    };
  }

  if (error instanceof SyncEndpointError) {
    return {
      status: error.status,
      body: {
        ok: false,
        endpoint: "/api/orders/send-invoice",
        recordId: recordId ?? "",
        crossedProviderBoundary: false,
        stage: "validation",
        error: error.message,
      },
    };
  }

  return {
    status: 500,
    body: {
      ok: false,
      endpoint: "/api/orders/send-invoice",
      recordId: recordId ?? "",
      crossedProviderBoundary: false,
      stage: "validation",
      error: error instanceof Error ? error.message : "Unexpected server error.",
    },
  };
}

const OPERATION = "process_order_billing";

function isDebugEnabled(): boolean {
  return process.env.ORDER_BILLING_DEBUG === "true" || process.env.NODE_ENV !== "production";
}

function debugLog(message: string, data?: Record<string, unknown>): void {
  if (!isDebugEnabled()) return;
  console.info(message, data ?? {});
}

type CanonicalExternalAction = "Create Order" | "Create Invoice" | "Charge" | "Refund" | "Cancel";
type OrderRepoRecord = Awaited<ReturnType<typeof ordersRepo.getOrderRecord>>;
type OrderBillingStatus =
  | "Not Started"
  | "Processing"
  | "Payment Pending"
  | "Paid"
  | "Failed"
  | "Partially Refunded"
  | "Refunded";

function toCanonicalExternalAction(action: BillingAction): CanonicalExternalAction {
  if (action === "Invoice") return "Create Invoice";
  if (action === "Create Order") return "Create Order";
  if (action === "Create Invoice") return "Create Invoice";
  if (action === "Charge") return "Charge";
  if (action === "Refund") return "Refund";
  if (action === "Cancel") return "Cancel";
  throw new SyncEndpointError("Authentication action is not supported.", 422);
}

function buildExternalActionIdempotencyKey(action: CanonicalExternalAction, orderExternalRecordId: string): string {
  return `order-external:${action}:${orderExternalRecordId}`;
}

function toExternalActionType(action: BillingAction): ExternalActionType {
  if (action === "Create Order" || action === "Create Invoice") return "Create";
  if (action === "Charge") return "Charge";
  if (action === "Invoice") return "Send";
  if (action === "Cancel") return "Void";
  if (action === "Refund") return "Refund";
  throw new SyncEndpointError("Authentication action is not supported.", 422);
}

async function markOutboundExternalActionSucceeded(input: {
  recordId: string | null;
  responsePayload?: string | null;
  providerReferenceId?: string | null;
  writebackStatus: "Not Started" | "Succeeded";
}) {
  if (!input.recordId) return;
  await updateExternalAction(input.recordId, {
    status: "Succeeded",
    occurredAt: new Date().toISOString(),
    responsePayload: input.responsePayload ?? "",
    providerReferenceId: input.providerReferenceId ?? undefined,
    httpStatusCode: 200,
    errorSummary: "",
    writebackStatus: input.writebackStatus,
    ...(input.writebackStatus === "Succeeded"
      ? { writebackSucceededAt: new Date().toISOString() }
      : { writebackLastAttemptAt: new Date().toISOString() }),
  });
}

async function markOutboundExternalActionFailed(input: {
  recordId: string | null;
  errorSummary: string;
  rawPayload?: string;
  statusCode: number;
  attemptNumber: number;
  stage: "validation" | "provider" | "writeback" | "ambiguity";
}) {
  if (!input.recordId) return;
  const classification = classifyRetryability({
    stage: input.stage,
    httpStatus: input.statusCode,
    errorType: inferErrorType(input.errorSummary),
  });
  await updateExternalAction(input.recordId, {
    status: input.stage === "writeback" ? "Succeeded" : "Failed",
    occurredAt: new Date().toISOString(),
    errorSummary: input.errorSummary,
    rawProviderPayload: input.rawPayload,
    httpStatusCode: input.statusCode,
    retryable: classification.retryable,
    retryClassification: classification.classification,
    writebackStatus: "Failed",
    writebackError: input.errorSummary,
    writebackRetryCount: input.attemptNumber,
    writebackLastAttemptAt: new Date().toISOString(),
  });
}

function deriveBillingStatusFromPayment(input: {
  amountDue: number | null;
  amountPaid: number | null;
}): OrderBillingStatus {
  const due = input.amountDue ?? 0;
  const paid = input.amountPaid ?? 0;

  if (due > 0 && paid >= due) return "Paid";
  return "Payment Pending";
}

function firstNonEmptyString(...values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

function isAlreadyProcessedNoOp(input: {
  action: BillingAction;
  externalPaymentId: string | null;
  externalInvoiceId: string | null;
  externalOrderId: string | null;
}): boolean {
  if (input.action === "Charge") return Boolean(input.externalPaymentId || input.externalOrderId);
  if (input.action === "Invoice" || input.action === "Create Invoice") {
    return Boolean(input.externalInvoiceId || input.externalOrderId);
  }
  if (input.action === "Create Order") return Boolean(input.externalOrderId);
  return false;
}

function assertOrderBillingReady(order: OrderRepoRecord, action: BillingAction): void {
  if (!order.clientId) {
    throw new SyncEndpointError("Order missing client link.", 422);
  }

  if (action === "Charge") {
    if (order.amountDue == null || order.amountDue <= 0) {
      throw new SyncEndpointError("Order missing valid Amount Due.", 422);
    }
    if (!order.currency) {
      throw new SyncEndpointError("Order missing Currency.", 422);
    }
    if (order.billingStatus?.toLowerCase() === "paid") {
      throw new SyncEndpointError("Order is already marked paid.", 422);
    }
  }

  if ((action === "Invoice" || action === "Create Invoice" || action === "Create Order") && !order.currency) {
    throw new SyncEndpointError("Order missing Currency.", 422);
  }
}

function pickNewestUsableCard(
  cards: Array<{ externalCardId: string | null }>,
  clientExternalRecordId: string,
  activeCardCount: number | null,
): string {
  const usable = cards.find(
    (card) => typeof card.externalCardId === "string" && card.externalCardId.length > 0,
  );
  if (!usable?.externalCardId) {
    throw new SyncEndpointError(
      `Missing usable Card External with External Card ID. Resolved Client External=${clientExternalRecordId}, activeCardCount=${activeCardCount ?? "null"}, enabledCardsFound=${cards.length}, enabledCardsWithExternalCardId=${cards.filter((card) => Boolean(card.externalCardId)).length}.`,
      422,
    );
  }
  return usable.externalCardId;
}

async function cancelDuplicateProviderInvoicesForInvoice(input: {
  invoiceRecordId: string;
  canonicalExternalInvoiceId: string;
  context: Parameters<typeof providerBillingRepo.getInvoiceDetails>[0]["context"];
}): Promise<{
  canceledExternalInvoiceIds: string[];
  skippedDuplicateInvoiceCancellations: Array<{ externalInvoiceId: string; reason: string }>;
}> {
  const rows = await ordersRepo.listOrderExternalsByInvoice(input.invoiceRecordId);
  const candidateIds = [...new Set(
    rows
      .map((row) => row.externalInvoiceId)
      .filter((value): value is string => typeof value === "string" && value.length > 0),
  )];

  const duplicates = candidateIds.filter((id) => id !== input.canonicalExternalInvoiceId);
  const canceledExternalInvoiceIds: string[] = [];
  const skippedDuplicateInvoiceCancellations: Array<{ externalInvoiceId: string; reason: string }> = [];

  for (const duplicateExternalInvoiceId of duplicates) {
    try {
      const details = await providerBillingRepo.getInvoiceDetails({
        context: input.context,
        externalInvoiceId: duplicateExternalInvoiceId,
      });
      const status = (details.status ?? "").toUpperCase();

      if (status === "CANCELED") {
        skippedDuplicateInvoiceCancellations.push({
          externalInvoiceId: duplicateExternalInvoiceId,
          reason: "Already canceled",
        });
        continue;
      }
      if (status === "PAID") {
        skippedDuplicateInvoiceCancellations.push({
          externalInvoiceId: duplicateExternalInvoiceId,
          reason: "Already paid; cancellation skipped",
        });
        continue;
      }
      if (details.version == null) {
        skippedDuplicateInvoiceCancellations.push({
          externalInvoiceId: duplicateExternalInvoiceId,
          reason: "Missing Square invoice version",
        });
        continue;
      }

      await providerBillingRepo.cancelInvoice({
        context: input.context,
        externalInvoiceId: duplicateExternalInvoiceId,
        version: details.version,
      });

      canceledExternalInvoiceIds.push(duplicateExternalInvoiceId);
    } catch (error) {
      skippedDuplicateInvoiceCancellations.push({
        externalInvoiceId: duplicateExternalInvoiceId,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    canceledExternalInvoiceIds,
    skippedDuplicateInvoiceCancellations,
  };
}

export async function runOrderBillingProcessor(
  request: OrderBillingRequest,
): Promise<BillingProcessSuccessResponse> {
  debugLog("Billing processor start", {
    operation: OPERATION,
    action: request.action,
    orderRecordId: request.orderRecordId,
    orderExternalRecordId: request.orderExternalRecordId,
    orgIntegrationRecordId: request.orgIntegrationRecordId,
    invoiceRecordId: request.invoiceRecordId ?? null,
    externalInvoiceId: request.externalInvoiceId ?? null,
  });

  const orderExternal = await ordersRepo.getOrderExternalRecord(request.orderExternalRecordId);
  debugLog("Loaded order external", {
    loaded: Boolean(orderExternal),
    orderExternalRecordId: orderExternal.recordId,
    orderId: orderExternal.orderId,
    orgIntegrationId: orderExternal.orgIntegrationId,
    providerAccountId: orderExternal.providerAccountId,
  });
  const order = await ordersRepo.getOrderRecord(request.orderRecordId);
  debugLog("Loaded order", {
    loaded: Boolean(order),
    orderRecordId: order.recordId,
    hasClient: Boolean(order.clientId),
    amountDue: order.amountDue,
    currency: order.currency,
    billingStatus: order.billingStatus,
  });
  const orderRecordIdForFailure: string | null = order.recordId;
  let externalProcessSucceeded = false;
  let authoritativeBillingStatusAfterExternal: OrderBillingStatus | null = null;
  let outboundExternalActionRecordId: string | null = null;
  let outboundExternalActionAttempt = 1;

  try {
    if (orderExternal.orderId && orderExternal.orderId !== request.orderRecordId) {
      throw new SyncEndpointError("Order External is linked to a different Order.", 422);
    }
    const linkedOrderExternals = await ordersRepo.listOrderExternalsByOrder(request.orderRecordId);
    if (linkedOrderExternals.length > 1) {
      throw new SyncEndpointError(
        `Multiple Order Externals found for Order ${request.orderRecordId}. Resolve duplicates before processing.`,
        409,
      );
    }

    const externalAction = toCanonicalExternalAction(request.action);
    const writebackAction = request.writebackAction ?? "Write Result";
    const externalActionIdempotencyKey = buildExternalActionIdempotencyKey(
      externalAction,
      request.orderExternalRecordId,
    );
    const orgIntegration = await providerContextRepo.getOrgIntegrationRecord(request.orgIntegrationRecordId);
    const baseActionType = toExternalActionType(request.action);
    const priorOutboundActions = await countExternalActionsByOrderExternal(request.orderExternalRecordId);
    outboundExternalActionAttempt = priorOutboundActions + 1;
    const actionType = outboundExternalActionAttempt > 1 ? "Retry" : baseActionType;
    outboundExternalActionRecordId = await createExternalAction({
      externalEntityType: "Order",
      actionType,
      direction: "Outbound",
      triggerSource: "Automation",
      occurredAt: new Date().toISOString(),
      status: "Pending",
      attemptNumber: outboundExternalActionAttempt,
      retryable: true,
      orgIntegrationRecordId: request.orgIntegrationRecordId,
      providerAccountRecordId: orgIntegration.providerAccountId ?? undefined,
      provider: orgIntegration.provider ?? undefined,
      providerEventType: request.action,
      providerReferenceId: externalActionIdempotencyKey,
      writebackStatus: writebackAction === "Skip Writeback" ? "Not Started" : "Pending",
      writebackLastAttemptAt: new Date().toISOString(),
      orderExternalRecordId: request.orderExternalRecordId,
      requestPayload: JSON.stringify({
        action: request.action,
        orderRecordId: request.orderRecordId,
        orderExternalRecordId: request.orderExternalRecordId,
        orgIntegrationRecordId: request.orgIntegrationRecordId,
        invoiceRecordId: request.invoiceRecordId ?? null,
        externalInvoiceId: request.externalInvoiceId ?? null,
      }),
    });
    await ordersRepo.updateOrderExternal(request.orderExternalRecordId, {
      "External Actions": [...new Set([...orderExternal.externalActionIds, outboundExternalActionRecordId])],
    });

    const alreadyProcessed = isAlreadyProcessedNoOp({
      action: request.action,
      externalPaymentId: orderExternal.externalPaymentId,
      externalInvoiceId: orderExternal.externalInvoiceId,
      externalOrderId: orderExternal.externalOrderId,
    });

    if (alreadyProcessed && externalAction === "Charge") {
      await appendPurchaseCreditEntriesForOrder({
        orderRecordId: request.orderRecordId,
        notes: "Purchase Credit from Order billing charge noop recovery.",
      });
      await markOutboundExternalActionSucceeded({
        recordId: outboundExternalActionRecordId,
        responsePayload: JSON.stringify({
          result: "noop",
          reason: "external identifiers already present",
        }),
        providerReferenceId: orderExternal.externalPaymentId ?? orderExternal.externalOrderId,
        writebackStatus: "Succeeded",
      });
      return successResponse(request.action, "noop", {
        externalPaymentId: orderExternal.externalPaymentId,
        externalOrderId: orderExternal.externalOrderId,
        externalInvoiceId: orderExternal.externalInvoiceId,
      }, {
        externalAction,
        writebackStatus: "Succeeded",
        reconciliationStatus: "Complete",
      });
    }
    if (alreadyProcessed && externalAction === "Create Invoice") {
      await markOutboundExternalActionSucceeded({
        recordId: outboundExternalActionRecordId,
        responsePayload: JSON.stringify({
          result: "noop",
          reason: "external invoice identifier already present",
        }),
        providerReferenceId: orderExternal.externalInvoiceId ?? orderExternal.externalOrderId,
        writebackStatus: "Succeeded",
      });
      return successResponse(request.action, "noop", {
        externalOrderId: orderExternal.externalOrderId,
        externalInvoiceId: orderExternal.externalInvoiceId,
      }, {
        externalAction,
        writebackStatus: "Succeeded",
        reconciliationStatus: "Complete",
      });
    }

    assertOrderBillingReady(order, request.action);

    if (
      externalAction === "Create Order" ||
      externalAction === "Create Invoice" ||
      externalAction === "Charge"
    ) {
      await ordersRepo.updateOrderBillingStatus(request.orderRecordId, "Processing");
    }

    debugLog("Loaded org integration", {
      loaded: Boolean(orgIntegration),
      orgIntegrationRecordId: orgIntegration.recordId,
      provider: orgIntegration.provider,
      providerAccountId: orgIntegration.providerAccountId,
      hasExternalLocationId: Boolean(orgIntegration.externalLocationId),
      hasAccessToken: Boolean(orgIntegration.accessToken),
    });
    const context = providerContextRepo.resolveSquareProviderContext(orgIntegration, "Invoice");
    debugLog("Resolved provider context", {
      provider: context.provider,
      providerAccountId: context.providerAccountId,
      accessTokenAlias: context.accessTokenAlias,
      externalLocationId: context.externalLocationId,
    });

    const clientExternal = await ordersRepo.findClientExternalByContext(order.clientId as string, context.providerAccountId);
    debugLog("Loaded client external", {
      loaded: Boolean(clientExternal),
      clientExternalRecordId: clientExternal?.recordId ?? null,
      providerAccountId: clientExternal?.providerAccountId ?? null,
      hasExternalCustomerId: Boolean(clientExternal?.externalCustomerId),
      activeCardCount: clientExternal?.activeCardCount ?? null,
      expectedProviderAccountId: context.providerAccountId,
      resolutionSource: "client_provider_lookup",
    });
    if (!clientExternal) {
      throw new SyncEndpointError("Missing Client External for provider account context.", 422);
    }
    if (clientExternal.providerAccountId !== context.providerAccountId) {
      throw new SyncEndpointError(
        "Order External Client External is not in the same provider account context.",
        422,
      );
    }
    if (!clientExternal.externalCustomerId) {
      throw new SyncEndpointError("Missing External Customer ID.", 422);
    }

    if (externalAction === "Charge") {
      const cardExternals = await ordersRepo.findActiveCardExternalsByClientExternal(clientExternal.recordId);
      debugLog("Loaded card externals", {
        loaded: cardExternals.length > 0,
        count: cardExternals.length,
        clientExternalRecordId: clientExternal.recordId,
        activeCardCount: clientExternal.activeCardCount,
        withExternalCardId: cardExternals.filter((card) => Boolean(card.externalCardId)).length,
      });
      const externalCardId = pickNewestUsableCard(
        cardExternals,
        clientExternal.recordId,
        clientExternal.activeCardCount,
      );
      debugLog("Resolved provider charge inputs", {
        action: request.action,
        customerId: clientExternal.externalCustomerId,
        cardId: externalCardId,
        locationId: context.externalLocationId,
        amount: order.amountDue,
        currency: order.currency,
      });

      const chargeOrderItems = await ordersRepo.listOrderItems(request.orderRecordId);
      const validChargeOrderItems = chargeOrderItems.filter(
        (item) => !!item.description && item.netAmount != null && item.netAmount > 0,
      );

      const chargeResult = await providerBillingRepo.chargeWithCardOnFile({
        context,
        idempotencyKeyPrefix: `${request.orderExternalRecordId}:Charge`,
        externalCustomerId: clientExternal.externalCustomerId,
        externalCardId,
        amountDue: order.amountDue as number,
        currency: order.currency as string,
        lineItems: validChargeOrderItems,
      });

      await ordersRepo.updateOrderExternal(request.orderExternalRecordId, {
        "Sync Status": "Synced",
        "Sync Error": "",
        "Last Synced At": new Date().toISOString(),
        "External Action": request.action,
        "External Process Status": "Succeeded",
        "External Process At": new Date().toISOString(),
        "External Process Error": "",
        "External Process Raw Payload": chargeResult.rawPayload,
        "Customer ID Snapshot": clientExternal.externalCustomerId,
        "Card ID Snapshot": externalCardId,
        "Amount Snapshot": order.amountDue as number,
        "External Payment ID": chargeResult.externalPaymentId,
        ...(chargeResult.externalOrderId ? { "External Order ID": chargeResult.externalOrderId } : {}),
        "Raw Payload": chargeResult.rawPayload,
        ...(writebackAction === "Skip Writeback"
          ? {
              "Writeback Status": "Not Started",
              "Reconciliation Status": "Needs Review",
            }
          : {
              "Writeback Status": "Succeeded",
              "Writeback At": new Date().toISOString(),
              "Writeback Error": "",
              "Reconciliation Status": "Complete",
            }),
        "Last Sync Activity At": new Date().toISOString(),
        "Last API Response Code": 200,
        "Last API Message": "Charge processed",
      });
      if (order.amountDue != null) {
        await ordersRepo.updateOrderAmountPaid(request.orderRecordId, order.amountDue);
      }
      const chargeAmountPaid = order.amountDue ?? 0;
      const chargeBillingStatus = deriveBillingStatusFromPayment({
        amountDue: order.amountDue,
        amountPaid: chargeAmountPaid,
      });
      externalProcessSucceeded = true;
      authoritativeBillingStatusAfterExternal = chargeBillingStatus;
      await ordersRepo.updateOrderBillingStatus(request.orderRecordId, chargeBillingStatus);
      await appendPurchaseCreditEntriesForOrder({
        orderRecordId: request.orderRecordId,
        notes: "Purchase Credit from Order billing charge.",
      });

      console.info("Order billing processed", {
        operation: OPERATION,
        action: request.action,
        orderRecordId: request.orderRecordId,
        orderExternalRecordId: request.orderExternalRecordId,
        orgIntegrationRecordId: request.orgIntegrationRecordId,
        provider: context.provider,
        providerAccountId: context.providerAccountId,
        outcome: "success",
      });
      await markOutboundExternalActionSucceeded({
        recordId: outboundExternalActionRecordId,
        responsePayload: chargeResult.rawPayload,
        providerReferenceId: chargeResult.externalPaymentId ?? chargeResult.externalOrderId,
        writebackStatus: writebackAction === "Skip Writeback" ? "Not Started" : "Succeeded",
      });

      return successResponse(request.action, "processed", {
        externalPaymentId: chargeResult.externalPaymentId,
        externalOrderId: chargeResult.externalOrderId,
      }, {
        externalAction,
        writebackStatus: writebackAction === "Skip Writeback" ? "Skipped" : "Succeeded",
        reconciliationStatus: writebackAction === "Skip Writeback" ? "Needs Review" : "Complete",
      });
    }

    if (externalAction === "Create Order") {
      const orderItems = await ordersRepo.listOrderItems(request.orderRecordId);
      if (orderItems.length === 0) {
        throw new SyncEndpointError("Missing Order Items for Create Order.", 422);
      }

      const invalidItem = orderItems.find(
        (item) => !item.description || item.netAmount == null || item.netAmount <= 0,
      );
      if (invalidItem) {
        throw new SyncEndpointError("Invalid Order Items for Create Order.", 422);
      }

      const createOrderResult = await providerBillingRepo.createOrderFromOrderItems({
        context,
        idempotencyKey: `${request.orderExternalRecordId}:CreateOrder`,
        externalCustomerId: clientExternal.externalCustomerId,
        orderItems,
        currency: order.currency as string,
      });

      const relatedOrderExternals = await ordersRepo.listOrderExternalsByOrder(request.orderRecordId);
      const relatedRows = relatedOrderExternals.filter(
        (row) => row.recordId !== request.orderExternalRecordId,
      );

      const paymentRow = relatedRows.find(
        (row) => typeof row.externalPaymentId === "string" && row.externalPaymentId.length > 0,
      );
      const invoiceRow = relatedRows.find(
        (row) => typeof row.externalInvoiceId === "string" && row.externalInvoiceId.length > 0,
      );

      const recoveredExternalPaymentId = paymentRow?.externalPaymentId ?? null;
      const recoveredExternalInvoiceId = invoiceRow?.externalInvoiceId ?? null;
      const recoveredExternalInvoiceUrl = null;
      const recoveredAmountPaid = order.amountPaid ?? 0;

      let reconciledInvoiceExternalRecordId: string | null = null;

      if (recoveredExternalInvoiceId) {
        let recoveredInvoiceRecordId = firstNonEmptyString(
          request.invoiceRecordId,
          (await invoicesRepo.findSingleInvoiceByOrder(request.orderRecordId))?.recordId,
        );

        if (!recoveredInvoiceRecordId) {
          const existingInvoice = await invoicesRepo.findSingleInvoiceByOrder(request.orderRecordId);
          if (existingInvoice) {
            recoveredInvoiceRecordId = existingInvoice.recordId;
          }
        }

        if (!recoveredInvoiceRecordId) {
          const createdInvoice = await invoicesRepo.createInvoiceForOrder({
            Order: [request.orderRecordId],
            Status: deriveBillingStatusFromPayment({
              amountDue: order.amountDue,
              amountPaid: recoveredAmountPaid,
            }) === "Paid"
              ? "Paid"
              : "Draft",
            ...(order.amountDue != null ? { "Amount Due": order.amountDue } : {}),
            "Amount Paid": recoveredAmountPaid,
            "Issued At": new Date().toISOString(),
          });
          recoveredInvoiceRecordId = createdInvoice.recordId;
        }

        if (recoveredInvoiceRecordId) {
          try {
            await invoicesRepo.linkOrderExternalToInvoice(request.orderExternalRecordId, recoveredInvoiceRecordId);
          } catch (error) {
            debugLog("Order External invoice link backfill skipped in Create Order", {
              orderExternalRecordId: request.orderExternalRecordId,
              invoiceRecordId: recoveredInvoiceRecordId,
              error: error instanceof Error ? error.message : String(error),
            });
          }

          const existingInvoiceExternal = await invoicesRepo.findInvoiceExternalByInvoiceAndOrgIntegration(
            recoveredInvoiceRecordId,
            request.orgIntegrationRecordId,
          );

          if (existingInvoiceExternal) {
            await invoicesRepo.updateInvoiceExternal(existingInvoiceExternal.recordId, {
              "External Invoice ID": recoveredExternalInvoiceId,
              ...(recoveredExternalInvoiceUrl
                ? { "Hosted Invoice URL": recoveredExternalInvoiceUrl }
                : {}),
              "Amount Due": order.amountDue ?? 0,
              "Amount Paid": recoveredAmountPaid,
              "Amount Refunded": 0,
              "External Status": deriveBillingStatusFromPayment({
                amountDue: order.amountDue,
                amountPaid: recoveredAmountPaid,
              }) === "Paid"
                ? "Paid"
                : "Draft",
              "External Process Action": "Sync",
              "External Process Status": "Succeeded",
              "External Process At": new Date().toISOString(),
              "External Process Error": "",
              "External Action Idempotency Key": `invoice-external:sync:${context.provider.toLowerCase()}:${recoveredInvoiceRecordId}`,
              "External Process Raw Payload": JSON.stringify({
                action: "Sync",
                source: "create-order-recovery",
                externalInvoiceId: recoveredExternalInvoiceId,
              }),
              "Writeback Status": "Succeeded",
              "Writeback At": new Date().toISOString(),
              "Writeback Error": "",
              "Writeback Last Attempt At": new Date().toISOString(),
              "Reconciliation Status": "Complete",
              "Last Synced At": new Date().toISOString(),
              "Last Sync Activity At": new Date().toISOString(),
              "Last API Response Code": 200,
              "Last API Message": "Invoice External synced from Create Order recovery",
            });
            reconciledInvoiceExternalRecordId = existingInvoiceExternal.recordId;
          } else {
            const createdInvoiceExternal = await invoicesRepo.createInvoiceExternal({
              Invoice: [recoveredInvoiceRecordId],
              Order: [request.orderRecordId],
              "Org Integration": [request.orgIntegrationRecordId],
              "External Invoice ID": recoveredExternalInvoiceId,
              ...(createOrderResult.externalOrderId
                ? { "External Order ID": createOrderResult.externalOrderId }
                : {}),
              ...(recoveredExternalInvoiceUrl
                ? { "Hosted Invoice URL": recoveredExternalInvoiceUrl }
                : {}),
              "Amount Due": order.amountDue ?? 0,
              "Amount Paid": recoveredAmountPaid,
              "Amount Refunded": 0,
              "External Status": deriveBillingStatusFromPayment({
                amountDue: order.amountDue,
                amountPaid: recoveredAmountPaid,
              }) === "Paid"
                ? "Paid"
                : "Draft",
              "External Process Action": "Sync",
              "External Process Status": "Succeeded",
              "External Process At": new Date().toISOString(),
              "External Process Error": "",
              "External Action Idempotency Key": `invoice-external:sync:${context.provider.toLowerCase()}:${recoveredInvoiceRecordId}`,
              "External Process Raw Payload": JSON.stringify({
                action: "Sync",
                source: "create-order-recovery",
                externalInvoiceId: recoveredExternalInvoiceId,
              }),
              "Writeback Status": "Succeeded",
              "Writeback At": new Date().toISOString(),
              "Writeback Error": "",
              "Writeback Last Attempt At": new Date().toISOString(),
              "Reconciliation Status": "Complete",
              "Last Synced At": new Date().toISOString(),
              "Last Sync Activity At": new Date().toISOString(),
              "Last API Response Code": 200,
              "Last API Message": "Invoice External created from Create Order recovery",
            });
            reconciledInvoiceExternalRecordId = createdInvoiceExternal.recordId;
          }
        }
      }

      const createOrderAmountPaid = recoveredAmountPaid;
      const createOrderBillingStatus = deriveBillingStatusFromPayment({
        amountDue: order.amountDue,
        amountPaid: createOrderAmountPaid,
      });

      await ordersRepo.updateOrderExternal(request.orderExternalRecordId, {
        "Sync Status": "Synced",
        "Sync Error": "",
        "Last Synced At": new Date().toISOString(),
        "External Action": request.action,
        "External Process Status": "Succeeded",
        "External Process At": new Date().toISOString(),
        "External Process Error": "",
        "External Process Raw Payload": createOrderResult.rawPayload,
        "Customer ID Snapshot": clientExternal.externalCustomerId,
        ...(order.amountDue != null ? { "Amount Snapshot": order.amountDue } : {}),
        "External Order ID": createOrderResult.externalOrderId,
        ...(recoveredExternalPaymentId ? { "External Payment ID": recoveredExternalPaymentId } : {}),
        ...(recoveredExternalInvoiceId ? { "External Invoice ID": recoveredExternalInvoiceId } : {}),
        ...(recoveredExternalInvoiceUrl ? { "External Invoice URL": recoveredExternalInvoiceUrl } : {}),
        "Raw Payload": createOrderResult.rawPayload,
        ...(writebackAction === "Skip Writeback"
          ? {
              "Writeback Status": "Not Started",
              "Reconciliation Status": "Needs Review",
            }
          : {
              "Writeback Status": "Succeeded",
              "Writeback At": new Date().toISOString(),
              "Writeback Error": "",
              "Reconciliation Status": "Complete",
            }),
        "Last Sync Activity At": new Date().toISOString(),
        "Last API Response Code": 200,
        "Last API Message": "Create Order processed",
      });

      await ordersRepo.updateOrderAmountPaid(request.orderRecordId, createOrderAmountPaid);
      externalProcessSucceeded = true;
      authoritativeBillingStatusAfterExternal = createOrderBillingStatus;
      await ordersRepo.updateOrderBillingStatus(request.orderRecordId, createOrderBillingStatus);
      await markOutboundExternalActionSucceeded({
        recordId: outboundExternalActionRecordId,
        responsePayload: createOrderResult.rawPayload,
        providerReferenceId: createOrderResult.externalOrderId,
        writebackStatus: writebackAction === "Skip Writeback" ? "Not Started" : "Succeeded",
      });

      return successResponse(
        request.action,
        "processed",
        {
          externalOrderId: createOrderResult.externalOrderId,
          ...(recoveredExternalPaymentId ? { externalPaymentId: recoveredExternalPaymentId } : {}),
          ...(recoveredExternalInvoiceId ? { externalInvoiceId: recoveredExternalInvoiceId } : {}),
        },
        {
          externalAction,
          orderId: request.orderRecordId,
          invoiceExternalRecordId: reconciledInvoiceExternalRecordId,
          amountDue: order.amountDue,
          amountPaid: createOrderAmountPaid,
          writebackStatus: writebackAction === "Skip Writeback" ? "Skipped" : "Succeeded",
          reconciliationStatus: writebackAction === "Skip Writeback" ? "Needs Review" : "Complete",
          rawPayload: createOrderResult.rawPayload,
        },
      );
    }

    if (externalAction === "Create Invoice") {
      const fallbackInvoiceFromOrder = !request.invoiceRecordId
        ? await invoicesRepo.findSingleInvoiceByOrder(request.orderRecordId)
        : null;
      let resolvedInvoiceRecordId = firstNonEmptyString(
        request.invoiceRecordId,
        fallbackInvoiceFromOrder?.recordId,
      );

      let knownExternalInvoiceIdBeforeResolution = firstNonEmptyString(
        request.externalInvoiceId,
        orderExternal.externalInvoiceId,
      );

      if (!resolvedInvoiceRecordId) {
        const createdInvoice = await invoicesRepo.createInvoiceForOrder({
          Order: [request.orderRecordId],
          Status: "Draft",
          ...(order.amountDue != null ? { "Amount Due": order.amountDue } : {}),
          "Amount Paid": 0,
          "Issued At": new Date().toISOString(),
        });
        resolvedInvoiceRecordId = createdInvoice.recordId;

        try {
          await invoicesRepo.linkOrderExternalToInvoice(request.orderExternalRecordId, createdInvoice.recordId);
        } catch (error) {
          debugLog("Order External to Invoice link backfill failed", {
            orderExternalRecordId: request.orderExternalRecordId,
            invoiceRecordId: createdInvoice.recordId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      if (!resolvedInvoiceRecordId) {
        throw new SyncEndpointError(
          "Missing invoiceRecordId for Invoice action. Provide invoiceRecordId in request, link Invoice on Order External, or ensure exactly one Invoice is linked to the Order.",
          400,
        );
      }

      debugLog("Resolved invoiceRecordId", {
        resolvedInvoiceRecordId,
        resolutionSource: request.invoiceRecordId
          ? "request"
          : fallbackInvoiceFromOrder
              ? "order_link_lookup"
              : "none",
      });

      const invoice = await invoicesRepo.getInvoiceRecord(resolvedInvoiceRecordId);
      if (!invoice.orderId) {
        throw new SyncEndpointError("Invoice is not linked to an Order.", 422);
      }
      if (invoice.orderId !== request.orderRecordId) {
        throw new SyncEndpointError("Invoice is linked to a different Order.", 422);
      }

      const providerContextKey = context.provider.toLowerCase();
      const invoiceExternalIdempotencyKey =
        `invoice-external:create:${providerContextKey}:${invoice.recordId}`;

      debugLog("Invoice external idempotency context", {
        invoiceRecordId: invoice.recordId,
        orderRecordId: request.orderRecordId,
        orgIntegrationRecordId: request.orgIntegrationRecordId,
        idempotencyKey: invoiceExternalIdempotencyKey,
      });

      const existingInvoiceExternal = await invoicesRepo.findInvoiceExternalByInvoiceAndOrgIntegration(
        invoice.recordId,
        request.orgIntegrationRecordId,
      );

      // Ordered decision logic for this path:
      // 1) if Invoice External exists, return it
      // 2) else if externalInvoiceId exists, create Invoice External
      // 3) else fail hard
      if (existingInvoiceExternal) {
        const knownExternalInvoiceId = firstNonEmptyString(
          existingInvoiceExternal.externalInvoiceId,
          request.externalInvoiceId,
          orderExternal.externalInvoiceId,
        );

        if (!knownExternalInvoiceId) {
          throw new SyncEndpointError(
            "Existing Invoice External is missing External Invoice ID.",
            409,
          );
        }

        const knownHostedInvoiceUrl = firstNonEmptyString(
          existingInvoiceExternal.hostedInvoiceUrl,
        );
        const staleUpdate: Record<string, string> = {};

        if (!existingInvoiceExternal.hostedInvoiceUrl && knownHostedInvoiceUrl) {
          staleUpdate["Hosted Invoice URL"] = knownHostedInvoiceUrl;
        }
        if (existingInvoiceExternal.syncStatus?.toLowerCase() !== "synced") {
          staleUpdate["Writeback Status"] = "Succeeded";
        }
        if (existingInvoiceExternal.syncError) {
          staleUpdate["Writeback Error"] = "";
        }
        staleUpdate["Last Synced At"] = new Date().toISOString();
        staleUpdate["Last Sync Activity At"] = new Date().toISOString();
        staleUpdate["External Process Action"] = "Create Invoice";
        staleUpdate["External Process Status"] = "Succeeded";
        staleUpdate["External Process At"] = new Date().toISOString();
        staleUpdate["External Process Error"] = "";
        staleUpdate["External Action Idempotency Key"] = invoiceExternalIdempotencyKey;
        staleUpdate["Writeback Last Attempt At"] = new Date().toISOString();
        staleUpdate["Reconciliation Status"] = "Complete";
        staleUpdate["Last API Response Code"] = "200";
        staleUpdate["Last API Message"] = "Create Invoice reused existing mapping";

        if (Object.keys(staleUpdate).length > 0) {
          await invoicesRepo.updateInvoiceExternal(existingInvoiceExternal.recordId, staleUpdate);
        }

        await ordersRepo.updateOrderExternal(request.orderExternalRecordId, {
          "Sync Status": "Synced",
          "Sync Error": "",
          "Last Synced At": new Date().toISOString(),
          "External Action": request.action,
          "External Process Status": "Succeeded",
          "External Process At": new Date().toISOString(),
          "External Process Error": "",
          "Customer ID Snapshot": clientExternal.externalCustomerId,
          ...(order.amountDue != null ? { "Amount Snapshot": order.amountDue } : {}),
          "External Invoice ID": knownExternalInvoiceId,
          ...(knownHostedInvoiceUrl ? { "External Invoice URL": knownHostedInvoiceUrl } : {}),
          ...(writebackAction === "Skip Writeback"
            ? {
                "Writeback Status": "Not Started",
                "Reconciliation Status": "Needs Review",
              }
            : {
                "Writeback Status": "Succeeded",
                "Writeback At": new Date().toISOString(),
                "Writeback Error": "",
                "Reconciliation Status": "Complete",
              }),
          "Last Sync Activity At": new Date().toISOString(),
          "Last API Response Code": 200,
          "Last API Message": "Create Invoice reused existing mapping",
        });
        if (knownHostedInvoiceUrl) {
          await invoicesRepo.updateInvoicePaymentLink(invoice.recordId, knownHostedInvoiceUrl);
        }
        const paidAmount = invoice.amountPaid ?? 0;
        const invoiceBillingStatus = deriveBillingStatusFromPayment({
          amountDue: invoice.amountDue ?? order.amountDue,
          amountPaid: paidAmount,
        });
        externalProcessSucceeded = true;
        authoritativeBillingStatusAfterExternal = invoiceBillingStatus;
        await ordersRepo.updateOrderAmountPaid(request.orderRecordId, paidAmount);
        await ordersRepo.updateOrderBillingStatus(request.orderRecordId, invoiceBillingStatus);

        const cancellationResult = await cancelDuplicateProviderInvoicesForInvoice({
          invoiceRecordId: invoice.recordId,
          canonicalExternalInvoiceId: knownExternalInvoiceId,
          context,
        });
        await markOutboundExternalActionSucceeded({
          recordId: outboundExternalActionRecordId,
          responsePayload: existingInvoiceExternal.rawPayload,
          providerReferenceId: knownExternalInvoiceId,
          writebackStatus: writebackAction === "Skip Writeback" ? "Not Started" : "Succeeded",
        });

        return successResponse(
          request.action,
          "noop",
          {
            externalOrderId: orderExternal.externalOrderId,
            externalInvoiceId: knownExternalInvoiceId,
          },
          {
            resolvedInvoiceRecordId,
            invoiceId: invoice.recordId,
            orderId: request.orderRecordId,
            invoiceExternalRecordId: existingInvoiceExternal.recordId,
            externalStatus: existingInvoiceExternal.externalStatus ?? invoice.status,
            amountDue: invoice.amountDue ?? order.amountDue,
            amountPaid: invoice.amountPaid ?? 0,
            issuedAt: invoice.issuedAt,
            dueAt: invoice.dueAt,
            hostedInvoiceUrl: knownHostedInvoiceUrl,
            wasExistingMappingReused: true,
            rawPayload: existingInvoiceExternal.rawPayload,
            canceledDuplicateExternalInvoiceIds: cancellationResult.canceledExternalInvoiceIds,
            skippedDuplicateInvoiceCancellations:
              cancellationResult.skippedDuplicateInvoiceCancellations,
            externalAction,
            writebackStatus: writebackAction === "Skip Writeback" ? "Skipped" : "Succeeded",
            reconciliationStatus:
              writebackAction === "Skip Writeback" ? "Needs Review" : "Complete",
          },
        );
      }

      const knownExternalInvoiceId = firstNonEmptyString(
        knownExternalInvoiceIdBeforeResolution,
      );

      let externalOrderIdForInvoice = orderExternal.externalOrderId;
      let externalInvoiceUrlFromProvider: string | null = null;
      let providerInvoiceRawPayload: string | null = null;
      let resolvedExternalInvoiceId = knownExternalInvoiceId;

      if (!resolvedExternalInvoiceId) {
        const orderItems = await ordersRepo.listOrderItems(request.orderRecordId);
        if (orderItems.length === 0) {
          throw new SyncEndpointError("Missing Order Items for Create Invoice.", 422);
        }

        const invalidItem = orderItems.find(
          (item) => !item.description || item.netAmount == null || item.netAmount <= 0,
        );
        if (invalidItem) {
          throw new SyncEndpointError("Invalid Order Items for Create Invoice.", 422);
        }

        const createdProviderInvoice = await providerBillingRepo.createInvoiceFromOrderItems({
          context,
          orderIdempotencyKey: `${request.orderExternalRecordId}:Invoice:Order`,
          invoiceIdempotencyKey: `${request.orderExternalRecordId}:Invoice:Invoice`,
          externalCustomerId: clientExternal.externalCustomerId,
          orderItems,
          currency: order.currency as string,
          deliveryMethod: invoice.deliveryMethod,
          saveCard: true,
        });

        externalOrderIdForInvoice = createdProviderInvoice.externalOrderId;
        externalInvoiceUrlFromProvider = createdProviderInvoice.externalInvoiceUrl;
        providerInvoiceRawPayload = createdProviderInvoice.rawPayload;
        resolvedExternalInvoiceId = createdProviderInvoice.externalInvoiceId;
        knownExternalInvoiceIdBeforeResolution = resolvedExternalInvoiceId;
      }

      let hostedInvoiceUrl = firstNonEmptyString(null);
      if (!hostedInvoiceUrl && externalInvoiceUrlFromProvider) {
        hostedInvoiceUrl = externalInvoiceUrlFromProvider;
      }
      if (!hostedInvoiceUrl) {
        try {
          hostedInvoiceUrl = await providerBillingRepo.getInvoicePublicUrl({
            context,
            externalInvoiceId: resolvedExternalInvoiceId as string,
          });
        } catch (error) {
          debugLog("Invoice URL lookup skipped for invoice external create", {
            invoiceRecordId: invoice.recordId,
            externalInvoiceId: resolvedExternalInvoiceId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      const amountDue = invoice.amountDue ?? order.amountDue;
      if (amountDue == null) {
        throw new SyncEndpointError(
          "Missing Amount Due on Invoice and Order for Invoice External write.",
          422,
        );
      }

      const amountPaid = invoice.amountPaid ?? 0;
      const createRawPayload =
        providerInvoiceRawPayload ??
        JSON.stringify({
          source: "order_external_upstream",
          idempotencyKey: invoiceExternalIdempotencyKey,
          externalInvoiceId: resolvedExternalInvoiceId,
        });

      const createdInvoiceExternal = await invoicesRepo.createInvoiceExternal({
        Invoice: [invoice.recordId],
        Order: [request.orderRecordId],
        "Org Integration": [request.orgIntegrationRecordId],
        "External Invoice ID": resolvedExternalInvoiceId as string,
        ...(externalOrderIdForInvoice ? { "External Order ID": externalOrderIdForInvoice } : {}),
        "External Status": invoice.status ?? "Draft",
        "Amount Due": amountDue,
        "Amount Paid": amountPaid,
        "Amount Refunded": 0,
        ...(invoice.issuedAt ? { "Issued At": invoice.issuedAt } : {}),
        ...(invoice.dueAt ? { "Due At": invoice.dueAt } : {}),
        ...(invoice.paidAt ? { "Paid At": invoice.paidAt } : {}),
        ...(hostedInvoiceUrl ? { "Hosted Invoice URL": hostedInvoiceUrl } : {}),
        "External Process Action": "Create Invoice",
        "External Process Status": "Succeeded",
        "External Process At": new Date().toISOString(),
        "External Process Error": "",
        "External Action Idempotency Key": invoiceExternalIdempotencyKey,
        "External Process Raw Payload": createRawPayload,
        "Writeback Status": "Succeeded",
        "Writeback At": new Date().toISOString(),
        "Writeback Error": "",
        "Writeback Last Attempt At": new Date().toISOString(),
        "Reconciliation Status": "Complete",
        "Last Synced At": new Date().toISOString(),
        "Last Sync Activity At": new Date().toISOString(),
        "Last API Response Code": 200,
        "Last API Message": "Create Invoice processed",
        "Raw Payload": createRawPayload,
      });

      await ordersRepo.updateOrderExternal(request.orderExternalRecordId, {
        "Sync Status": "Synced",
        "Sync Error": "",
        "Last Synced At": new Date().toISOString(),
        "External Action": request.action,
        "External Process Status": "Succeeded",
        "External Process At": new Date().toISOString(),
        "External Process Error": "",
        "External Process Raw Payload": createRawPayload,
        "Customer ID Snapshot": clientExternal.externalCustomerId,
        "Amount Snapshot": amountDue,
        ...(externalOrderIdForInvoice ? { "External Order ID": externalOrderIdForInvoice } : {}),
        "External Invoice ID": resolvedExternalInvoiceId as string,
        ...(hostedInvoiceUrl ? { "External Invoice URL": hostedInvoiceUrl } : {}),
        "Raw Payload": createRawPayload,
        ...(writebackAction === "Skip Writeback"
          ? {
              "Writeback Status": "Not Started",
              "Reconciliation Status": "Needs Review",
            }
          : {
              "Writeback Status": "Succeeded",
              "Writeback At": new Date().toISOString(),
              "Writeback Error": "",
              "Reconciliation Status": "Complete",
            }),
        "Last Sync Activity At": new Date().toISOString(),
        "Last API Response Code": 200,
        "Last API Message": "Create Invoice processed",
      });
      if (hostedInvoiceUrl) {
        await invoicesRepo.updateInvoicePaymentLink(invoice.recordId, hostedInvoiceUrl);
      }
      await ordersRepo.updateOrderAmountPaid(request.orderRecordId, amountPaid);
      const createdInvoiceBillingStatus = deriveBillingStatusFromPayment({
        amountDue,
        amountPaid,
      });
      externalProcessSucceeded = true;
      authoritativeBillingStatusAfterExternal = createdInvoiceBillingStatus;
      await ordersRepo.updateOrderBillingStatus(request.orderRecordId, createdInvoiceBillingStatus);

      const cancellationResult = await cancelDuplicateProviderInvoicesForInvoice({
        invoiceRecordId: invoice.recordId,
        canonicalExternalInvoiceId: resolvedExternalInvoiceId as string,
        context,
      });

      console.info("Order billing processed", {
        operation: OPERATION,
        action: request.action,
        orderRecordId: request.orderRecordId,
        orderExternalRecordId: request.orderExternalRecordId,
        orgIntegrationRecordId: request.orgIntegrationRecordId,
        provider: context.provider,
        providerAccountId: context.providerAccountId,
        outcome: "success",
      });
      await markOutboundExternalActionSucceeded({
        recordId: outboundExternalActionRecordId,
        responsePayload: createRawPayload,
        providerReferenceId: resolvedExternalInvoiceId,
        writebackStatus: writebackAction === "Skip Writeback" ? "Not Started" : "Succeeded",
      });

      return successResponse(
        request.action,
        "processed",
        {
          externalOrderId: externalOrderIdForInvoice,
          externalInvoiceId: resolvedExternalInvoiceId,
        },
        {
          resolvedInvoiceRecordId,
          invoiceId: invoice.recordId,
          orderId: request.orderRecordId,
          invoiceExternalRecordId: createdInvoiceExternal.recordId,
          externalStatus: createdInvoiceExternal.externalStatus ?? invoice.status ?? "Draft",
          amountDue,
          amountPaid,
          issuedAt: invoice.issuedAt,
          dueAt: invoice.dueAt,
          hostedInvoiceUrl,
          wasExistingMappingReused: false,
          rawPayload: createRawPayload,
          canceledDuplicateExternalInvoiceIds: cancellationResult.canceledExternalInvoiceIds,
          skippedDuplicateInvoiceCancellations:
            cancellationResult.skippedDuplicateInvoiceCancellations,
          externalAction,
          writebackStatus: writebackAction === "Skip Writeback" ? "Skipped" : "Succeeded",
          reconciliationStatus:
            writebackAction === "Skip Writeback" ? "Needs Review" : "Complete",
        },
      );
    }

    throw new SyncEndpointError("Unsupported action.", 422);
  } catch (error) {
    const syncError = error instanceof Error ? error.message : "Unexpected server error.";
    const rawPayload = error instanceof SyncEndpointError ? error.rawPayload : undefined;
    const statusCode = error instanceof SyncEndpointError ? error.status : 500;

    try {
      const failureStage: "validation" | "provider" | "writeback" | "ambiguity" =
        externalProcessSucceeded
          ? "writeback"
          : statusCode === 409
            ? "ambiguity"
            : statusCode === 422
              ? "validation"
              : "provider";
      await markOutboundExternalActionFailed({
        recordId: outboundExternalActionRecordId,
        errorSummary: syncError,
        rawPayload,
        statusCode,
        attemptNumber: outboundExternalActionAttempt,
        stage: failureStage,
      });
    } catch (externalActionError) {
      console.error("Failed writing External Action failure state", {
        operation: OPERATION,
        orderExternalRecordId: request.orderExternalRecordId,
        error: externalActionError instanceof Error ? externalActionError.message : "Unknown external action error",
      });
    }

    try {
      await ordersRepo.writeOrderExternalFailure(
        request.orderExternalRecordId,
        request.action,
        syncError,
        rawPayload,
      );
      await ordersRepo.updateOrderExternal(request.orderExternalRecordId, {
        "External Process Status": "Failed",
        "External Process At": new Date().toISOString(),
        "External Process Error": syncError,
        ...(rawPayload ? { "External Process Raw Payload": rawPayload } : {}),
        "Writeback Status": "Failed",
        "Writeback At": new Date().toISOString(),
        "Writeback Error": syncError,
        "Writeback Last Attempt At": new Date().toISOString(),
        "Reconciliation Status": "Writeback Failed After External Success",
        "Last Sync Activity At": new Date().toISOString(),
        "Last API Response Code": statusCode,
        "Last API Message": syncError,
      });
    } catch (writebackError) {
      console.error("Failed writing Order External failure state", {
        operation: OPERATION,
        orderExternalRecordId: request.orderExternalRecordId,
        error:
          writebackError instanceof Error ? writebackError.message : "Unknown writeback error",
      });
    }

    if (orderRecordIdForFailure) {
      try {
        await ordersRepo.updateOrderBillingStatus(
          orderRecordIdForFailure,
          externalProcessSucceeded && authoritativeBillingStatusAfterExternal
            ? authoritativeBillingStatusAfterExternal
            : "Failed",
        );
      } catch (writebackError) {
        console.error("Failed writing Order billing failure state", {
          operation: OPERATION,
          orderRecordId: orderRecordIdForFailure,
          error:
            writebackError instanceof Error ? writebackError.message : "Unknown writeback error",
        });
      }
    }

    console.error("Order billing processor failed", {
      operation: OPERATION,
      action: request.action,
      orderRecordId: request.orderRecordId,
      orderExternalRecordId: request.orderExternalRecordId,
      orgIntegrationRecordId: request.orgIntegrationRecordId,
      error: syncError,
    });
    throw error;
  }
}

export async function runOrderBilling(body: unknown): Promise<BillingProcessSuccessResponse> {
  const parsed = parseProcessOrderBillingBody(body);
  return runOrderBillingProcessor(parsed);
}

export async function runResolvePromotionRedemptions(
  body: unknown,
): Promise<ResolvePromotionRedemptionsResponse> {
  const parsed = parseResolvePromotionRedemptionsBody(body);
  const order = await ordersRepo.getOrderResolveLifecycleRecord(parsed.recordId);

  if (order.status !== "Draft") {
    throw new SyncEndpointError("Order must be Draft to resolve promotion redemptions.", 422);
  }

  if (!parsed.force && order.promotionResolutionRequested !== true) {
    throw new SyncEndpointError(
      "Promotion Resolution Requested must be checked unless force is true.",
      422,
    );
  }

  const validOrderItemStatuses = new Set(["Draft", "Active", "Canceled", "Refunded"]);
  const validRedemptionStatuses = new Set(["Draft", "Applied", "Removed"]);

  const orderItems = await ordersRepo.listOrderItemsForPromotionResolution(parsed.recordId);
  const seenPromotionRedemptionParents = new Map<string, string>();
  let appliedCount = 0;
  let skippedCount = 0;

  for (const item of orderItems) {
    if (!item.status || !validOrderItemStatuses.has(item.status)) {
      throw new SyncEndpointError(
        `Order Item ${item.recordId} has invalid Status.`,
        409,
      );
    }

    const promotionRedemptions = await ordersRepo.listPromotionRedemptionsForOrderItem(item.recordId);

    for (const redemption of promotionRedemptions) {
      const existingParent = seenPromotionRedemptionParents.get(redemption.recordId);
      if (existingParent && existingParent !== item.recordId) {
        throw new SyncEndpointError(
          `Promotion Redemption ${redemption.recordId} is linked to multiple Order Items.`,
          409,
        );
      }
      seenPromotionRedemptionParents.set(redemption.recordId, item.recordId);

      if (!redemption.status || !validRedemptionStatuses.has(redemption.status)) {
        throw new SyncEndpointError(
          `Promotion Redemption ${redemption.recordId} has invalid Status.`,
          409,
        );
      }

      if (redemption.status !== "Draft") continue;

      if (redemption.readyToApply) {
        await ordersRepo.updatePromotionRedemptionStatus(redemption.recordId, "Applied");
        appliedCount += 1;
      } else {
        skippedCount += 1;
      }
    }
  }

  return {
    result: "success",
    appliedCount,
    skippedCount,
  };
}

export async function runOpenOrder(body: unknown): Promise<OpenOrderResponse> {
  const parsed = parseOpenOrderBody(body);
  console.log(`[OPEN_ORDER] Opening order: ${parsed.recordId}`);
  const order = await ordersRepo.getOrderOpenRecord(parsed.recordId);
  console.log(`[OPEN_ORDER] Order status: ${order.status}, readyToOpen: ${order.readyToOpen}, openingRequested: ${order.openingRequested}`);

  if (order.status === "Open") {
    console.log(`[OPEN_ORDER] Order already Open`);
    return {
      result: "success",
      activatedItemCount: 0,
      skippedItemCount: 0,
    };
  }

  if (order.status !== "Draft") {
    throw new SyncEndpointError("Order must be Draft to open.", 422);
  }

  if (!parsed.force && !order.readyToOpen && !order.openingRequested) {
    console.log(`[OPEN_ORDER] Rejecting: force=${parsed.force}, readyToOpen=${order.readyToOpen}, openingRequested=${order.openingRequested}`);
    throw new SyncEndpointError("Order is not Ready To Open.", 422);
  }
  console.log(`[OPEN_ORDER] Ready to proceed: force=${parsed.force}, readyToOpen=${order.readyToOpen}, openingRequested=${order.openingRequested}`);

  const validOrderItemStatuses = new Set(["Draft", "Active", "Canceled", "Refunded"]);
  const validRedemptionStatuses = new Set(["Draft", "Applied", "Removed"]);
  const orderItems = await ordersRepo.listOrderItemsForOpen(parsed.recordId);
  console.log(`[OPEN_ORDER] Found ${orderItems.length} order items`);

  for (const item of orderItems) {
    if (!item.status || !validOrderItemStatuses.has(item.status)) {
      throw new SyncEndpointError(`Order Item ${item.recordId} has invalid Status.`, 409);
    }

    const promotionRedemptions = await ordersRepo.listPromotionRedemptionsForOrderItem(item.recordId);
    let draftPromotionRedemptionCount = 0;

    for (const redemption of promotionRedemptions) {
      if (!redemption.status || !validRedemptionStatuses.has(redemption.status)) {
        throw new SyncEndpointError(
          `Promotion Redemption ${redemption.recordId} has invalid Status.`,
          409,
        );
      }
      if (redemption.status === "Draft") draftPromotionRedemptionCount += 1;
    }

    if (draftPromotionRedemptionCount > 0) {
      throw new SyncEndpointError(
        `Order Item ${item.recordId} has unresolved Draft Promotion Redemptions.`,
        422,
      );
    }
  }

  console.log(`[OPEN_ORDER] All validations passed, updating order status to Open`);
  await ordersRepo.updateOrderStatus(parsed.recordId, "Open");

  let activatedItemCount = 0;
  let skippedItemCount = 0;

  for (const item of orderItems) {
    console.log(`[OPEN_ORDER] Item ${item.recordId}: status=${item.status}, readyToActivate=${item.readyToActivate}`);
    if (item.status === "Draft" && item.readyToActivate) {
      console.log(`[OPEN_ORDER] Activating item ${item.recordId}`);
      await ordersRepo.updateOrderItemStatus(item.recordId, "Active");
      activatedItemCount += 1;
    } else {
      console.log(`[OPEN_ORDER] Skipping item ${item.recordId}`);
      skippedItemCount += 1;
    }
  }

  console.log(`[OPEN_ORDER] Complete: activated=${activatedItemCount}, skipped=${skippedItemCount}`);
  return {
    result: "success",
    activatedItemCount,
    skippedItemCount,
  };
}

function normalizeProviderInvoiceStatus(status: string | null): string {
  const normalized = (status ?? "").trim().toUpperCase();
  if (!normalized) return "Unknown";
  if (normalized === "DRAFT") return "Draft";
  if (normalized === "UNPAID" || normalized === "SCHEDULED" || normalized === "PUBLISHED") return "Sent";
  if (normalized === "PARTIALLY_PAID") return "Partially Paid";
  if (normalized === "PAID") return "Paid";
  if (normalized === "CANCELED") return "Canceled";
  return status ?? "Unknown";
}

function isSentLikeInvoiceStatus(status: string | null): boolean {
  const normalized = (status ?? "").trim().toUpperCase();
  return normalized === "UNPAID" || normalized === "PARTIALLY_PAID" || normalized === "PAID";
}

function hasUsablePayerPhone(phoneNumber: string | null): boolean {
  if (!phoneNumber) return false;
  const digits = phoneNumber.replace(/\D/g, "");
  return digits.length >= 10;
}

function hasUsablePayerEmail(emailAddress: string | null): boolean {
  if (!emailAddress) return false;
  const trimmed = emailAddress.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}

function isSquarePayerContactRequiredError(message: string): boolean {
  return message.toLowerCase().includes("payer email or phone number is required");
}

function buildDefaultSendInvoiceIdempotencyKey(input: {
  orderId: string;
  providerAccountId: string;
  orderedAt: string | null;
  modifiedAt: string | null;
}): string {
  const salt = input.modifiedAt ?? input.orderedAt ?? "na";
  return `order-send-invoice|${input.orderId}|${input.providerAccountId}|${salt}`;
}

function pickDeterministicOrgIntegration(input: {
  rows: Array<{
    recordId: string;
    provider: string | null;
    providerAccountId: string | null;
    accessToken: string | null;
    externalLocationId: string | null;
    status: string | null;
  }>;
  preferredProviderAccountId?: string | null;
}): string | null {
  let candidates = input.rows.filter((row) => (row.provider ?? "").trim().toLowerCase() === "square");

  if (input.preferredProviderAccountId) {
    const byAccount = candidates.filter(
      (row) => row.providerAccountId === input.preferredProviderAccountId,
    );
    if (byAccount.length > 0) candidates = byAccount;
  }

  const runnable = candidates.filter(
    (row) =>
      typeof row.accessToken === "string" &&
      row.accessToken.trim().length > 0 &&
      typeof row.externalLocationId === "string" &&
      row.externalLocationId.trim().length > 0,
  );
  if (runnable.length === 1) return runnable[0].recordId;
  if (runnable.length > 1) {
    const active = runnable.filter((row) => (row.status ?? "").trim().toLowerCase() === "active");
    if (active.length === 1) return active[0].recordId;
    return null;
  }

  if (candidates.length === 1) return candidates[0].recordId;
  return null;
}

function pickDeterministicClientExternal(input: {
  rows: Array<{
    recordId: string;
    providerAccountId: string | null;
    externalCustomerId: string | null;
    status: string | null;
    syncStatus: string | null;
    modifiedAt: string | null;
  }>;
  preferredProviderAccountId: string;
  customerIdSnapshot?: string | null;
}): string | null {
  const pickNewest = (
    rows: Array<{
      recordId: string;
      modifiedAt: string | null;
    }>,
  ): string | null => {
    if (rows.length === 0) return null;
    const sorted = [...rows].sort((a, b) => {
      const aTs = Date.parse(a.modifiedAt ?? "");
      const bTs = Date.parse(b.modifiedAt ?? "");
      const aRank = Number.isFinite(aTs) ? aTs : -1;
      const bRank = Number.isFinite(bTs) ? bTs : -1;
      if (aRank !== bRank) return bRank - aRank;
      return a.recordId.localeCompare(b.recordId);
    });
    return sorted[0]?.recordId ?? null;
  };

  const usable = input.rows.filter(
    (row) =>
      typeof row.externalCustomerId === "string" &&
      row.externalCustomerId.trim().length > 0 &&
      (row.syncStatus ?? "").trim().toLowerCase() !== "failed",
  );
  if (usable.length === 0) return null;

  const customerSnapshot = input.customerIdSnapshot?.trim();
  if (customerSnapshot) {
    const byCustomerSnapshot = usable.filter(
      (row) => (row.externalCustomerId ?? "").trim() === customerSnapshot,
    );
    if (byCustomerSnapshot.length === 1) return byCustomerSnapshot[0].recordId;
    if (byCustomerSnapshot.length > 1) {
      const preferredSnapshot = byCustomerSnapshot.filter(
        (row) => row.providerAccountId === input.preferredProviderAccountId,
      );
      if (preferredSnapshot.length === 1) return preferredSnapshot[0].recordId;
      const newestSnapshot = pickNewest(preferredSnapshot.length > 0 ? preferredSnapshot : byCustomerSnapshot);
      if (newestSnapshot) return newestSnapshot;
    }
  }

  const byProviderAccount = usable.filter(
    (row) => row.providerAccountId === input.preferredProviderAccountId,
  );
  if (byProviderAccount.length === 1) return byProviderAccount[0].recordId;
  if (byProviderAccount.length > 1) {
    const activeByProvider = byProviderAccount.filter((row) => {
      const status = (row.status ?? "").trim().toLowerCase();
      return status === "active" || status === "synced";
    });
    if (activeByProvider.length === 1) return activeByProvider[0].recordId;
    const newestByProvider = pickNewest(activeByProvider.length > 0 ? activeByProvider : byProviderAccount);
    if (newestByProvider) return newestByProvider;
  }

  if (usable.length === 1) return usable[0].recordId;

  const activeish = usable.filter((row) => {
    const status = (row.status ?? "").trim().toLowerCase();
    return status === "active" || status === "synced";
  });
  if (activeish.length === 1) return activeish[0].recordId;
  if (activeish.length > 1) {
    const newestActive = pickNewest(activeish);
    if (newestActive) return newestActive;
  }

  return pickNewest(usable);
}

function buildClientExternalResolutionDebug(input: {
  rows: Array<{
    recordId: string;
    providerAccountId: string | null;
    externalCustomerId: string | null;
    status: string | null;
    syncStatus: string | null;
    modifiedAt: string | null;
  }>;
  preferredProviderAccountId: string;
  customerIdSnapshot?: string | null;
}): string {
  if (input.rows.length === 0) return "no linked Client External records";

  const usable = input.rows.filter(
    (row) =>
      typeof row.externalCustomerId === "string" &&
      row.externalCustomerId.trim().length > 0 &&
      (row.syncStatus ?? "").trim().toLowerCase() !== "failed",
  );
  const byProvider = usable.filter((row) => row.providerAccountId === input.preferredProviderAccountId);
  const snapshot = input.customerIdSnapshot?.trim() ?? "";
  const bySnapshot = snapshot
    ? usable.filter((row) => (row.externalCustomerId ?? "").trim() === snapshot)
    : [];

  const parts = input.rows.map((row) => {
    const flags: string[] = [];
    if ((row.externalCustomerId ?? "").trim().length === 0) flags.push("missing-customer-id");
    if ((row.syncStatus ?? "").trim().toLowerCase() === "failed") flags.push("sync-failed");
    if (row.providerAccountId === input.preferredProviderAccountId) flags.push("provider-match");
    if (snapshot && (row.externalCustomerId ?? "").trim() === snapshot) flags.push("snapshot-match");
    if ((row.status ?? "").trim().toLowerCase() === "active") flags.push("active");
    if ((row.status ?? "").trim().toLowerCase() === "synced") flags.push("synced");
    return `${row.recordId}[${flags.join(",") || "no-flags"}]`;
  });

  return `candidates=${input.rows.length}; usable=${usable.length}; providerMatched=${byProvider.length}; snapshotMatched=${bySnapshot.length}; snapshot=${snapshot || "none"}; rows=${parts.join(" | ")}`;
}

class ApplyInvoicePaymentEndpointError extends SyncEndpointError {
  readonly stage: "validation" | "ambiguity" | "writeback";
  readonly recordId: string;
  readonly externalActionId?: string;

  constructor(input: {
    message: string;
    status: number;
    stage: "validation" | "ambiguity" | "writeback";
    recordId: string;
    externalActionId?: string;
  }) {
    super(input.message, input.status);
    this.stage = input.stage;
    this.recordId = input.recordId;
    this.externalActionId = input.externalActionId;
  }
}

export function applyInvoicePaymentFailureFromError(
  error: unknown,
  recordId: string | null,
): { status: number; body: ApplyInvoicePaymentFailureResponse } {
  if (error instanceof ApplyInvoicePaymentEndpointError) {
    return {
      status: error.status,
      body: {
        ok: false,
        endpoint: "/api/orders/apply-invoice-payment",
        recordId: error.recordId,
        crossedProviderBoundary: false,
        stage: error.stage,
        error: error.message,
        ...(error.externalActionId ? { externalActionId: error.externalActionId } : {}),
      },
    };
  }

  if (error instanceof SyncEndpointError) {
    return {
      status: error.status,
      body: {
        ok: false,
        endpoint: "/api/orders/apply-invoice-payment",
        recordId: recordId ?? "",
        crossedProviderBoundary: false,
        stage: "validation",
        error: error.message,
      },
    };
  }

  return {
    status: 500,
    body: {
      ok: false,
      endpoint: "/api/orders/apply-invoice-payment",
      recordId: recordId ?? "",
      crossedProviderBoundary: false,
      stage: "validation",
      error: error instanceof Error ? error.message : "Unexpected server error.",
    },
  };
}

type InvoicePaymentEvent = {
  provider: string;
  providerEventId: string;
  providerEventType: string;
  externalInvoiceId: string;
  externalPaymentId: string;
  amountPaidCents: number;
  paidAt: string;
  rawPayload: string;
};

function readObjectPath(value: unknown, path: string[]): unknown {
  let current: unknown = value;
  for (const segment of path) {
    if (typeof current !== "object" || current == null || Array.isArray(current)) return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function asTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asNonNegativeInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return Math.trunc(value);
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed) && parsed >= 0) return Math.trunc(parsed);
  }
  return null;
}

function parsePaidAt(value: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function parseInvoicePaymentEventFromRawPayload(rawPayload: string): InvoicePaymentEvent | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawPayload);
  } catch {
    return null;
  }

  const providerEventType = asTrimmedString(readObjectPath(parsed, ["type"])) ?? "invoice.payment_made";
  const providerEventId = asTrimmedString(readObjectPath(parsed, ["event_id"]));
  const externalInvoiceId =
    asTrimmedString(readObjectPath(parsed, ["data", "object", "payment", "invoice_id"])) ??
    asTrimmedString(readObjectPath(parsed, ["data", "object", "invoice", "id"]));
  const externalPaymentId =
    asTrimmedString(readObjectPath(parsed, ["data", "object", "payment", "id"])) ??
    asTrimmedString(readObjectPath(parsed, ["data", "object", "payment", "payment_id"]));
  const amountPaidCents =
    asNonNegativeInteger(readObjectPath(parsed, ["data", "object", "payment", "amount_money", "amount"])) ??
    asNonNegativeInteger(readObjectPath(parsed, ["data", "object", "payment", "paid_money", "amount"])) ??
    asNonNegativeInteger(readObjectPath(parsed, ["data", "object", "payment", "total_money", "amount"]));
  const paidAt =
    parsePaidAt(asTrimmedString(readObjectPath(parsed, ["data", "object", "payment", "updated_at"]))) ??
    parsePaidAt(asTrimmedString(readObjectPath(parsed, ["data", "object", "payment", "created_at"]))) ??
    parsePaidAt(asTrimmedString(readObjectPath(parsed, ["created_at"])));

  if (!providerEventId || !externalInvoiceId || !externalPaymentId || amountPaidCents == null || !paidAt) {
    return null;
  }

  return {
    provider: "Square",
    providerEventId,
    providerEventType,
    externalInvoiceId,
    externalPaymentId,
    amountPaidCents,
    paidAt,
    rawPayload,
  };
}

function buildApplyInvoicePaymentIdempotencyKey(input: {
  explicit?: string;
  provider: string;
  providerEventId: string;
  externalPaymentId: string;
}): string {
  if (input.explicit) return input.explicit;
  return `apply-invoice-payment|${input.provider}|${input.providerEventId || input.externalPaymentId}`;
}

function toCurrencyAmount(cents: number): number {
  return Math.round(cents) / 100;
}

function roundCurrencyAmount(amount: number): number {
  return Math.round(amount * 100) / 100;
}

function toInvoiceStatusSnapshot(providerEventType: string): string {
  if (providerEventType === "invoice.payment_made") return "Paid";
  return "Updated";
}

function toPaymentStatusSnapshot(): string {
  return "Succeeded";
}

function assertInvoicePathOrder(order: Awaited<ReturnType<typeof ordersRepo.getOrderSendInvoiceRecord>>): void {
  if (order.paymentCollectionMethod !== "Invoice Link") {
    throw new SyncEndpointError("Order must use Invoice Link collection path.", 422);
  }
}

function buildApplyInvoicePaymentSuccess(input: {
  recordId: string;
  providerResult: "succeeded" | "noop";
  externalActionId: string;
  writebackStatus: "Succeeded" | "Failed" | "Pending";
  idempotencyKey: string;
}): ApplyInvoicePaymentSuccessResponse {
  return {
    ok: true,
    endpoint: "/api/orders/apply-invoice-payment",
    recordId: input.recordId,
    crossedProviderBoundary: true,
    providerResult: input.providerResult,
    externalActionId: input.externalActionId,
    writebackStatus: input.writebackStatus,
    idempotencyKey: input.idempotencyKey,
  };
}

function resolveInvoicePaymentEventFromRequest(input: ApplyInvoicePaymentRequest): InvoicePaymentEvent | null {
  const raw = input.providerEvent;
  if (!raw) return null;

  const provider = (raw.provider ?? "Square").trim();
  const providerEventId = raw.providerEventId?.trim() ?? "";
  const providerEventType = raw.providerEventType?.trim() ?? "invoice.payment_made";
  const externalInvoiceId = raw.externalInvoiceId?.trim() ?? "";
  const externalPaymentId = raw.externalPaymentId?.trim() ?? "";
  const amountPaidCents = raw.amountPaidCents;
  const paidAt = parsePaidAt(raw.paidAt ?? null);
  const rawPayload = raw.rawPayload?.trim() ?? "";
  if (
    !provider ||
    !providerEventId ||
    !providerEventType ||
    !externalInvoiceId ||
    !externalPaymentId ||
    amountPaidCents == null ||
    amountPaidCents < 0 ||
    !paidAt
  ) {
    return null;
  }

  return {
    provider,
    providerEventId,
    providerEventType,
    externalInvoiceId,
    externalPaymentId,
    amountPaidCents,
    paidAt,
    rawPayload,
  };
}

export async function runApplyInvoicePayment(
  body: unknown,
): Promise<ApplyInvoicePaymentSuccessResponse> {
  const parsed = parseApplyInvoicePaymentBody(body);
  let externalActionId: string | null = null;
  const fail = (input: {
    message: string;
    status: number;
    stage: "validation" | "ambiguity" | "writeback";
  }): never => {
    throw new ApplyInvoicePaymentEndpointError({
      message: input.message,
      status: input.status,
      stage: input.stage,
      recordId: parsed.recordId,
      externalActionId: externalActionId ?? undefined,
    });
  };

  const nowIso = new Date().toISOString();
  const orderExternal = await ordersRepo.getOrderExternalRecord(parsed.recordId);
  if (!orderExternal.orderId) {
    fail({ message: "Order External is missing linked Order.", status: 409, stage: "ambiguity" });
  }
  const order = await ordersRepo.getOrderSendInvoiceRecord(orderExternal.orderId as string);
  assertInvoicePathOrder(order);

  let event = resolveInvoicePaymentEventFromRequest(parsed);
  let sourceInboundAction = await ordersRepo.findLatestInboundInvoicePaymentActionByOrderExternal(parsed.recordId);
  if (!event && sourceInboundAction?.rawProviderPayload) {
    const parsedFromRaw = parseInvoicePaymentEventFromRawPayload(sourceInboundAction.rawProviderPayload);
    if (parsedFromRaw) {
      event = {
        ...parsedFromRaw,
        providerEventId: sourceInboundAction.providerEventId ?? parsedFromRaw.providerEventId,
        providerEventType: sourceInboundAction.providerEventType ?? parsedFromRaw.providerEventType,
      };
    }
  }
  if (!event) {
    fail({
      message:
        "Missing invoice payment event payload. Provide providerEvent in request or ensure inbound External Action raw payload is present.",
      status: 422,
      stage: "validation",
    });
  }
  const resolvedEvent = event as InvoicePaymentEvent;
  if (resolvedEvent.providerEventType !== "invoice.payment_made") {
    fail({ message: "Unsupported provider event type for this endpoint.", status: 422, stage: "validation" });
  }
  if (resolvedEvent.amountPaidCents < 0) {
    fail({ message: "Payment amount must be non-negative.", status: 422, stage: "validation" });
  }
  if (orderExternal.externalInvoiceId && orderExternal.externalInvoiceId !== resolvedEvent.externalInvoiceId) {
    fail({
      message: "Invoice id mismatch between Order External and inbound payment event.",
      status: 409,
      stage: "ambiguity",
    });
  }

  const orgIntegrationId = orderExternal.orgIntegrationId;
  const orgIntegration = orgIntegrationId
    ? await providerContextRepo.getOrgIntegrationRecord(orgIntegrationId)
    : null;
  const providerAccountId =
    orderExternal.providerAccountId ??
    orgIntegration?.providerAccountId ??
    sourceInboundAction?.providerAccountId ??
    null;

  if (
    orgIntegration?.providerAccountId &&
    providerAccountId &&
    orgIntegration.providerAccountId !== providerAccountId
  ) {
    fail({
      message: "Order External and Org Integration provider account contexts conflict.",
      status: 409,
      stage: "ambiguity",
    });
  }

  const providerAccount = providerAccountId
    ? await ordersRepo.getProviderAccountRecord(providerAccountId)
    : null;
  const provider = (
    orgIntegration?.provider ??
    providerAccount?.provider ??
    resolvedEvent.provider
  ).trim();
  if (provider.toLowerCase() !== "square") {
    fail({ message: "Provider is not supported for apply-invoice-payment.", status: 422, stage: "validation" });
  }

  const idempotencyKey = buildApplyInvoicePaymentIdempotencyKey({
    explicit: parsed.idempotencyKey,
    provider: resolvedEvent.provider,
    providerEventId: resolvedEvent.providerEventId,
    externalPaymentId: resolvedEvent.externalPaymentId,
  });

  const existingByEvent = await findInboundExternalActionByIdentity({
    provider: resolvedEvent.provider,
    providerEventId: resolvedEvent.providerEventId,
    providerAccountRecordId: providerAccountId,
  });
  if (existingByEvent && existingByEvent.orderExternalId && existingByEvent.orderExternalId !== parsed.recordId) {
    fail({
      message: "Inbound payment event is already linked to a different Order External.",
      status: 409,
      stage: "ambiguity",
    });
  }

  if (existingByEvent?.recordId) {
    sourceInboundAction = await ordersRepo.getExternalActionRecord(existingByEvent.recordId);
    externalActionId = sourceInboundAction.recordId;
  } else if (sourceInboundAction?.providerEventId === resolvedEvent.providerEventId) {
    externalActionId = sourceInboundAction.recordId;
  }

  const existingByPayment = await ordersRepo.findInboundExternalActionByProviderReference(
    parsed.recordId,
    resolvedEvent.externalPaymentId,
  );
  if (
    !parsed.force &&
    existingByPayment &&
    existingByPayment.status === "Succeeded" &&
    existingByPayment.writebackStatus === "Succeeded"
  ) {
    return buildApplyInvoicePaymentSuccess({
      recordId: parsed.recordId,
      providerResult: "noop",
      externalActionId: existingByPayment.recordId,
      writebackStatus: "Succeeded",
      idempotencyKey,
    });
  }

  if (
    !parsed.force &&
    sourceInboundAction &&
    sourceInboundAction.status === "Succeeded" &&
    sourceInboundAction.writebackStatus === "Succeeded"
  ) {
    return buildApplyInvoicePaymentSuccess({
      recordId: parsed.recordId,
      providerResult: "noop",
      externalActionId: sourceInboundAction.recordId,
      writebackStatus: "Succeeded",
      idempotencyKey,
    });
  }

  if (!externalActionId) {
    externalActionId = await createExternalAction({
      externalEntityType: "Order",
      actionType: "Webhook",
      direction: "Inbound",
      triggerSource: "Webhook",
      occurredAt: resolvedEvent.paidAt,
      status: "Succeeded",
      attemptNumber: 1,
      retryable: false,
      provider: resolvedEvent.provider,
      providerEventType: resolvedEvent.providerEventType,
      providerEventId: resolvedEvent.providerEventId,
      providerReferenceId: resolvedEvent.externalPaymentId,
      requestPayload: JSON.stringify({
        recordId: parsed.recordId,
        force: parsed.force,
        idempotencyKey,
      }),
      rawProviderPayload: resolvedEvent.rawPayload,
      writebackStatus: "Pending",
      writebackLastAttemptAt: nowIso,
      orgIntegrationRecordId: orgIntegrationId ?? undefined,
      providerAccountRecordId: providerAccountId ?? undefined,
      orderExternalRecordId: parsed.recordId,
    });
  } else {
    await updateExternalAction(externalActionId, {
      externalEntityType: "Order",
      actionType: "Webhook",
      direction: "Inbound",
      triggerSource: "Webhook",
      occurredAt: resolvedEvent.paidAt,
      status: "Succeeded",
      retryable: false,
      provider: resolvedEvent.provider,
      providerEventType: resolvedEvent.providerEventType,
      providerEventId: resolvedEvent.providerEventId,
      providerReferenceId: resolvedEvent.externalPaymentId,
      rawProviderPayload: resolvedEvent.rawPayload,
      writebackStatus: "Pending",
      writebackError: "",
      writebackLastAttemptAt: nowIso,
      orgIntegrationRecordId: orgIntegrationId ?? undefined,
      providerAccountRecordId: providerAccountId ?? undefined,
      orderExternalRecordId: parsed.recordId,
    });
  }

  const currentAmountPaid = roundCurrencyAmount(order.amountPaid ?? 0);
  const paymentAmount = toCurrencyAmount(resolvedEvent.amountPaidCents);
  const nextAmountPaid = roundCurrencyAmount(currentAmountPaid + paymentAmount);
  const total = roundCurrencyAmount(order.total ?? 0);

  if (!parsed.force && total > 0 && nextAmountPaid > total + 0.0001) {
    fail({
      message: "Applying payment would exceed Order total.",
      status: 422,
      stage: "validation",
    });
  }

  const shouldMarkPaid = nextAmountPaid + 0.0001 >= total;
  const canonicalWrite = {
    orderRecordId: order.recordId,
    amountPaid: nextAmountPaid,
    ...(shouldMarkPaid
      ? {
          status: "Paid",
          billingState: "Paid",
          ...(order.paidAt ? {} : { paidAt: nowIso }),
        }
      : order.billingState === "Not Started" || order.billingState === "In Progress"
        ? { billingState: "Awaiting Payment" }
        : {}),
  };

  try {
    await ordersRepo.updateOrderExternal(parsed.recordId, {
      "External Invoice ID": resolvedEvent.externalInvoiceId,
      "External Payment ID": resolvedEvent.externalPaymentId,
      "External Payment Status Snapshot": toPaymentStatusSnapshot(),
      "External Invoice Status Snapshot": toInvoiceStatusSnapshot(resolvedEvent.providerEventType),
      "External Invoice Paid At Snapshot": resolvedEvent.paidAt,
      "Current External Status": "Paid",
      "Last Provider Activity At": resolvedEvent.paidAt,
      "Last Synced At": nowIso,
      "Sync Status": "Synced",
      "Sync Error": "",
      "Writeback Status": "Succeeded",
      "Writeback At": nowIso,
      "Writeback Error": "",
      "Raw Payload Snapshot": resolvedEvent.rawPayload,
    });

    await ordersRepo.updateOrderCanonicalPayment(canonicalWrite);

    await updateExternalAction(externalActionId, {
      status: "Succeeded",
      occurredAt: resolvedEvent.paidAt,
      providerReferenceId: resolvedEvent.externalPaymentId,
      providerEventId: resolvedEvent.providerEventId,
      providerEventType: resolvedEvent.providerEventType,
      rawProviderPayload: resolvedEvent.rawPayload,
      httpStatusCode: 200,
      errorSummary: "",
      writebackStatus: "Succeeded",
      writebackSucceededAt: nowIso,
      writebackLastAttemptAt: nowIso,
      writebackError: "",
    });

    return buildApplyInvoicePaymentSuccess({
      recordId: parsed.recordId,
      providerResult: "succeeded",
      externalActionId,
      writebackStatus: "Succeeded",
      idempotencyKey,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Writeback failed.";
    try {
      await ordersRepo.updateOrderExternal(parsed.recordId, {
        "Sync Status": "Failed",
        "Sync Error": message,
        "Writeback Status": "Failed",
        "Writeback At": nowIso,
        "Writeback Error": message,
      });
      await updateExternalAction(externalActionId, {
        status: "Succeeded",
        httpStatusCode: 502,
        errorSummary: message,
        writebackStatus: "Failed",
        writebackError: message,
        writebackLastAttemptAt: nowIso,
      });
    } catch {
      // Preserve original writeback failure.
    }
    fail({ message, status: error instanceof SyncEndpointError ? error.status : 502, stage: "writeback" });
  }

  throw new SyncEndpointError("Unexpected apply-invoice-payment control flow.", 500, { exposeMessage: false });
}

export async function runSendInvoice(body: unknown): Promise<SendInvoiceSuccessResponse> {
  const parsed = parseSendInvoiceBody(body);
  const nowIso = new Date().toISOString();

  const fail = (input: {
    message: string;
    status: number;
    stage: "validation" | "provider" | "writeback" | "ambiguity";
    crossedProviderBoundary?: boolean;
    externalActionId?: string;
  }): never => {
    throw new SendInvoiceEndpointError({
      message: input.message,
      status: input.status,
      stage: input.stage,
      recordId: parsed.recordId,
      crossedProviderBoundary: input.crossedProviderBoundary ?? false,
      externalActionId: input.externalActionId,
    });
  };

  const order = await ordersRepo.getOrderSendInvoiceRecord(parsed.recordId);
  if (order.status !== "Open") {
    fail({ message: "Order must be Open.", status: 422, stage: "validation" });
  }
  if (order.paymentCollectionMethod !== "Invoice Link") {
    fail({ message: "Order must use Invoice Link collection path.", status: 422, stage: "validation" });
  }
  if (!parsed.force && !order.readyForProviderAction) {
    fail({ message: "Order is not Ready For Provider Action.", status: 422, stage: "validation" });
  }
  if (!parsed.force && order.hasException) {
    fail({ message: "Order has exception flags and is not runnable.", status: 422, stage: "validation" });
  }
  if (order.billingState === "Paid") {
    fail({ message: "Order billing state is already Paid.", status: 422, stage: "validation" });
  }
  if (order.total != null && order.amountPaid != null && order.amountPaid >= order.total) {
    fail({ message: "Order is already fully paid.", status: 422, stage: "validation" });
  }
  if (!order.currency) {
    fail({ message: "Order is missing Currency.", status: 422, stage: "validation" });
  }
  let resolvedClientId = order.clientId;
  if (!resolvedClientId && order.clientProfileId) {
    resolvedClientId = await ordersRepo.getClientIdFromClientProfile(order.clientProfileId);
  }
  if (!resolvedClientId) {
    fail({ message: "Order is missing resolvable Client link.", status: 422, stage: "validation" });
  }
  if (!order.organizationId) {
    fail({ message: "Order is missing Organization link.", status: 422, stage: "validation" });
  }

  const orderItems = await ordersRepo.listOrderItems(order.recordId);
  if (orderItems.length === 0) {
    fail({ message: "Order has no Order Items to invoice.", status: 422, stage: "validation" });
  }

  const linkedOrderExternals = await ordersRepo.listOrderExternalsByOrder(order.recordId);
  if (linkedOrderExternals.length > 1) {
    fail({
      message: "Multiple Order Externals found for Order. Ambiguous current-state owner.",
      status: 409,
      stage: "ambiguity",
    });
  }

  let orderExternal = linkedOrderExternals[0] ?? null;

  const linkedOrgIntegrations = await providerContextRepo.listOrgIntegrationsLinkedToOrganization(
    order.organizationId as string,
  );
  const orgIntegrations =
    linkedOrgIntegrations.length > 0
      ? linkedOrgIntegrations
      : await providerContextRepo.listOrgIntegrationsByOrganization(order.organizationId as string);

  let orgIntegrationId = orderExternal?.orgIntegrationId ?? null;
  if (orgIntegrationId) {
    const matchesOrganization = orgIntegrations.some((row) => row.recordId === orgIntegrationId);
    if (!matchesOrganization) {
      orgIntegrationId = null;
    }
  }
  if (!orgIntegrationId) {
    const pickedOrgIntegrationId = pickDeterministicOrgIntegration({
      rows: orgIntegrations,
      preferredProviderAccountId: orderExternal?.providerAccountId ?? null,
    });
    if (!pickedOrgIntegrationId) {
      fail({
        message:
          "Unable to deterministically resolve Org Integration for this Order.",
        status: 409,
        stage: "ambiguity",
      });
    }
    orgIntegrationId = pickedOrgIntegrationId;
  }
  const orgIntegrationRecordId = orgIntegrationId as string;

  const orgIntegration = await providerContextRepo.getOrgIntegrationRecord(orgIntegrationRecordId);
  const providerAccountId = orgIntegration.providerAccountId;
  if (!providerAccountId) {
    fail({ message: "Provider Account context is missing.", status: 409, stage: "ambiguity" });
  }
  const providerAccountRecordId = providerAccountId as string;

  if (orgIntegration.providerAccountId && providerAccountId !== orgIntegration.providerAccountId) {
    fail({
      message: "Org Integration Provider Account does not match Order External provider account context.",
      status: 409,
      stage: "ambiguity",
    });
  }

  const providerAccount = await ordersRepo.getProviderAccountRecord(providerAccountRecordId);
  if (
    orgIntegration.provider &&
    providerAccount.provider &&
    orgIntegration.provider.toLowerCase() !== providerAccount.provider.toLowerCase()
  ) {
    fail({ message: "Provider mismatch between Org Integration and Provider Account.", status: 409, stage: "ambiguity" });
  }

  const resolvedProvider = orgIntegration.provider?.trim().toLowerCase();
  if (resolvedProvider !== "square") {
    fail({ message: "Provider is not supported for send-invoice.", status: 422, stage: "validation" });
  }

  if (!orderExternal) {
    orderExternal = await ordersRepo.createOrderExternal({
      Order: [order.recordId],
      "Org Integration": [orgIntegrationRecordId],
      "Global Provider Account": [providerAccountRecordId],
      "Sync Status": "Pending",
      "Writeback Status": "Pending",
    });
  } else {
    if (
      orderExternal.orgIntegrationId &&
      orderExternal.orgIntegrationId !== orgIntegrationRecordId
    ) {
      fail({
        message:
          "Order External Org Integration does not match Organization-resolved Org Integration.",
        status: 409,
        stage: "ambiguity",
      });
    }
    if (
      orderExternal.providerAccountId &&
      orderExternal.providerAccountId !== providerAccountRecordId
    ) {
      fail({
        message:
          "Order External Provider Account does not match Organization-resolved Org Integration Provider Account.",
        status: 409,
        stage: "ambiguity",
      });
    }
    if (!orderExternal.orgIntegrationId || !orderExternal.providerAccountId) {
      await ordersRepo.updateOrderExternal(orderExternal.recordId, {
        "Org Integration": [orgIntegrationRecordId],
        "Global Provider Account": [providerAccountRecordId],
      });
      orderExternal = {
        ...orderExternal,
        orgIntegrationId: orgIntegrationRecordId,
        providerAccountId: providerAccountRecordId,
      };
    }
  }

  const idempotencyKey =
    parsed.idempotencyKey ??
    buildDefaultSendInvoiceIdempotencyKey({
      orderId: order.recordId,
      providerAccountId: providerAccountRecordId,
      orderedAt: order.orderedAt,
      modifiedAt: order.modifiedAt,
    });

  let externalActionId: string | null = null;
  let providerResult: "succeeded" | "noop" | "ignored" = "succeeded";

  if (parsed.retryExternalActionId) {
    const retryAction = await ordersRepo.getExternalActionRecord(parsed.retryExternalActionId);
    if (retryAction.orderExternalId !== orderExternal.recordId) {
      fail({
        message: "retryExternalActionId does not belong to this Order External.",
        status: 409,
        stage: "ambiguity",
      });
    }
    if (retryAction.direction !== "Outbound") {
      fail({ message: "retryExternalActionId must be outbound.", status: 422, stage: "validation" });
    }
    if (retryAction.actionType !== "Send" && retryAction.actionType !== "Retry") {
      fail({ message: "retryExternalActionId must be a Send/Retry action.", status: 422, stage: "validation" });
    }
    if (retryAction.status !== "Failed" || !retryAction.retryable) {
      fail({ message: "retryExternalActionId is not retryable.", status: 422, stage: "validation" });
    }

    externalActionId = retryAction.recordId;
    await updateExternalAction(externalActionId, {
      actionType: "Send",
      status: "Pending",
      attemptNumber: retryAction.attemptNumber + 1,
      retryable: true,
      occurredAt: nowIso,
      writebackStatus: "Pending",
      writebackError: "",
      writebackLastAttemptAt: nowIso,
      errorSummary: "",
      requestPayload: JSON.stringify({
        recordId: order.recordId,
        force: parsed.force,
        retryExternalActionId: parsed.retryExternalActionId,
        idempotencyKey,
      }),
      orgIntegrationRecordId,
      providerAccountRecordId,
      orderExternalRecordId: orderExternal.recordId,
    });
  } else {
    const attemptNumber =
      parsed.externalActionAttemptNumber ??
      ((await countExternalActionsByOrderExternal(orderExternal.recordId)) + 1);
    externalActionId = await createExternalAction({
      externalEntityType: "Order",
      actionType: "Send",
      direction: "Outbound",
      triggerSource: "Automation",
      occurredAt: nowIso,
      status: "Pending",
      attemptNumber,
      retryable: true,
      provider: orgIntegration.provider ?? undefined,
      providerEventType: "Send Invoice",
      requestPayload: JSON.stringify({
        recordId: order.recordId,
        force: parsed.force,
        idempotencyKey,
      }),
      writebackStatus: "Pending",
      writebackLastAttemptAt: nowIso,
      orgIntegrationRecordId,
      providerAccountRecordId,
      orderExternalRecordId: orderExternal.recordId,
    });
  }

  const resolvedClientRecordId = resolvedClientId as string;
  let externalCustomerId = "";
  let resolvedClientExternal: Awaited<
    ReturnType<typeof ordersRepo.listClientExternalsByClient>
  >[number] | null = null;
  let providerOrderItems: Array<{ description: string | null; netAmount: number | null }> = [];
  try {
    let customerExternal: Awaited<
      ReturnType<typeof ordersRepo.listClientExternalsByClient>
    >[number] | null = null;

    if (orderExternal.clientExternalId) {
      const linkedClientExternal = await ordersRepo.getClientExternalRecord(orderExternal.clientExternalId);
      if (linkedClientExternal.providerAccountId !== providerAccountRecordId) {
        throw new SyncEndpointError(
          "Order External linked Client External is not in the same provider account context.",
          422,
        );
      }
      customerExternal = linkedClientExternal;
    }

    const customerIdSnapshot = orderExternal.customerIdSnapshot?.trim() ?? "";
    if (!customerExternal && customerIdSnapshot) {
      customerExternal = await ordersRepo.findClientExternalByProviderAndExternalCustomerId(
        providerAccountRecordId,
        customerIdSnapshot,
      );
    }

    if (!customerExternal) {
      const scopedClientExternals = await ordersRepo.listClientExternalsByContext(
        resolvedClientRecordId,
        providerAccountRecordId,
      );
      const allClientExternals =
        scopedClientExternals.length > 0
          ? scopedClientExternals
          : await ordersRepo.listClientExternalsByClient(resolvedClientRecordId);
      const pickedClientExternalId = pickDeterministicClientExternal({
        rows: allClientExternals,
        preferredProviderAccountId: providerAccountRecordId,
        customerIdSnapshot: orderExternal.customerIdSnapshot,
      });
      if (!pickedClientExternalId) {
        const debug = buildClientExternalResolutionDebug({
          rows: allClientExternals,
          preferredProviderAccountId: providerAccountRecordId,
          customerIdSnapshot: orderExternal.customerIdSnapshot,
        });
        throw new SyncEndpointError(
          `Unable to deterministically resolve Client External from Order -> Client -> Client External. ${debug}`,
          409,
        );
      }
      customerExternal = allClientExternals.find((row) => row.recordId === pickedClientExternalId) ?? null;
    }

    resolvedClientExternal = customerExternal ?? null;
    externalCustomerId = customerExternal?.externalCustomerId?.trim() ?? "";
    if (!externalCustomerId) {
      throw new SyncEndpointError("Resolved Client External is missing External Customer ID.", 422);
    }
    if (!orderExternal.clientExternalId && customerExternal?.recordId) {
      await ordersRepo.updateOrderExternal(orderExternal.recordId, {
        "Client External": [customerExternal.recordId],
      });
    }

    const detailedOrderItems: Array<{ description: string; baseAmount: number; discountLines: Array<{ name: string; amount: number }> }> = [];
    for (const item of orderItems) {
      const redemptions = await ordersRepo.listPromotionRedemptionsForOrderItem(item.recordId);
      const appliedRedemptions = redemptions.filter(
        (redemption) =>
          redemption.status === "Applied" &&
          typeof redemption.appliedDiscountContribution === "number" &&
          redemption.appliedDiscountContribution > 0,
      );
      const appliedDiscountTotal = appliedRedemptions.reduce(
        (sum, redemption) => sum + (redemption.appliedDiscountContribution ?? 0),
        0,
      );

      const subtotalValue = typeof item.lineSubtotal === "number" ? item.lineSubtotal : 0;
      const netValue = typeof item.netAmount === "number" ? item.netAmount : 0;
      // Prefer raw subtotal as the base line. Only recover from net when subtotal is missing.
      const baseAmount =
        subtotalValue > 0
          ? subtotalValue
          : appliedDiscountTotal > 0
            ? netValue + appliedDiscountTotal
            : netValue;
      if (baseAmount <= 0) continue;

      detailedOrderItems.push({
        description:
          typeof item.description === "string" && item.description.trim().length > 0
            ? item.description.trim()
            : "Order Item",
        baseAmount,
        discountLines: appliedRedemptions.map((redemption) => ({
          name:
            typeof redemption.promotionNameSnapshot === "string" &&
            redemption.promotionNameSnapshot.trim().length > 0
              ? redemption.promotionNameSnapshot.trim()
              : "Promotion",
          amount: redemption.appliedDiscountContribution as number,
        })),
      });
    }

    const positiveOrderItems = detailedOrderItems.map((item) => ({
      description: item.description,
      netAmount: item.baseAmount,
    }));

    const promotionDiscountLines = detailedOrderItems.flatMap((item) =>
      item.discountLines.map((discountLine) => ({
        description: `Promotion - ${discountLine.name}`,
        netAmount: -discountLine.amount,
      })),
    );

    const fallbackTotal =
      typeof order.balanceDue === "number" && order.balanceDue > 0
        ? order.balanceDue
        : typeof order.total === "number" && order.total > 0
          ? order.total
          : null;

    providerOrderItems =
      positiveOrderItems.length > 0
        ? [...positiveOrderItems, ...promotionDiscountLines]
        : fallbackTotal != null
          ? [{ description: "Order Total", netAmount: fallbackTotal }]
          : [];

    const invoiceTotal = providerOrderItems.reduce(
      (sum, item) => sum + (item.netAmount ?? 0),
      0,
    );
    if (invoiceTotal < 0.01 || invoiceTotal > 1_000_000) {
      throw new SyncEndpointError(
        "Order total for invoice must be between $0.01 and $1,000,000.00.",
        422,
      );
    }
  } catch (resolutionError) {
    const message =
      resolutionError instanceof Error
        ? resolutionError.message
        : "Failed resolving Client External.";
    const status =
      resolutionError instanceof SyncEndpointError ? resolutionError.status : 409;
    const classification = classifyRetryability({
      stage: status === 409 ? "ambiguity" : "validation",
      httpStatus: status,
      errorType: inferErrorType(message),
    });
    const failureNow = new Date().toISOString();
    try {
      await updateExternalAction(externalActionId as string, {
        status: "Failed",
        occurredAt: failureNow,
        httpStatusCode: status,
        errorSummary: message,
        retryable: classification.retryable,
        retryClassification: classification.classification,
        writebackStatus: "Succeeded",
        writebackSucceededAt: failureNow,
        writebackLastAttemptAt: failureNow,
      });
      await ordersRepo.updateOrderExternal(orderExternal.recordId, {
        "Sync Status": "Failed",
        "Sync Error": message,
        "Writeback Status": "Succeeded",
        "Writeback At": failureNow,
        "Writeback Error": "",
      });
    } catch {
      // preserve original failure
    }
    fail({
      message,
      status,
      stage: status === 409 ? "ambiguity" : "validation",
      crossedProviderBoundary: false,
      externalActionId: externalActionId ?? undefined,
    });
  }

  await ordersRepo.updateOrderExternal(orderExternal.recordId, {
    "Sync Status": "Pending",
    "Sync Error": "",
    "Writeback Status": "Pending",
    "Writeback Error": "",
    "Writeback Last Attempt At": nowIso,
  });

  const providerContext = providerContextRepo.resolveSquareProviderContext(orgIntegration, "Invoice");
  let providerPayload = "";

  try {
    let externalInvoiceId = orderExternal.externalInvoiceId;
    let externalOrderId = orderExternal.externalOrderId;
    let externalInvoiceUrl = orderExternal.externalInvoiceUrlSnapshot;
    let providerStatusRaw: string | null = null;
    let invoiceVersion: number | null = null;

    // Square publish requires payer contact on the linked customer.
    // Always preflight-sync customer identity from Client External to repair stale provider data.
    if (resolvedClientExternal) {
      const richClientExternal = await clientSyncRepo.loadClientExternal(
        resolvedClientExternal.recordId,
      );
      const canonicalJoinedName = [
        richClientExternal.clientCanonicalFirstName,
        richClientExternal.clientCanonicalLastName,
      ]
        .filter((part): part is string => Boolean(part))
        .join(" ")
        .trim();
      const effectiveNameSnapshot =
        resolvedClientExternal.nameSnapshot ??
        richClientExternal.nameSnapshot ??
        richClientExternal.clientCanonicalName ??
        (canonicalJoinedName || null);
      const effectivePhoneSnapshot =
        resolvedClientExternal.phoneSnapshot ??
        richClientExternal.phoneSnapshot ??
        richClientExternal.latestPhoneNormalized ??
        richClientExternal.clientCanonicalPhone ??
        resolvedClientExternal.matchPhoneNormalized;
      if (
        !resolvedClientExternal.nameSnapshot &&
        effectiveNameSnapshot &&
        resolvedClientExternal.recordId
      ) {
        await clientSyncRepo.persistClientExternalSnapshots(resolvedClientExternal.recordId, {
          "Name Snapshot": effectiveNameSnapshot,
          ...(effectivePhoneSnapshot ? { "Phone Snapshot": effectivePhoneSnapshot } : {}),
        });
      }
      const syncResult = await syncSquareCustomer(
        {
          recordReferenceId: resolvedClientExternal.recordId,
          externalCustomerId,
          canonicalFirstName: richClientExternal.clientCanonicalFirstName,
          canonicalLastName: richClientExternal.clientCanonicalLastName,
          nameSnapshot: effectiveNameSnapshot,
          phoneSnapshot: effectivePhoneSnapshot,
          matchPhoneNormalized: resolvedClientExternal.matchPhoneNormalized,
          emailSnapshot: resolvedClientExternal.emailSnapshot ?? richClientExternal.emailSnapshot,
        },
        providerContext,
      );
      externalCustomerId = syncResult.externalCustomerId;
    }
    const payerContact = await getSquareCustomerContactIdentity(externalCustomerId, providerContext);
    const hasUsableContact =
      hasUsablePayerEmail(payerContact.emailAddress) || hasUsablePayerPhone(payerContact.phoneNumber);
    if (!hasUsableContact) {
      throw new SyncEndpointError(
        "Square customer is missing payer email/phone. Add client email or phone and re-sync client external before sending invoice.",
        422,
      );
    }

    if (!externalInvoiceId) {
      const createdInvoice = await providerBillingRepo.createInvoiceFromOrderItems({
        context: providerContext,
        orderIdempotencyKey: `${idempotencyKey}:order`,
        invoiceIdempotencyKey: `${idempotencyKey}:invoice`,
        externalCustomerId,
        orderItems: providerOrderItems,
        currency: order.currency as string,
        deliveryMethod: "Link",
        saveCard: true,
      });
      providerPayload = createdInvoice.rawPayload;
      externalInvoiceId = createdInvoice.externalInvoiceId;
      externalOrderId = createdInvoice.externalOrderId ?? externalOrderId;
      externalInvoiceUrl = createdInvoice.externalInvoiceUrl ?? externalInvoiceUrl;
    }

    const details = await providerBillingRepo.getInvoiceDetails({
      context: providerContext,
      externalInvoiceId: externalInvoiceId as string,
    });
    providerStatusRaw = details.status;
    invoiceVersion = details.version;
    externalOrderId = details.externalOrderId ?? externalOrderId;
    externalInvoiceUrl = details.publicUrl ?? externalInvoiceUrl;

    if (invoiceVersion != null) {
      const settingsResult = await providerBillingRepo.updateInvoiceSettings({
        context: providerContext,
        externalInvoiceId: externalInvoiceId as string,
        version: invoiceVersion,
        deliveryMethod: "Link",
        saveCard: true,
        externalCustomerId,
      });
      providerPayload = settingsResult.rawPayload || providerPayload;
      providerStatusRaw = settingsResult.externalStatus ?? providerStatusRaw;
      externalInvoiceUrl = settingsResult.hostedInvoiceUrl ?? externalInvoiceUrl;
      invoiceVersion = settingsResult.version ?? invoiceVersion;
    }

    if (isSentLikeInvoiceStatus(providerStatusRaw) && !parsed.force) {
      providerResult = "noop";
    } else {
      if (invoiceVersion == null) {
        fail({
          message: "Provider returned invoice without publishable version.",
          status: 409,
          stage: "provider",
          crossedProviderBoundary: true,
          externalActionId: externalActionId ?? undefined,
        });
      }
      try {
        const published = await providerBillingRepo.publishInvoice({
          context: providerContext,
          externalInvoiceId: externalInvoiceId as string,
          version: invoiceVersion as number,
          idempotencyKey,
        });
        providerPayload = published.rawPayload || providerPayload;
        providerStatusRaw = published.externalStatus ?? providerStatusRaw;
        externalInvoiceUrl = published.hostedInvoiceUrl ?? externalInvoiceUrl;
        providerResult = "succeeded";
      } catch (publishError) {
        const publishMessage =
          publishError instanceof Error ? publishError.message : "Provider publish failed.";
        if (!isSquarePayerContactRequiredError(publishMessage)) {
          throw publishError;
        }

        const recreatedInvoice = await providerBillingRepo.createInvoiceFromOrderItems({
          context: providerContext,
          orderIdempotencyKey: `${idempotencyKey}:repair:order`,
          invoiceIdempotencyKey: `${idempotencyKey}:repair:invoice`,
          externalCustomerId,
          orderItems: providerOrderItems,
          currency: order.currency as string,
          deliveryMethod: "Link",
          saveCard: true,
        });
        providerPayload = recreatedInvoice.rawPayload || providerPayload;
        externalInvoiceId = recreatedInvoice.externalInvoiceId;
        externalOrderId = recreatedInvoice.externalOrderId ?? externalOrderId;
        externalInvoiceUrl = recreatedInvoice.externalInvoiceUrl ?? externalInvoiceUrl;

        const replacementDetails = await providerBillingRepo.getInvoiceDetails({
          context: providerContext,
          externalInvoiceId: externalInvoiceId as string,
        });
        providerStatusRaw = replacementDetails.status ?? providerStatusRaw;
        invoiceVersion = replacementDetails.version;
        externalOrderId = replacementDetails.externalOrderId ?? externalOrderId;
        externalInvoiceUrl = replacementDetails.publicUrl ?? externalInvoiceUrl;

        if (invoiceVersion == null) {
          throw new SyncEndpointError(
            "Provider returned replacement invoice without publishable version.",
            409,
          );
        }

        const replacementSettings = await providerBillingRepo.updateInvoiceSettings({
          context: providerContext,
          externalInvoiceId: externalInvoiceId as string,
          version: invoiceVersion,
          deliveryMethod: "Link",
          saveCard: true,
          externalCustomerId,
        });
        providerPayload = replacementSettings.rawPayload || providerPayload;
        providerStatusRaw = replacementSettings.externalStatus ?? providerStatusRaw;
        externalInvoiceUrl = replacementSettings.hostedInvoiceUrl ?? externalInvoiceUrl;
        invoiceVersion = replacementSettings.version ?? invoiceVersion;

        if (invoiceVersion == null) {
          throw new SyncEndpointError(
            "Provider returned replacement invoice without publishable version after settings update.",
            409,
          );
        }

        const republished = await providerBillingRepo.publishInvoice({
          context: providerContext,
          externalInvoiceId: externalInvoiceId as string,
          version: invoiceVersion,
          idempotencyKey: `${idempotencyKey}:repair`,
        });
        providerPayload = republished.rawPayload || providerPayload;
        providerStatusRaw = republished.externalStatus ?? providerStatusRaw;
        externalInvoiceUrl = republished.hostedInvoiceUrl ?? externalInvoiceUrl;
        providerResult = "succeeded";
      }
    }

    const normalizedStatus = normalizeProviderInvoiceStatus(providerStatusRaw);
    const writebackNow = new Date().toISOString();
    let writebackStatus: "Succeeded" | "Failed" | "Pending" = "Succeeded";

    try {
      await ordersRepo.updateOrderExternal(orderExternal.recordId, {
        "External Invoice ID": externalInvoiceId as string,
        ...(externalOrderId ? { "External Order ID": externalOrderId } : {}),
        "Current External Status": normalizedStatus,
        "External Invoice Status Snapshot": normalizedStatus,
        ...(externalInvoiceUrl ? { "External Invoice URL Snapshot": externalInvoiceUrl } : {}),
        ...(providerResult === "succeeded"
          ? { "External Invoice Sent At Snapshot": writebackNow }
          : {}),
        "Customer ID Snapshot": externalCustomerId,
        ...(order.total != null ? { "Amount Snapshot Cents": Math.round(order.total * 100) } : {}),
        ...(providerPayload ? { "Raw Payload Snapshot": providerPayload } : {}),
        "Last Provider Activity At": writebackNow,
        "Last Synced At": writebackNow,
        "Sync Status": "Synced",
        "Sync Error": "",
        "Writeback Status": "Succeeded",
        "Writeback At": writebackNow,
        "Writeback Error": "",
      });

      if (order.billingState === "Not Started" || order.billingState === "In Progress") {
        await ordersRepo.updateOrderBillingState(order.recordId, "Awaiting Payment");
      }

      await updateExternalAction(externalActionId as string, {
        status: "Succeeded",
        occurredAt: writebackNow,
        providerReferenceId: externalInvoiceId as string,
        responsePayload: providerPayload,
        httpStatusCode: 200,
        errorSummary: "",
        writebackStatus: "Succeeded",
        writebackSucceededAt: writebackNow,
        writebackLastAttemptAt: writebackNow,
        writebackError: "",
      });
    } catch (writebackError) {
      writebackStatus = "Failed";
      const message = writebackError instanceof Error ? writebackError.message : "Writeback failed.";
      const classification = classifyRetryability({
        stage: "writeback",
        httpStatus: 502,
        errorType: inferErrorType(message),
      });

      try {
        await updateExternalAction(externalActionId as string, {
          status: providerResult === "noop" ? "Ignored" : "Succeeded",
          occurredAt: writebackNow,
          providerReferenceId: externalInvoiceId as string,
          responsePayload: providerPayload,
          httpStatusCode: 502,
          errorSummary: message,
          retryable: classification.retryable,
          retryClassification: classification.classification,
          writebackStatus: "Failed",
          writebackError: message,
          writebackLastAttemptAt: writebackNow,
        });
      } catch {
        // preserve provider success result
      }
    }

    return {
      ok: true,
      endpoint: "/api/orders/send-invoice",
      recordId: order.recordId,
      crossedProviderBoundary: true,
      providerResult,
      externalActionId: externalActionId as string,
      writebackStatus,
      idempotencyKey,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Provider execution failed.";
    const status = error instanceof SyncEndpointError ? error.status : 502;
    const rawPayload = error instanceof SyncEndpointError ? error.rawPayload : undefined;
    const classification = classifyRetryability({
      stage: "provider",
      httpStatus: status,
      errorType: inferErrorType(message),
    });

    const failureNow = new Date().toISOString();
    try {
      if (externalActionId) {
        await updateExternalAction(externalActionId, {
          status: "Failed",
          occurredAt: failureNow,
          httpStatusCode: status,
          errorSummary: message,
          rawProviderPayload: rawPayload,
          retryable: classification.retryable,
          retryClassification: classification.classification,
          writebackStatus: "Succeeded",
          writebackSucceededAt: failureNow,
          writebackLastAttemptAt: failureNow,
        });
      }
      await ordersRepo.updateOrderExternal(orderExternal.recordId, {
        "Sync Status": "Failed",
        "Sync Error": message,
        "Last Provider Activity At": failureNow,
        "Writeback Status": "Succeeded",
        "Writeback At": failureNow,
        "Writeback Error": "",
      });
    } catch {
      // preserve provider failure response
    }

    fail({
      message,
      status,
      stage: "provider",
      crossedProviderBoundary: true,
      externalActionId: externalActionId ?? undefined,
    });
  }

  throw new SyncEndpointError("Unexpected send-invoice control flow.", 500, { exposeMessage: false });
}

export function assertAuthorizedOrderBillingRequest(request: Request): void {
  ordersWorkflowRepo.validateOrdersSecret(request);
}
