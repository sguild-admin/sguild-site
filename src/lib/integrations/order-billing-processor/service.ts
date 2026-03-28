import {
  findActiveCardExternalsByClientExternal,
  findClientExternalByContext,
  getOrderExternalRecord,
  getOrderRecord,
  getOrgIntegrationRecord,
  listOrderItems,
  OrderRecord,
  updateOrderBillingStatus,
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
import { chargeWithCardOnFile, createInvoiceFromOrderItems } from "./square";

const OPERATION = "process_order_billing";

export type OrderBillingRequest = {
  orderRecordId: string;
  orderExternalRecordId: string;
  orgIntegrationRecordId: string;
  action: BillingAction;
};

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

  if (action === "Invoice" && !order.currency) {
    throw new SyncEndpointError("Order missing Currency.", 422);
  }
}

function pickNewestUsableCard(cards: Array<{ externalCardId: string | null }>): string {
  const usable = cards.find((card) => typeof card.externalCardId === "string" && card.externalCardId.length > 0);
  if (!usable?.externalCardId) {
    throw new SyncEndpointError("Missing usable Card External with External Card ID.", 422);
  }
  return usable.externalCardId;
}

export async function runOrderBillingProcessor(
  request: OrderBillingRequest,
): Promise<BillingProcessSuccessResponse> {
  const orderExternal = await getOrderExternalRecord(request.orderExternalRecordId);
  const order = await getOrderRecord(request.orderRecordId);
  const orderRecordIdForFailure: string | null = order.recordId;

  try {
    if (orderExternal.orderId && orderExternal.orderId !== request.orderRecordId) {
      throw new SyncEndpointError("Order External is linked to a different Order.", 422);
    }

    assertActionMatchesOrderExternal(request.action, orderExternal.externalAction);

    if (request.action === "Authentication") {
      throw new SyncEndpointError("Authentication action is not supported.", 422);
    }

    if (isAlreadyProcessedNoOp({
      action: request.action,
      syncStatus: orderExternal.syncStatus,
      externalPaymentId: orderExternal.externalPaymentId,
      externalInvoiceId: orderExternal.externalInvoiceId,
      externalOrderId: orderExternal.externalOrderId,
    })) {
      return successResponse(request.action, "noop", {
        externalPaymentId: orderExternal.externalPaymentId,
        externalOrderId: orderExternal.externalOrderId,
        externalInvoiceId: orderExternal.externalInvoiceId,
      });
    }

    assertOrderBillingReady(order, request.action);

    const orgIntegration = await getOrgIntegrationRecord(request.orgIntegrationRecordId);
    const context = resolveProviderContext(orgIntegration, request.action);

    const clientExternal = await findClientExternalByContext(order.clientId as string, context.providerAccountId);
    if (!clientExternal) {
      throw new SyncEndpointError("Missing Client External for provider account context.", 422);
    }
    if (!clientExternal.externalCustomerId) {
      throw new SyncEndpointError("Missing External Customer ID.", 422);
    }

    if (request.action === "Charge") {
      const cardExternals = await findActiveCardExternalsByClientExternal(clientExternal.recordId);
      const externalCardId = pickNewestUsableCard(cardExternals);

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
        "External Payment ID": chargeResult.externalPaymentId,
        ...(chargeResult.externalOrderId ? { "External Order ID": chargeResult.externalOrderId } : {}),
        "Raw Payload": chargeResult.rawPayload,
      });
      await updateOrderBillingStatus(request.orderRecordId, "Paid");

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
      });
    }

    if (request.action === "Invoice") {
      const orderItems = await listOrderItems(request.orderRecordId);
      if (orderItems.length === 0) {
        throw new SyncEndpointError("Missing Order Items.", 422);
      }

      const invalidItem = orderItems.find(
        (item) => !item.description || item.netAmount == null || item.netAmount <= 0,
      );
      if (invalidItem) {
        throw new SyncEndpointError("Invalid Order Items for invoice creation.", 422);
      }

      const invoiceResult = await createInvoiceFromOrderItems({
        context,
        orderExternalRecordId: request.orderExternalRecordId,
        externalCustomerId: clientExternal.externalCustomerId,
        orderItems,
        currency: order.currency as string,
      });

      await updateOrderExternal(request.orderExternalRecordId, {
        "Sync Status": "Synced",
        "Sync Error": "",
        "Last Synced At": new Date().toISOString(),
        "External Action": request.action,
        "External Order ID": invoiceResult.externalOrderId,
        "External Invoice ID": invoiceResult.externalInvoiceId,
        "Raw Payload": invoiceResult.rawPayload,
      });
      await updateOrderBillingStatus(request.orderRecordId, "Payment Pending");

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
        externalOrderId: invoiceResult.externalOrderId,
        externalInvoiceId: invoiceResult.externalInvoiceId,
      });
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
        await updateOrderBillingStatus(orderRecordIdForFailure, "Failed");
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
