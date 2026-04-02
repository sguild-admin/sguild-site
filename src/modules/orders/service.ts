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
  updateExternalAction,
} from "@/modules/integrations";
import type { BillingAction } from "@/lib/types/billing";
import type {
  BillingProcessExternalIds,
  BillingProcessErrorResponse,
  BillingProcessMetadata,
  BillingProcessResult,
  BillingProcessSuccessResponse,
  OrderBillingRequest,
} from "./dto";
import { parseProcessOrderBillingBody } from "./schema";

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
}) {
  if (!input.recordId) return;
  await updateExternalAction(input.recordId, {
    status: "Failed",
    occurredAt: new Date().toISOString(),
    errorSummary: input.errorSummary,
    rawProviderPayload: input.rawPayload,
    httpStatusCode: input.statusCode,
    retryable: true,
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
      await markOutboundExternalActionFailed({
        recordId: outboundExternalActionRecordId,
        errorSummary: syncError,
        rawPayload,
        statusCode,
        attemptNumber: outboundExternalActionAttempt,
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

export function assertAuthorizedOrderBillingRequest(request: Request): void {
  ordersWorkflowRepo.validateOrdersSecret(request);
}


