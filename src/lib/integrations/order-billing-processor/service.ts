import {
  createInvoiceForOrder,
  createInvoiceExternal,
  findActiveCardExternalsByClientExternal,
  findClientExternalByContext,
  findInvoiceExternalByInvoiceAndOrgIntegration,
  findSingleInvoiceByOrder,
  getClientExternalById,
  getInvoiceRecord,
  getOrderExternalRecord,
  getOrderRecord,
  getOrgIntegrationRecord,
  linkOrderExternalToInvoice,
  listOrderItems,
  listOrderExternalsByOrder,
  listOrderExternalsByInvoice,
  OrderRecord,
  updateOrderBillingStatus,
  updateOrderAmountPaid,
  updateInvoiceExternal,
  updateOrderExternal,
  writeOrderExternalFailure,
} from "./airtable";
import {
  BillingAction,
  BillingProcessSuccessResponse,
  successResponse,
  SyncEndpointError,
} from "./response";
import { resolveProviderContext } from "./provider-context";
import {
  cancelInvoice,
  chargeWithCardOnFile,
  createInvoiceFromOrderItems,
  createOrderFromOrderItems,
  getInvoiceDetails,
  getInvoicePublicUrl,
} from "./square";

const OPERATION = "process_order_billing";

function isDebugEnabled(): boolean {
  return process.env.ORDER_BILLING_DEBUG === "true" || process.env.NODE_ENV !== "production";
}

function debugLog(message: string, data?: Record<string, unknown>): void {
  if (!isDebugEnabled()) return;
  console.info(message, data ?? {});
}

export type OrderBillingRequest = {
  orderRecordId: string;
  orderExternalRecordId: string;
  orgIntegrationRecordId: string;
  invoiceRecordId?: string;
  externalInvoiceId?: string;
  writebackAction?: "Write Result" | "Skip Writeback";
  action: BillingAction;
};

type CanonicalExternalAction = "Create Order" | "Create Invoice" | "Charge" | "Refund" | "Cancel";
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

function assertActionMatchesOrderExternal(
  requestAction: BillingAction,
  externalAction: string | null,
): void {
  if (externalAction && externalAction !== requestAction) {
    throw new SyncEndpointError(
      `Order External action mismatch. Expected ${requestAction}, found ${externalAction}.`,
      422,
    );
  }
}

function isAlreadyProcessedNoOp(input: {
  action: BillingAction;
  syncStatus: string | null;
  externalPaymentId: string | null;
  externalInvoiceId: string | null;
  externalOrderId: string | null;
}): boolean {
  if (input.syncStatus?.toLowerCase() !== "synced") return false;
  if (input.action === "Charge") return Boolean(input.externalPaymentId || input.externalOrderId);
  if (input.action === "Invoice") return Boolean(input.externalInvoiceId || input.externalOrderId);
  return false;
}

function assertOrderBillingReady(order: OrderRecord, action: BillingAction): void {
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

async function cancelDuplicateSquareInvoicesForInvoice(input: {
  invoiceRecordId: string;
  canonicalExternalInvoiceId: string;
  context: Parameters<typeof getInvoiceDetails>[0]["context"];
}): Promise<{
  canceledExternalInvoiceIds: string[];
  skippedDuplicateInvoiceCancellations: Array<{ externalInvoiceId: string; reason: string }>;
}> {
  const rows = await listOrderExternalsByInvoice(input.invoiceRecordId);
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
      const details = await getInvoiceDetails({
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

      await cancelInvoice({
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

  const orderExternal = await getOrderExternalRecord(request.orderExternalRecordId);
  debugLog("Loaded order external", {
    loaded: Boolean(orderExternal),
    orderExternalRecordId: orderExternal.recordId,
    externalAction: orderExternal.externalAction,
    syncStatus: orderExternal.syncStatus,
  });
  const order = await getOrderRecord(request.orderRecordId);
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

  try {
    if (orderExternal.orderId && orderExternal.orderId !== request.orderRecordId) {
      throw new SyncEndpointError("Order External is linked to a different Order.", 422);
    }

    assertActionMatchesOrderExternal(request.action, orderExternal.externalAction);

    const externalAction = toCanonicalExternalAction(request.action);
    const writebackAction = request.writebackAction ?? "Write Result";
    const externalActionIdempotencyKey = buildExternalActionIdempotencyKey(
      externalAction,
      request.orderExternalRecordId,
    );

    await updateOrderExternal(request.orderExternalRecordId, {
      "External Process Status": "Pending",
      "External Process Action": externalAction,
      "External Action Idempotency Key": externalActionIdempotencyKey,
      "Writeback Status": writebackAction === "Skip Writeback" ? "Not Started" : "Pending",
      "Writeback Last Attempt At": new Date().toISOString(),
      "Reconciliation Status": "In Progress",
      "Last Sync Activity At": new Date().toISOString(),
      "External Process Error": "",
      "Writeback Error": "",
    });

    const alreadyProcessed = isAlreadyProcessedNoOp({
      action: request.action,
      syncStatus: orderExternal.syncStatus,
      externalPaymentId: orderExternal.externalPaymentId,
      externalInvoiceId: orderExternal.externalInvoiceId,
      externalOrderId: orderExternal.externalOrderId,
    });

    if (alreadyProcessed && externalAction === "Charge") {
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
      if (
        orderExternal.externalInvoiceId &&
        !orderExternal.externalInvoiceUrl
      ) {
        try {
          const orgIntegration = await getOrgIntegrationRecord(request.orgIntegrationRecordId);
          const context = resolveProviderContext(orgIntegration, "Invoice");
          const externalInvoiceUrl = await getInvoicePublicUrl({
            context,
            externalInvoiceId: orderExternal.externalInvoiceId,
          });
          if (externalInvoiceUrl) {
            await updateOrderExternal(request.orderExternalRecordId, {
              "External Invoice URL": externalInvoiceUrl,
            });
          }
        } catch (error) {
          debugLog("Invoice URL backfill skipped during noop", {
            orderExternalRecordId: request.orderExternalRecordId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    assertOrderBillingReady(order, request.action);

    if (
      externalAction === "Create Order" ||
      externalAction === "Create Invoice" ||
      externalAction === "Charge"
    ) {
      await updateOrderBillingStatus(request.orderRecordId, "Processing");
    }

    const orgIntegration = await getOrgIntegrationRecord(request.orgIntegrationRecordId);
    debugLog("Loaded org integration", {
      loaded: Boolean(orgIntegration),
      orgIntegrationRecordId: orgIntegration.recordId,
      provider: orgIntegration.provider,
      providerAccountId: orgIntegration.providerAccountId,
      hasExternalLocationId: Boolean(orgIntegration.externalLocationId),
      hasAccessToken: Boolean(orgIntegration.accessToken),
    });
    const context = resolveProviderContext(orgIntegration, "Invoice");
    debugLog("Resolved provider context", {
      provider: context.provider,
      providerAccountId: context.providerAccountId,
      accessTokenAlias: context.accessTokenAlias,
      externalLocationId: context.externalLocationId,
    });

    const clientExternal = orderExternal.clientExternalId
      ? await getClientExternalById(orderExternal.clientExternalId)
      : await findClientExternalByContext(order.clientId as string, context.providerAccountId);
    debugLog("Loaded client external", {
      loaded: Boolean(clientExternal),
      clientExternalRecordId: clientExternal?.recordId ?? null,
      providerAccountId: clientExternal?.providerAccountId ?? null,
      hasExternalCustomerId: Boolean(clientExternal?.externalCustomerId),
      activeCardCount: clientExternal?.activeCardCount ?? null,
      expectedProviderAccountId: context.providerAccountId,
      resolutionSource: orderExternal.clientExternalId ? "order_external_link" : "client_provider_lookup",
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
      const cardExternals = await findActiveCardExternalsByClientExternal(clientExternal.recordId);
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

      const chargeResult = await chargeWithCardOnFile({
        context,
        orderExternalRecordId: request.orderExternalRecordId,
        externalCustomerId: clientExternal.externalCustomerId,
        externalCardId,
        amountDue: order.amountDue as number,
        currency: order.currency as string,
      });

      await updateOrderExternal(request.orderExternalRecordId, {
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
        await updateOrderAmountPaid(request.orderRecordId, order.amountDue);
      }
      const chargeAmountPaid = order.amountDue ?? 0;
      const chargeBillingStatus = deriveBillingStatusFromPayment({
        amountDue: order.amountDue,
        amountPaid: chargeAmountPaid,
      });
      externalProcessSucceeded = true;
      authoritativeBillingStatusAfterExternal = chargeBillingStatus;
      await updateOrderBillingStatus(request.orderRecordId, chargeBillingStatus);

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
      const orderItems = await listOrderItems(request.orderRecordId);
      if (orderItems.length === 0) {
        throw new SyncEndpointError("Missing Order Items for Create Order.", 422);
      }

      const invalidItem = orderItems.find(
        (item) => !item.description || item.netAmount == null || item.netAmount <= 0,
      );
      if (invalidItem) {
        throw new SyncEndpointError("Invalid Order Items for Create Order.", 422);
      }

      const createOrderResult = await createOrderFromOrderItems({
        context,
        orderExternalRecordId: request.orderExternalRecordId,
        externalCustomerId: clientExternal.externalCustomerId,
        orderItems,
        currency: order.currency as string,
      });

      const relatedOrderExternals = await listOrderExternalsByOrder(request.orderRecordId);
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
      const recoveredExternalInvoiceUrl = invoiceRow?.externalInvoiceUrl ?? null;

      const recoveredAmountPaid =
        paymentRow?.amountSnapshot ?? invoiceRow?.amountSnapshot ?? order.amountPaid ?? 0;

      let reconciledInvoiceExternalRecordId: string | null = null;

      if (recoveredExternalInvoiceId) {
        let recoveredInvoiceRecordId = firstNonEmptyString(
          request.invoiceRecordId,
          orderExternal.invoiceId,
          invoiceRow?.invoiceId,
        );

        if (!recoveredInvoiceRecordId) {
          const existingInvoice = await findSingleInvoiceByOrder(request.orderRecordId);
          if (existingInvoice) {
            recoveredInvoiceRecordId = existingInvoice.recordId;
          }
        }

        if (!recoveredInvoiceRecordId) {
          const createdInvoice = await createInvoiceForOrder({
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
            await linkOrderExternalToInvoice(request.orderExternalRecordId, recoveredInvoiceRecordId);
          } catch (error) {
            debugLog("Order External invoice link backfill skipped in Create Order", {
              orderExternalRecordId: request.orderExternalRecordId,
              invoiceRecordId: recoveredInvoiceRecordId,
              error: error instanceof Error ? error.message : String(error),
            });
          }

          const existingInvoiceExternal = await findInvoiceExternalByInvoiceAndOrgIntegration(
            recoveredInvoiceRecordId,
            request.orgIntegrationRecordId,
          );

          if (existingInvoiceExternal) {
            await updateInvoiceExternal(existingInvoiceExternal.recordId, {
              "External Invoice ID": recoveredExternalInvoiceId,
              ...(recoveredExternalInvoiceUrl
                ? { "Hosted Invoice URL": recoveredExternalInvoiceUrl }
                : {}),
              "Amount Due": order.amountDue ?? 0,
              "Amount Paid": recoveredAmountPaid,
              "External Status": deriveBillingStatusFromPayment({
                amountDue: order.amountDue,
                amountPaid: recoveredAmountPaid,
              }) === "Paid"
                ? "Paid"
                : "Draft",
              "Last Synced At": new Date().toISOString(),
              "Sync Status": "Synced",
              "Sync Error": "",
            });
            reconciledInvoiceExternalRecordId = existingInvoiceExternal.recordId;
          } else {
            const createdInvoiceExternal = await createInvoiceExternal({
              Invoice: [recoveredInvoiceRecordId],
              Order: [request.orderRecordId],
              "Org Integration": [request.orgIntegrationRecordId],
              "External Invoice ID": recoveredExternalInvoiceId,
              ...(recoveredExternalInvoiceUrl
                ? { "Hosted Invoice URL": recoveredExternalInvoiceUrl }
                : {}),
              "Amount Due": order.amountDue ?? 0,
              "Amount Paid": recoveredAmountPaid,
              "External Status": deriveBillingStatusFromPayment({
                amountDue: order.amountDue,
                amountPaid: recoveredAmountPaid,
              }) === "Paid"
                ? "Paid"
                : "Draft",
              "Last Synced At": new Date().toISOString(),
              "Sync Status": "Synced",
              "Sync Error": "",
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

      await updateOrderExternal(request.orderExternalRecordId, {
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

      await updateOrderAmountPaid(request.orderRecordId, createOrderAmountPaid);
      externalProcessSucceeded = true;
      authoritativeBillingStatusAfterExternal = createOrderBillingStatus;
      await updateOrderBillingStatus(request.orderRecordId, createOrderBillingStatus);

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
      const fallbackInvoiceFromOrder = !request.invoiceRecordId && !orderExternal.invoiceId
        ? await findSingleInvoiceByOrder(request.orderRecordId)
        : null;
      let resolvedInvoiceRecordId = firstNonEmptyString(
        request.invoiceRecordId,
        orderExternal.invoiceId,
        fallbackInvoiceFromOrder?.recordId,
      );

      let knownExternalInvoiceIdBeforeResolution = firstNonEmptyString(
        request.externalInvoiceId,
        orderExternal.externalInvoiceId,
      );

      if (!resolvedInvoiceRecordId) {
        const createdInvoice = await createInvoiceForOrder({
          Order: [request.orderRecordId],
          Status: "Draft",
          ...(order.amountDue != null ? { "Amount Due": order.amountDue } : {}),
          "Amount Paid": 0,
          "Issued At": new Date().toISOString(),
        });
        resolvedInvoiceRecordId = createdInvoice.recordId;

        try {
          await linkOrderExternalToInvoice(request.orderExternalRecordId, createdInvoice.recordId);
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
          : orderExternal.invoiceId
            ? "order_external_invoice_link"
            : fallbackInvoiceFromOrder
              ? "order_link_lookup"
              : "none",
      });

      const invoice = await getInvoiceRecord(resolvedInvoiceRecordId);
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

      const existingInvoiceExternal = await findInvoiceExternalByInvoiceAndOrgIntegration(
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
          orderExternal.externalInvoiceUrl,
        );
        const staleUpdate: Record<string, string> = {};

        if (!existingInvoiceExternal.hostedInvoiceUrl && knownHostedInvoiceUrl) {
          staleUpdate["Hosted Invoice URL"] = knownHostedInvoiceUrl;
        }
        if (existingInvoiceExternal.syncStatus?.toLowerCase() !== "synced") {
          staleUpdate["Sync Status"] = "Synced";
        }
        if (existingInvoiceExternal.syncError) {
          staleUpdate["Sync Error"] = "";
        }
        staleUpdate["Last Synced At"] = new Date().toISOString();

        if (Object.keys(staleUpdate).length > 0) {
          await updateInvoiceExternal(existingInvoiceExternal.recordId, staleUpdate);
        }

        await updateOrderExternal(request.orderExternalRecordId, {
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
        const paidAmount = invoice.amountPaid ?? 0;
        const invoiceBillingStatus = deriveBillingStatusFromPayment({
          amountDue: invoice.amountDue ?? order.amountDue,
          amountPaid: paidAmount,
        });
        externalProcessSucceeded = true;
        authoritativeBillingStatusAfterExternal = invoiceBillingStatus;
        await updateOrderAmountPaid(request.orderRecordId, paidAmount);
        await updateOrderBillingStatus(request.orderRecordId, invoiceBillingStatus);

        const cancellationResult = await cancelDuplicateSquareInvoicesForInvoice({
          invoiceRecordId: invoice.recordId,
          canonicalExternalInvoiceId: knownExternalInvoiceId,
          context,
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
        const orderItems = await listOrderItems(request.orderRecordId);
        if (orderItems.length === 0) {
          throw new SyncEndpointError("Missing Order Items for Create Invoice.", 422);
        }

        const invalidItem = orderItems.find(
          (item) => !item.description || item.netAmount == null || item.netAmount <= 0,
        );
        if (invalidItem) {
          throw new SyncEndpointError("Invalid Order Items for Create Invoice.", 422);
        }

        const createdProviderInvoice = await createInvoiceFromOrderItems({
          context,
          orderExternalRecordId: request.orderExternalRecordId,
          externalCustomerId: clientExternal.externalCustomerId,
          orderItems,
          currency: order.currency as string,
        });

        externalOrderIdForInvoice = createdProviderInvoice.externalOrderId;
        externalInvoiceUrlFromProvider = createdProviderInvoice.externalInvoiceUrl;
        providerInvoiceRawPayload = createdProviderInvoice.rawPayload;
        resolvedExternalInvoiceId = createdProviderInvoice.externalInvoiceId;
        knownExternalInvoiceIdBeforeResolution = resolvedExternalInvoiceId;
      }

      let hostedInvoiceUrl = firstNonEmptyString(orderExternal.externalInvoiceUrl);
      if (!hostedInvoiceUrl && externalInvoiceUrlFromProvider) {
        hostedInvoiceUrl = externalInvoiceUrlFromProvider;
      }
      if (!hostedInvoiceUrl) {
        try {
          hostedInvoiceUrl = await getInvoicePublicUrl({
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

      const createdInvoiceExternal = await createInvoiceExternal({
        Invoice: [invoice.recordId],
        Order: [request.orderRecordId],
        "Org Integration": [request.orgIntegrationRecordId],
        "External Invoice ID": resolvedExternalInvoiceId as string,
        "External Status": invoice.status ?? "Draft",
        "Amount Due": amountDue,
        "Amount Paid": amountPaid,
        ...(invoice.issuedAt ? { "Issued At": invoice.issuedAt } : {}),
        ...(invoice.dueAt ? { "Due At": invoice.dueAt } : {}),
        ...(invoice.paidAt ? { "Paid At": invoice.paidAt } : {}),
        ...(hostedInvoiceUrl ? { "Hosted Invoice URL": hostedInvoiceUrl } : {}),
        "Last Synced At": new Date().toISOString(),
        "Raw Payload": createRawPayload,
        "Sync Status": "Synced",
        "Sync Error": "",
      });

      await updateOrderExternal(request.orderExternalRecordId, {
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
      await updateOrderAmountPaid(request.orderRecordId, amountPaid);
      const createdInvoiceBillingStatus = deriveBillingStatusFromPayment({
        amountDue,
        amountPaid,
      });
      externalProcessSucceeded = true;
      authoritativeBillingStatusAfterExternal = createdInvoiceBillingStatus;
      await updateOrderBillingStatus(request.orderRecordId, createdInvoiceBillingStatus);

      const cancellationResult = await cancelDuplicateSquareInvoicesForInvoice({
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

    try {
      await writeOrderExternalFailure(
        request.orderExternalRecordId,
        request.action,
        syncError,
        rawPayload,
      );
      await updateOrderExternal(request.orderExternalRecordId, {
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
        "Last API Response Code": error instanceof SyncEndpointError ? error.status : 500,
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
        await updateOrderBillingStatus(
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
