import { SyncEndpointError } from "@/lib/errors";
import {
  countExternalActionsByInvoiceExternal,
  createExternalAction,
  getBillingProviderContext,
  updateExternalAction,
} from "@/modules/integrations";
import { classifyRetryability, inferErrorType } from "@/modules/external-actions";
import { invoicesRepo } from "./repo";
import type {
  InvoiceReconcileResultDto,
  ReconcileInvoiceExternalsResponseDto,
  SendInvoiceResponseDto,
} from "./dto";
import {
  coerceDeliveryMethod,
  defaultSendIdempotencyKey,
  mapProviderInvoiceStatusToExternal,
  parseReconcileBody,
  parseSendInvoiceBody,
  pickCanonicalExternalInvoiceId,
} from "./schema";

async function reconcileOneInvoice(input: {
  invoiceId: string;
  orderRecordId: string;
  orgIntegrationRecordId: string;
  dryRun: boolean;
}): Promise<InvoiceReconcileResultDto> {
  const result: InvoiceReconcileResultDto = {
    invoiceId: input.invoiceId,
    canonicalExternalInvoiceId: null,
    createdInvoiceExternalRecordId: null,
    reusedInvoiceExternalRecordId: null,
    canceledExternalInvoiceIds: [],
    skippedCancelExternalInvoiceIds: [],
    errors: [],
  };

  const context = await getBillingProviderContext({
    orgIntegrationRecordId: input.orgIntegrationRecordId,
    action: "Invoice",
  });

  const invoiceExternal = await invoicesRepo.findInvoiceExternalByInvoiceAndOrgIntegration(
    input.invoiceId,
    input.orgIntegrationRecordId,
  );
  if (invoiceExternal) {
    result.reusedInvoiceExternalRecordId = invoiceExternal.recordId;
  }

  const linkedOrderExternals = await invoicesRepo.listOrderExternalsByInvoice(input.invoiceId);
  const candidateExternalInvoiceIds = linkedOrderExternals
    .map((row) => row.externalInvoiceId)
    .filter((value): value is string => typeof value === "string" && value.length > 0);

  const canonicalPick = pickCanonicalExternalInvoiceId({
    fromInvoiceExternal: invoiceExternal?.externalInvoiceId ?? null,
    fromOrderExternals: candidateExternalInvoiceIds,
  });

  if (!canonicalPick.externalInvoiceId) {
    result.errors.push(canonicalPick.error ?? "Unable to determine canonical external invoice ID.");
    return result;
  }

  result.canonicalExternalInvoiceId = canonicalPick.externalInvoiceId;

  const canonicalDetails = await invoicesRepo.getInvoiceDetails({
    context,
    externalInvoiceId: canonicalPick.externalInvoiceId,
  });

  const hostedInvoiceUrl = canonicalDetails.publicUrl ?? (await invoicesRepo.getInvoicePublicUrl({
    context,
    externalInvoiceId: canonicalPick.externalInvoiceId,
  }));

  if (!invoiceExternal) {
    if (!input.dryRun) {
      const created = await invoicesRepo.createInvoiceExternal({
        Invoice: [input.invoiceId],
        Order: [input.orderRecordId],
        "Org Integration": [input.orgIntegrationRecordId],
        "External Invoice ID": canonicalPick.externalInvoiceId,
        "External Status": canonicalDetails.status ?? "UNKNOWN",
        "Amount Due": 0,
        "Amount Paid": 0,
        ...(hostedInvoiceUrl ? { "Hosted Invoice URL": hostedInvoiceUrl } : {}),
        "Last Synced At": new Date().toISOString(),
        "Raw Payload": canonicalDetails.rawPayload,
        "Sync Status": "Synced",
        "Sync Error": "",
      });
      result.createdInvoiceExternalRecordId = created.recordId;
    }
  } else if (!input.dryRun) {
    await invoicesRepo.updateInvoiceExternal(invoiceExternal.recordId, {
      "External Invoice ID": canonicalPick.externalInvoiceId,
      "External Status": canonicalDetails.status ?? invoiceExternal.externalStatus ?? "UNKNOWN",
      ...(hostedInvoiceUrl ? { "Hosted Invoice URL": hostedInvoiceUrl } : {}),
      "Last Synced At": new Date().toISOString(),
      "Raw Payload": canonicalDetails.rawPayload,
      "Sync Status": "Synced",
      "Sync Error": "",
    });
  }

  const uniqueCandidates = [...new Set(candidateExternalInvoiceIds)];
  const extras = uniqueCandidates.filter((id) => id !== canonicalPick.externalInvoiceId);

  for (const extraExternalInvoiceId of extras) {
    try {
      const details = await invoicesRepo.getInvoiceDetails({
        context,
        externalInvoiceId: extraExternalInvoiceId,
      });
      const status = (details.status ?? "").toUpperCase();

      if (status === "CANCELED") {
        result.skippedCancelExternalInvoiceIds.push({
          externalInvoiceId: extraExternalInvoiceId,
          reason: "Already canceled",
        });
        continue;
      }

      if (status === "PAID") {
        result.skippedCancelExternalInvoiceIds.push({
          externalInvoiceId: extraExternalInvoiceId,
          reason: "Already paid; cannot auto-cancel safely",
        });
        continue;
      }

      if (input.dryRun) {
        result.skippedCancelExternalInvoiceIds.push({
          externalInvoiceId: extraExternalInvoiceId,
          reason: "dryRun=true",
        });
        continue;
      }

      if (details.version == null) {
        result.skippedCancelExternalInvoiceIds.push({
          externalInvoiceId: extraExternalInvoiceId,
          reason: "Missing Square invoice version for cancel",
        });
        continue;
      }

      await invoicesRepo.cancelInvoice({
        context,
        externalInvoiceId: extraExternalInvoiceId,
        version: details.version,
      });
      result.canceledExternalInvoiceIds.push(extraExternalInvoiceId);
    } catch (error) {
      result.errors.push(
        `Failed processing extra external invoice ${extraExternalInvoiceId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  return result;
}

export async function sendInvoice(body: unknown): Promise<SendInvoiceResponseDto> {
  const parsed = parseSendInvoiceBody(body);

  const [invoice] = await Promise.all([
    invoicesRepo.getInvoiceRecord(parsed.invoiceRecordId),
  ]);

  const resolvedOrderRecordId = parsed.orderRecordId ?? invoice.orderId ?? null;
  if (!resolvedOrderRecordId) {
    throw new SyncEndpointError("Missing orderRecordId and Invoice is not linked to an Order.", 422);
  }

  if (parsed.orderRecordId && invoice.orderId && invoice.orderId !== parsed.orderRecordId) {
    throw new SyncEndpointError("Invoice is not linked to the provided Order.", 422);
  }

  const order = await invoicesRepo.getOrderRecord(resolvedOrderRecordId);
  if (!order.recordId) {
    throw new SyncEndpointError("Order not found.", 404);
  }

  const context = await getBillingProviderContext({
    orgIntegrationRecordId: parsed.orgIntegrationRecordId,
    action: "Invoice",
  });

  let invoiceExternal = parsed.invoiceExternalRecordId
    ? await invoicesRepo.getInvoiceExternalById(parsed.invoiceExternalRecordId)
    : await invoicesRepo.findInvoiceExternalByInvoiceAndOrgIntegration(
        parsed.invoiceRecordId,
        parsed.orgIntegrationRecordId,
      );

  const deliveryMethod =
    parsed.deliveryMethod ??
    coerceDeliveryMethod(invoiceExternal?.deliveryMethod) ??
    coerceDeliveryMethod(invoice.deliveryMethod) ??
    "Link";
  const saveCard = parsed.saveCard ?? invoiceExternal?.saveCard ?? invoice.saveCard ?? true;
  const phoneSnapshot = parsed.phoneSnapshot ?? invoiceExternal?.phoneSnapshot ?? undefined;

  let externalInvoiceId = parsed.externalInvoiceId ?? invoiceExternal?.externalInvoiceId ?? null;

  if (!externalInvoiceId) {
    const orderExternals = await invoicesRepo.listOrderExternalsByInvoice(parsed.invoiceRecordId);
    const derivedExternalInvoiceIds = [
      ...new Set(
        orderExternals
          .map((row) => row.externalInvoiceId)
          .filter((value): value is string => typeof value === "string" && value.trim().length > 0),
      ),
    ];

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
    invoiceExternal = await invoicesRepo.createInvoiceExternal({
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

  if (!invoiceExternal.externalInvoiceId) {
    await invoicesRepo.updateInvoiceExternal(invoiceExternal.recordId, {
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

  const priorAttempts = await countExternalActionsByInvoiceExternal(invoiceExternal.recordId);
  const outboundAttemptNumber = priorAttempts + 1;
  const outboundActionType = outboundAttemptNumber > 1 ? "Retry" : "Send";
  const outboundExternalActionRecordId = await createExternalAction({
    externalEntityType: "Invoice",
    actionType: outboundActionType,
    direction: "Outbound",
    triggerSource: "Automation",
    occurredAt: new Date().toISOString(),
    status: "Pending",
    attemptNumber: outboundAttemptNumber,
    retryable: true,
    provider: context.provider,
    providerEventType: "Send Invoice",
    providerReferenceId: externalInvoiceId,
    requestPayload: JSON.stringify({
      invoiceRecordId: parsed.invoiceRecordId,
      orderRecordId: resolvedOrderRecordId,
      orgIntegrationRecordId: parsed.orgIntegrationRecordId,
      invoiceExternalRecordId: invoiceExternal.recordId,
      externalInvoiceId,
      deliveryMethod,
      saveCard,
      forceResend: parsed.forceResend,
    }),
    writebackStatus: "Pending",
    writebackLastAttemptAt: new Date().toISOString(),
    orgIntegrationRecordId: parsed.orgIntegrationRecordId,
    invoiceExternalRecordId: invoiceExternal.recordId,
  });

  try {
    await invoicesRepo.updateInvoiceExternal(invoiceExternal.recordId, {
      "Delivery Method": deliveryMethod,
      "Save Card": saveCard,
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

  const details = await invoicesRepo.getInvoiceDetails({
    context,
    externalInvoiceId,
  });

  let effectiveStatus = details.status;
  let effectiveVersion = details.version;
  let effectivePublicUrl = details.publicUrl;
  let settingsRawPayload: string | null = null;

  if (effectiveVersion != null) {
    const settingsUpdate = await invoicesRepo.updateInvoiceSettings({
      context,
      externalInvoiceId,
      version: effectiveVersion,
      deliveryMethod,
      saveCard,
    });

    settingsRawPayload = settingsUpdate.rawPayload;
    effectiveStatus = settingsUpdate.externalStatus ?? effectiveStatus;
    effectivePublicUrl = settingsUpdate.hostedInvoiceUrl ?? effectivePublicUrl;
    effectiveVersion = settingsUpdate.version ?? effectiveVersion;
  }

  const externalStatusNow = mapProviderInvoiceStatusToExternal(effectiveStatus);
  const alreadySentLike =
    externalStatusNow === "Sent" ||
    externalStatusNow === "Partially Paid" ||
    externalStatusNow === "Paid";

  if (alreadySentLike && !parsed.forceResend) {
    const hostedInvoiceUrl =
      effectivePublicUrl ??
      (await invoicesRepo.getInvoicePublicUrl({
        context,
        externalInvoiceId,
      }));

    await invoicesRepo.updateInvoiceExternal(invoiceExternal.recordId, {
      "External Status": externalStatusNow,
      ...(hostedInvoiceUrl ? { "Hosted Invoice URL": hostedInvoiceUrl } : {}),
      "Sent At": invoiceExternal.sentAt ?? new Date().toISOString(),
      "Last Send Error": "",
      "External Process Status": "Succeeded",
      "External Process At": new Date().toISOString(),
      "External Process Raw Payload": settingsRawPayload ?? details.rawPayload,
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
      await invoicesRepo.updateInvoicePaymentLink(parsed.invoiceRecordId, hostedInvoiceUrl);
    }

    await updateExternalAction(outboundExternalActionRecordId, {
      status: "Succeeded",
      occurredAt: new Date().toISOString(),
      providerReferenceId: externalInvoiceId,
      responsePayload: settingsRawPayload ?? details.rawPayload,
      httpStatusCode: 200,
      errorSummary: "",
      writebackStatus: "Succeeded",
      writebackSucceededAt: new Date().toISOString(),
    });

    return {
      ok: true,
      action: "Send Invoice",
      result: "noop",
      invoiceId: parsed.invoiceRecordId,
      orderId: resolvedOrderRecordId,
      invoiceExternalRecordId: invoiceExternal.recordId,
      externalInvoiceId,
      externalStatus: externalStatusNow,
      deliveryMethod,
      saveCard,
      hostedInvoiceUrl,
    };
  }

  if (effectiveVersion == null) {
    throw new SyncEndpointError("Unable to send invoice: provider invoice version is missing.", 409);
  }

  const publishResult = await invoicesRepo.publishInvoice({
    context,
    externalInvoiceId,
    version: effectiveVersion,
    idempotencyKey,
  });

  const hostedInvoiceUrl =
    publishResult.hostedInvoiceUrl ??
    effectivePublicUrl ??
    (await invoicesRepo.getInvoicePublicUrl({
      context,
      externalInvoiceId,
    }));

  const mappedStatus = mapProviderInvoiceStatusToExternal(publishResult.externalStatus);

  await invoicesRepo.updateInvoiceExternal(invoiceExternal.recordId, {
    "External Invoice ID": externalInvoiceId,
    ...(details.externalOrderId ? { "External Order ID": details.externalOrderId } : {}),
    "External Status": mappedStatus,
    ...(hostedInvoiceUrl ? { "Hosted Invoice URL": hostedInvoiceUrl } : {}),
    "Sent At": new Date().toISOString(),
    "Last Send Error": "",
    "External Process Status": "Succeeded",
    "External Process At": new Date().toISOString(),
    "External Process Error": "",
    "External Process Raw Payload": settingsRawPayload
      ? JSON.stringify({ settings: settingsRawPayload, publish: publishResult.rawPayload })
      : publishResult.rawPayload,
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
    await invoicesRepo.updateInvoicePaymentLink(parsed.invoiceRecordId, hostedInvoiceUrl);
  }

    await updateExternalAction(outboundExternalActionRecordId, {
      status: "Succeeded",
      occurredAt: new Date().toISOString(),
      providerReferenceId: externalInvoiceId,
      responsePayload: settingsRawPayload
        ? JSON.stringify({ settings: settingsRawPayload, publish: publishResult.rawPayload })
        : publishResult.rawPayload,
      httpStatusCode: 200,
      errorSummary: "",
      writebackStatus: "Succeeded",
      writebackSucceededAt: new Date().toISOString(),
    });

    return {
      ok: true,
      action: "Send Invoice",
      result: "processed",
      invoiceId: parsed.invoiceRecordId,
      orderId: resolvedOrderRecordId,
      invoiceExternalRecordId: invoiceExternal.recordId,
      externalInvoiceId,
      externalStatus: mappedStatus,
      deliveryMethod,
      saveCard,
      hostedInvoiceUrl,
      sentAt: new Date().toISOString(),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected server error.";
    const statusCode = error instanceof SyncEndpointError ? error.status : 500;
    const rawPayload = error instanceof SyncEndpointError ? error.rawPayload : undefined;
    const classification = classifyRetryability({
      stage: "provider",
      httpStatus: statusCode,
      errorType: inferErrorType(message),
    });

    try {
      await updateExternalAction(outboundExternalActionRecordId, {
        status: "Failed",
        occurredAt: new Date().toISOString(),
        providerReferenceId: externalInvoiceId,
        errorSummary: message,
        rawProviderPayload: rawPayload,
        httpStatusCode: statusCode,
        retryable: classification.retryable,
        retryClassification: classification.classification,
        writebackStatus: "Failed",
        writebackError: message,
        writebackRetryCount: outboundAttemptNumber,
        writebackLastAttemptAt: new Date().toISOString(),
      });
    } catch {
      // preserve original error
    }

    throw error;
  }
}

export async function reconcileInvoiceExternals(
  body: unknown,
): Promise<ReconcileInvoiceExternalsResponseDto> {
  const parsed = parseReconcileBody(body);

  await invoicesRepo.getOrderRecord(parsed.orderRecordId);
  const invoices = await invoicesRepo.listInvoicesByOrder(parsed.orderRecordId);
  if (invoices.length === 0) {
    throw new SyncEndpointError("No Invoices linked to this Order.", 422);
  }

  const results: InvoiceReconcileResultDto[] = [];
  for (const invoice of invoices) {
    const result = await reconcileOneInvoice({
      invoiceId: invoice.recordId,
      orderRecordId: parsed.orderRecordId,
      orgIntegrationRecordId: parsed.orgIntegrationRecordId,
      dryRun: parsed.dryRun,
    });
    results.push(result);
  }

  return {
    ok: true,
    dryRun: parsed.dryRun,
    orderRecordId: parsed.orderRecordId,
    orgIntegrationRecordId: parsed.orgIntegrationRecordId,
    invoicesProcessed: results.length,
    results,
  };
}

export async function writeSendInvoiceFailure(input: {
  invoiceExternalRecordId: string;
  error: unknown;
}): Promise<void> {
  const message =
    input.error instanceof Error ? input.error.message : "Unexpected server error.";
  const statusCode = input.error instanceof SyncEndpointError ? input.error.status : 500;
  const rawPayload = input.error instanceof SyncEndpointError ? input.error.rawPayload : undefined;

  await invoicesRepo.updateInvoiceExternal(input.invoiceExternalRecordId, {
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
}


