import {
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
  OrderRecord,
  updateOrderBillingStatus,
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
import { chargeWithCardOnFile, getInvoicePublicUrl } from "./square";

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
  action: BillingAction;
};

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

  if (action === "Invoice" && !order.currency) {
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

  try {
    if (orderExternal.orderId && orderExternal.orderId !== request.orderRecordId) {
      throw new SyncEndpointError("Order External is linked to a different Order.", 422);
    }

    assertActionMatchesOrderExternal(request.action, orderExternal.externalAction);

    if (request.action === "Authentication") {
      throw new SyncEndpointError("Authentication action is not supported.", 422);
    }

    const alreadyProcessed = isAlreadyProcessedNoOp({
      action: request.action,
      syncStatus: orderExternal.syncStatus,
      externalPaymentId: orderExternal.externalPaymentId,
      externalInvoiceId: orderExternal.externalInvoiceId,
      externalOrderId: orderExternal.externalOrderId,
    });

    if (alreadyProcessed && request.action === "Charge") {
      return successResponse(request.action, "noop", {
        externalPaymentId: orderExternal.externalPaymentId,
        externalOrderId: orderExternal.externalOrderId,
        externalInvoiceId: orderExternal.externalInvoiceId,
      });
    }

    if (alreadyProcessed && request.action === "Invoice") {
      if (
        orderExternal.externalInvoiceId &&
        !orderExternal.externalInvoiceUrl
      ) {
        try {
          const orgIntegration = await getOrgIntegrationRecord(request.orgIntegrationRecordId);
          const context = resolveProviderContext(orgIntegration, request.action);
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

    const orgIntegration = await getOrgIntegrationRecord(request.orgIntegrationRecordId);
    debugLog("Loaded org integration", {
      loaded: Boolean(orgIntegration),
      orgIntegrationRecordId: orgIntegration.recordId,
      provider: orgIntegration.provider,
      providerAccountId: orgIntegration.providerAccountId,
      hasExternalLocationId: Boolean(orgIntegration.externalLocationId),
      hasAccessToken: Boolean(orgIntegration.accessToken),
    });
    const context = resolveProviderContext(orgIntegration, request.action);
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

    if (request.action === "Charge") {
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
        "Customer ID Snapshot": clientExternal.externalCustomerId,
        "Card ID Snapshot": externalCardId,
        "Amount Snapshot": order.amountDue as number,
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
      const fallbackInvoiceFromOrder = !request.invoiceRecordId && !orderExternal.invoiceId
        ? await findSingleInvoiceByOrder(request.orderRecordId)
        : null;
      const resolvedInvoiceRecordId = firstNonEmptyString(
        request.invoiceRecordId,
        orderExternal.invoiceId,
        fallbackInvoiceFromOrder?.recordId,
      );
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
          "Customer ID Snapshot": clientExternal.externalCustomerId,
          ...(order.amountDue != null ? { "Amount Snapshot": order.amountDue } : {}),
          "External Invoice ID": knownExternalInvoiceId,
          ...(knownHostedInvoiceUrl ? { "External Invoice URL": knownHostedInvoiceUrl } : {}),
        });
        await updateOrderBillingStatus(request.orderRecordId, "Payment Pending");

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
          },
        );
      }

      const knownExternalInvoiceId = firstNonEmptyString(
        request.externalInvoiceId,
        orderExternal.externalInvoiceId,
      );
      if (!knownExternalInvoiceId) {
        throw new SyncEndpointError(
          "Missing externalInvoiceId. Invoice External write path will not create a provider invoice unless an explicit override flag is added.",
          422,
        );
      }

      let hostedInvoiceUrl = firstNonEmptyString(orderExternal.externalInvoiceUrl);
      if (!hostedInvoiceUrl) {
        try {
          hostedInvoiceUrl = await getInvoicePublicUrl({
            context,
            externalInvoiceId: knownExternalInvoiceId,
          });
        } catch (error) {
          debugLog("Invoice URL lookup skipped for invoice external create", {
            invoiceRecordId: invoice.recordId,
            externalInvoiceId: knownExternalInvoiceId,
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
      const createRawPayload = JSON.stringify({
        source: "order_external_upstream",
        idempotencyKey: invoiceExternalIdempotencyKey,
        externalInvoiceId: knownExternalInvoiceId,
      });

      const createdInvoiceExternal = await createInvoiceExternal({
        Invoice: [invoice.recordId],
        Order: [request.orderRecordId],
        "Org Integration": [request.orgIntegrationRecordId],
        "External Invoice ID": knownExternalInvoiceId,
        "External Status": invoice.status ?? "Pending",
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
        "Customer ID Snapshot": clientExternal.externalCustomerId,
        "Amount Snapshot": amountDue,
        ...(orderExternal.externalOrderId ? { "External Order ID": orderExternal.externalOrderId } : {}),
        "External Invoice ID": knownExternalInvoiceId,
        ...(hostedInvoiceUrl ? { "External Invoice URL": hostedInvoiceUrl } : {}),
        "Raw Payload": createRawPayload,
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

      return successResponse(
        request.action,
        "processed",
        {
          externalOrderId: orderExternal.externalOrderId,
          externalInvoiceId: knownExternalInvoiceId,
        },
        {
          resolvedInvoiceRecordId,
          invoiceId: invoice.recordId,
          orderId: request.orderRecordId,
          invoiceExternalRecordId: createdInvoiceExternal.recordId,
          externalStatus: createdInvoiceExternal.externalStatus ?? invoice.status ?? "Pending",
          amountDue,
          amountPaid,
          issuedAt: invoice.issuedAt,
          dueAt: invoice.dueAt,
          hostedInvoiceUrl,
          wasExistingMappingReused: false,
          rawPayload: createRawPayload,
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
