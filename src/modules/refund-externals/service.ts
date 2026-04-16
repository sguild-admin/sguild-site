import { airtableSchema } from "@/config/airtable-schema";
import { SyncEndpointError } from "@/lib/errors";
import { externalActionsRepo, classifyRetryability, inferErrorType } from "@/modules/external-actions";
import { ordersRepo, providerContextRepo } from "@/modules/orders";
import { parseProcessRefundExternalBody } from "./schema";
import { createProviderRefund } from "./adapter";
import { refundExternalsRepo } from "./repo";
import type {
  ProcessRefundExternalFailureResponseDto,
  ProcessRefundExternalStage,
  ProcessRefundExternalSuccessResponseDto,
  ProcessRefundExternalWritebackStatus,
} from "./dto";

const ENDPOINT = "/api/refund-externals/process" as const;

function isLinkedRecordTableMismatchError(message: string): boolean {
  const normalized = message.toLowerCase();
  return normalized.includes("belongs to table") && normalized.includes("field links to table");
}

class ProcessRefundExternalError extends SyncEndpointError {
  readonly stage: ProcessRefundExternalStage;
  readonly recordId: string;
  readonly crossedProviderBoundary: boolean;
  readonly externalActionId?: string;

  constructor(input: {
    message: string;
    status: number;
    stage: ProcessRefundExternalStage;
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

function isProviderAccountActive(status: string | null): boolean {
  if (!status) return true;
  const normalized = status.trim().toLowerCase();
  if (!normalized) return true;
  return !["inactive", "disabled", "archived", "failed", "off"].includes(normalized);
}

function buildIdempotencyKey(input: {
  explicit: string | null;
  recordId: string;
  attemptNumber: number;
}): string {
  if (input.explicit) return input.explicit;
  // Stable per Refund External to prevent duplicate provider refunds across retries.
  return `refund-externals.process:${input.recordId}:create-refund`;
}

function normalizeProvider(provider: string | null | undefined): string {
  return (provider ?? "").trim().toLowerCase();
}

function successResponse(input: {
  recordId: string;
  crossedProviderBoundary: boolean;
  providerResult: "succeeded" | "noop";
  externalActionId: string;
  externalRefundId: string;
  writebackStatus: ProcessRefundExternalWritebackStatus;
  idempotencyKey: string;
}): ProcessRefundExternalSuccessResponseDto {
  return {
    ok: true,
    endpoint: ENDPOINT,
    recordId: input.recordId,
    crossedProviderBoundary: input.crossedProviderBoundary,
    providerResult: input.providerResult,
    externalActionId: input.externalActionId,
    externalRefundId: input.externalRefundId,
    writebackStatus: input.writebackStatus,
    idempotencyKey: input.idempotencyKey,
  };
}

function stageFromStatus(status: number): ProcessRefundExternalStage {
  if (status === 409) return "ambiguity";
  if (status >= 500) return "writeback";
  return "validation";
}

function toFailureResponse(
  error: unknown,
  fallbackRecordId: string | null,
): { status: number; body: ProcessRefundExternalFailureResponseDto } {
  if (error instanceof ProcessRefundExternalError) {
    return {
      status: error.status,
      body: {
        ok: false,
        endpoint: ENDPOINT,
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
        endpoint: ENDPOINT,
        recordId: fallbackRecordId ?? "",
        crossedProviderBoundary: false,
        stage: stageFromStatus(error.status),
        error: error.exposeMessage ? error.message : "Unexpected server error.",
      },
    };
  }

  return {
    status: 500,
    body: {
      ok: false,
      endpoint: ENDPOINT,
      recordId: fallbackRecordId ?? "",
      crossedProviderBoundary: false,
      stage: "validation",
      error: error instanceof Error ? error.message : "Unexpected server error.",
    },
  };
}

async function updateExternalActionFailed(input: {
  recordId: string;
  message: string;
  statusCode: number;
  stage: ProcessRefundExternalStage;
  writebackStatus: "Not Started" | "Failed" | "Succeeded";
  rawPayload?: string;
}): Promise<void> {
  const classification = classifyRetryability({
    stage: input.stage,
    httpStatus: input.statusCode,
    errorType: inferErrorType(input.message),
  });
  await externalActionsRepo.updateExternalAction({
    recordId: input.recordId,
    status: input.stage === "writeback" ? "Succeeded" : "Failed",
    occurredAt: new Date().toISOString(),
    httpStatusCode: input.statusCode,
    errorSummary: input.message,
    rawProviderPayload: input.rawPayload,
    retryable: classification.retryable,
    retryClassification: classification.classification,
    writebackStatus: input.writebackStatus,
    writebackError: input.writebackStatus === "Failed" ? input.message : "",
    writebackLastAttemptAt: new Date().toISOString(),
    ...(input.writebackStatus === "Succeeded" ? { writebackSucceededAt: new Date().toISOString() } : {}),
  });
}

async function ensureExternalActionRefundLink(input: {
  externalActionId: string;
  refundExternalRecordId: string;
  refundRecordId: string | null;
}): Promise<void> {
  const current = await externalActionsRepo.getExternalAction(input.externalActionId);
  const linkedIds = current.refundExternalRecordIds.length
    ? current.refundExternalRecordIds
    : current.refundExternalRecordId
      ? [current.refundExternalRecordId]
      : [];
  if (linkedIds.length > 0) return;

  const candidates = [input.refundExternalRecordId, input.refundRecordId].filter(
    (value): value is string => Boolean(value),
  );
  for (const candidate of candidates) {
    try {
      await externalActionsRepo.updateExternalAction({
        recordId: input.externalActionId,
        refundExternalRecordId: candidate,
      });
      const verify = await externalActionsRepo.getExternalAction(input.externalActionId);
      const verifyIds = verify.refundExternalRecordIds.length
        ? verify.refundExternalRecordIds
        : verify.refundExternalRecordId
          ? [verify.refundExternalRecordId]
          : [];
      if (verifyIds.length > 0) return;
    } catch (error) {
      if (error instanceof SyncEndpointError && isLinkedRecordTableMismatchError(error.message)) {
        continue;
      }
    }
  }
}

async function resolveOrderExternalForRefund(input: {
  orderId: string;
  orgIntegrationId: string;
  provider: string;
}): Promise<{
  recordId: string;
  orgIntegrationId: string | null;
  externalPaymentId: string | null;
  externalInvoiceId: string | null;
}> {
  const orderExternals = await ordersRepo.listOrderExternalsByOrder(input.orderId);
  const byOrgIntegration = orderExternals.filter(
    (row) => row.orgIntegrationId === input.orgIntegrationId,
  );
  if (byOrgIntegration.length === 1) {
    return {
      recordId: byOrgIntegration[0].recordId,
      orgIntegrationId: byOrgIntegration[0].orgIntegrationId,
      externalPaymentId: byOrgIntegration[0].externalPaymentId,
      externalInvoiceId: byOrgIntegration[0].externalInvoiceId,
    };
  }
  if (byOrgIntegration.length > 1) {
    throw new SyncEndpointError(
      "Multiple Order Externals found for this Order + Org Integration provider context.",
      409,
    );
  }

  const normalizedProvider = normalizeProvider(input.provider);
  const providerMatched: Array<{
    recordId: string;
    orgIntegrationId: string | null;
    externalPaymentId: string | null;
    externalInvoiceId: string | null;
  }> = [];
  for (const row of orderExternals) {
    if (!row.providerAccountId) continue;
    const providerAccount = await ordersRepo.getProviderAccountRecord(row.providerAccountId);
    if (normalizeProvider(providerAccount.provider) === normalizedProvider) {
      providerMatched.push({
        recordId: row.recordId,
        orgIntegrationId: row.orgIntegrationId,
        externalPaymentId: row.externalPaymentId,
        externalInvoiceId: row.externalInvoiceId,
      });
    }
  }

  if (providerMatched.length === 0) {
    if (orderExternals.length === 1) {
      return {
        recordId: orderExternals[0].recordId,
        orgIntegrationId: orderExternals[0].orgIntegrationId,
        externalPaymentId: orderExternals[0].externalPaymentId,
        externalInvoiceId: orderExternals[0].externalInvoiceId,
      };
    }
    throw new SyncEndpointError(
      "No Order External found for this Order and provider context.",
      422,
    );
  }
  if (providerMatched.length > 1) {
    throw new SyncEndpointError(
      "Multiple Order Externals found for this Order and provider context.",
      409,
    );
  }
  return providerMatched[0];
}

async function resolveOrgIntegrationForRefund(input: {
  seededOrgIntegrationId: string | null;
  orderId: string;
  orderOrganizationId: string | null;
  providerHint: string | null;
}): Promise<{ recordId: string; provider: string | null; providerAccountId: string | null }> {
  if (input.seededOrgIntegrationId) {
    const seeded = await refundExternalsRepo.getOrgIntegrationRecord(input.seededOrgIntegrationId);
    return {
      recordId: seeded.recordId,
      provider: seeded.provider,
      providerAccountId: seeded.providerAccountId,
    };
  }

  const orderExternals = await ordersRepo.listOrderExternalsByOrder(input.orderId);
  const uniqueOrgIntegrationIds = Array.from(
    new Set(
      orderExternals
        .map((row) => row.orgIntegrationId)
        .filter((value): value is string => typeof value === "string" && value.trim().length > 0),
    ),
  );

  if (uniqueOrgIntegrationIds.length === 1) {
    const fromOrderExternal = await refundExternalsRepo.getOrgIntegrationRecord(uniqueOrgIntegrationIds[0]);
    return {
      recordId: fromOrderExternal.recordId,
      provider: fromOrderExternal.provider,
      providerAccountId: fromOrderExternal.providerAccountId,
    };
  }
  if (uniqueOrgIntegrationIds.length > 1) {
    throw new SyncEndpointError(
      "Multiple Org Integrations are linked through Order Externals for this Refund Order.",
      409,
    );
  }

  if (!input.orderOrganizationId) {
    throw new SyncEndpointError(
      "Unable to resolve Org Integration: Order is missing Organization link.",
      422,
    );
  }

  const linkedOrgIntegrations = await providerContextRepo.listOrgIntegrationsLinkedToOrganization(
    input.orderOrganizationId,
  );
  const fallbackOrgIntegrations =
    linkedOrgIntegrations.length > 0
      ? linkedOrgIntegrations
      : await providerContextRepo.listOrgIntegrationsByOrganization(input.orderOrganizationId);

  const providerHint = normalizeProvider(input.providerHint);
  const narrowed =
    providerHint.length > 0
      ? fallbackOrgIntegrations.filter(
          (row) => normalizeProvider(row.provider) === providerHint,
        )
      : fallbackOrgIntegrations;

  if (narrowed.length === 0) {
    throw new SyncEndpointError(
      "No Org Integration found for this Refund organization context.",
      422,
    );
  }
  if (narrowed.length > 1) {
    throw new SyncEndpointError(
      "Multiple Org Integrations found for this Refund organization context.",
      409,
    );
  }

  return {
    recordId: narrowed[0].recordId,
    provider: narrowed[0].provider,
    providerAccountId: narrowed[0].providerAccountId,
  };
}

export async function runProcessRefundExternal(
  body: unknown,
): Promise<ProcessRefundExternalSuccessResponseDto> {
  const parsed = parseProcessRefundExternalBody(body);
  const nowIso = new Date().toISOString();
  let actionFailurePersisted = false;

  const fail = (input: {
    message: string;
    status: number;
    stage: ProcessRefundExternalStage;
    crossedProviderBoundary?: boolean;
    externalActionId?: string;
  }): never => {
    throw new ProcessRefundExternalError({
      message: input.message,
      status: input.status,
      stage: input.stage,
      recordId: parsed.recordId,
      crossedProviderBoundary: input.crossedProviderBoundary ?? false,
      externalActionId: input.externalActionId,
    });
  };

  const resolvedTarget = await refundExternalsRepo.resolveRefundExternalForProcessByAnyId(parsed.recordId);
  const refundExternal = resolvedTarget.refundExternal;
  const refundExternalRecordId = resolvedTarget.refundExternalRecordId;
  const priorCreateActions = await refundExternalsRepo.listCreateActionsByRefundExternal(refundExternalRecordId);
  const maxAttempt = priorCreateActions.reduce(
    (max, row) => Math.max(max, row.attemptNumber ?? 0),
    0,
  );
  const nextAttempt = maxAttempt + 1;
  const idempotencyKey = buildIdempotencyKey({
    explicit: parsed.idempotencyKey,
    recordId: refundExternalRecordId,
    attemptNumber: nextAttempt,
  });
  let resolvedRefundIdForLink = refundExternal.refundId;
  if (!resolvedRefundIdForLink) {
    resolvedRefundIdForLink = await refundExternalsRepo.findRefundRecordIdByRefundExternalId(
      refundExternalRecordId,
    );
  }
  if (!resolvedRefundIdForLink) {
    try {
      await refundExternalsRepo.getRefundRecord(parsed.recordId);
      resolvedRefundIdForLink = parsed.recordId;
    } catch {
      // no-op
    }
  }

  let preloadedRefundStatus: string | null = null;
  if (resolvedRefundIdForLink) {
    try {
      const preloadedRefund = await refundExternalsRepo.getRefundRecord(resolvedRefundIdForLink);
      preloadedRefundStatus = preloadedRefund.status;
    } catch {
      // no-op
    }
  }

  const preWritebackRecoveryOnly =
    refundExternal.syncStatus === "Synced" &&
    Boolean(refundExternal.externalRefundId) &&
    preloadedRefundStatus != null &&
    preloadedRefundStatus !== "Completed";

  let reusableActionId: string | null = null;
  if (preWritebackRecoveryOnly) {
    if (parsed.retryExternalActionId) {
      reusableActionId = parsed.retryExternalActionId;
    } else {
      const linkedCandidates = [...priorCreateActions]
        .sort((a, b) => (a.attemptNumber ?? 0) - (b.attemptNumber ?? 0));
      if (linkedCandidates.length > 0) {
        reusableActionId = linkedCandidates[linkedCandidates.length - 1].recordId;
      } else {
        const noteMatched = await refundExternalsRepo.findLatestCreateActionByRefundExternalToken(
          refundExternalRecordId,
        );
        reusableActionId = noteMatched?.recordId ?? null;
      }
    }
  }

  let externalActionId: string;
  if (reusableActionId) {
    externalActionId = reusableActionId;
    await externalActionsRepo.updateExternalAction({
      recordId: externalActionId,
      occurredAt: nowIso,
      writebackLastAttemptAt: nowIso,
      writebackStatus: "Pending",
      writebackError: "",
    });
  } else {
    try {
      externalActionId = await externalActionsRepo.createExternalAction({
        externalEntityType: "Refund",
        actionType: "Create",
        direction: "Outbound",
        triggerSource: "Automation",
        occurredAt: nowIso,
        status: "Pending",
        attemptNumber: nextAttempt,
        retryable: true,
        provider: refundExternal.provider ?? undefined,
        providerEventType: "Create Refund",
        providerReferenceId: idempotencyKey,
        notes: `refundExternalRecordId=${refundExternalRecordId}`,
        requestPayload: JSON.stringify({
          recordId: parsed.recordId,
          force: parsed.force,
          retryExternalActionId: parsed.retryExternalActionId,
          idempotencyKey,
          refundExternalRecordId,
          refundRecordId: resolvedRefundIdForLink,
        }),
        writebackStatus: "Pending",
        writebackLastAttemptAt: nowIso,
        orgIntegrationRecordId: refundExternal.orgIntegrationId ?? undefined,
        refundExternalRecordId,
      });
    } catch (error) {
      if (
        error instanceof SyncEndpointError &&
        isLinkedRecordTableMismatchError(error.message) &&
        resolvedRefundIdForLink
      ) {
        try {
          externalActionId = await externalActionsRepo.createExternalAction({
            externalEntityType: "Refund",
            actionType: "Create",
            direction: "Outbound",
            triggerSource: "Automation",
            occurredAt: nowIso,
            status: "Pending",
            attemptNumber: nextAttempt,
            retryable: true,
            provider: refundExternal.provider ?? undefined,
            providerEventType: "Create Refund",
            providerReferenceId: idempotencyKey,
            notes: `refundExternalRecordId=${refundExternalRecordId}; linkFallback=refundRecord`,
            requestPayload: JSON.stringify({
              recordId: parsed.recordId,
              force: parsed.force,
              retryExternalActionId: parsed.retryExternalActionId,
              idempotencyKey,
              refundExternalRecordId,
              refundRecordId: resolvedRefundIdForLink,
              warning: "refund_external_link_table_mismatch",
            }),
            writebackStatus: "Pending",
            writebackLastAttemptAt: nowIso,
            orgIntegrationRecordId: refundExternal.orgIntegrationId ?? undefined,
            refundExternalRecordId: resolvedRefundIdForLink,
          });
        } catch (fallbackError) {
          if (
            fallbackError instanceof SyncEndpointError &&
            isLinkedRecordTableMismatchError(fallbackError.message)
          ) {
            externalActionId = await externalActionsRepo.createExternalAction({
              externalEntityType: "Refund",
              actionType: "Create",
              direction: "Outbound",
              triggerSource: "Automation",
              occurredAt: nowIso,
              status: "Pending",
              attemptNumber: nextAttempt,
              retryable: true,
              provider: refundExternal.provider ?? undefined,
              providerEventType: "Create Refund",
              providerReferenceId: idempotencyKey,
              notes: `refundExternalRecordId=${refundExternalRecordId}; linkFallback=none`,
              requestPayload: JSON.stringify({
                recordId: parsed.recordId,
                force: parsed.force,
                retryExternalActionId: parsed.retryExternalActionId,
                idempotencyKey,
                refundExternalRecordId,
                refundRecordId: resolvedRefundIdForLink,
                warning: "refund_link_table_mismatch_no_link_fallback",
              }),
              writebackStatus: "Pending",
              writebackLastAttemptAt: nowIso,
              orgIntegrationRecordId: refundExternal.orgIntegrationId ?? undefined,
            });
          } else {
            throw fallbackError;
          }
        }
      } else {
        throw error;
      }
    }
  }

  try {
    try {
      await ensureExternalActionRefundLink({
        externalActionId,
        refundExternalRecordId,
        refundRecordId: resolvedRefundIdForLink,
      });
    } catch {
      // best effort; do not block processing on link repair
    }

    let resolvedRefundId = resolvedRefundIdForLink;
    if (!resolvedRefundId) {
      resolvedRefundId = await refundExternalsRepo.findRefundRecordIdByRefundExternalId(
        refundExternalRecordId,
      );
    }
    if (!resolvedRefundId) {
      try {
        await refundExternalsRepo.getRefundRecord(parsed.recordId);
        resolvedRefundId = parsed.recordId;
      } catch {
        // no-op: parsed record is not a Refund record
      }
    }
    if (!resolvedRefundId) {
      fail({
        message: "Refund External is missing required link: Refund is required.",
        status: 422,
        stage: "validation",
        externalActionId,
      });
    }
    if (refundExternal.canonicalOrgMismatch) {
      fail({
        message: "Refund External has canonical organization mismatch.",
        status: 422,
        stage: "validation",
        externalActionId,
      });
    }
    if (!parsed.force && refundExternal.hasException) {
      fail({
        message: "Refund External has exception flags and is not runnable.",
        status: 422,
        stage: "validation",
        externalActionId,
      });
    }

    if (refundExternal.syncStatus === "Synced" && !refundExternal.externalRefundId) {
      fail({
        message: 'Refund External is "Synced" but missing External Refund ID (data integrity issue).',
        status: 409,
        stage: "writeback",
        externalActionId,
      });
    }

    const refund = await refundExternalsRepo.getRefundRecord(resolvedRefundId as string);
    const orderId = refund.orderId ?? refundExternal.orderId;
    if (!orderId) {
      fail({
        message: "Refund is missing Order link.",
        status: 422,
        stage: "validation",
        externalActionId,
      });
    }

    const order = await refundExternalsRepo.getOrderRecord(orderId as string);
    const orgIntegration = await resolveOrgIntegrationForRefund({
      seededOrgIntegrationId: refundExternal.orgIntegrationId,
      orderId: order.recordId,
      orderOrganizationId: order.organizationId,
      providerHint: refundExternal.provider,
    });
    const providerAccountId =
      refundExternal.providerAccountId ?? orgIntegration.providerAccountId;
    if (!providerAccountId) {
      fail({
        message: "Org Integration is missing Provider Account context.",
        status: 422,
        stage: "validation",
        externalActionId,
      });
    }
    const providerAccount = await refundExternalsRepo.getProviderAccountRecord(providerAccountId as string);
    await externalActionsRepo.updateExternalAction({
      recordId: externalActionId,
      orgIntegrationRecordId: orgIntegration.recordId,
      providerAccountRecordId: providerAccount.recordId,
      provider: orgIntegration.provider ?? refundExternal.provider ?? undefined,
    });

    const writebackRecoveryOnly =
      refundExternal.syncStatus === "Synced" &&
      Boolean(refundExternal.externalRefundId) &&
      refund.status !== "Completed";
    const alreadySyncedCompleted =
      refundExternal.syncStatus === "Synced" &&
      Boolean(refundExternal.externalRefundId) &&
      refund.status === "Completed";

    if (!writebackRecoveryOnly && !alreadySyncedCompleted) {
      if (refund.status !== "Approved") {
        fail({
          message: "Refund Status must be Approved to process provider refund.",
          status: 422,
          stage: "validation",
          externalActionId,
        });
      }
      if (!isProviderAccountActive(providerAccount.status)) {
        fail({
          message: "Provider Account is not active.",
          status: 422,
          stage: "validation",
          externalActionId,
        });
      }
      if (!providerAccount.apiBaseUrl || !providerAccount.apiCredentialAlias) {
        fail({
          message: "Provider Account is missing API Base URL or API Credential Alias.",
          status: 422,
          stage: "validation",
          externalActionId,
        });
      }
      if (order.status !== "Paid" && order.status !== "Partially Refunded") {
        fail({
          message: 'Order Status must be "Paid" or "Partially Refunded".',
          status: 422,
          stage: "validation",
          externalActionId,
        });
      }
    }

    if (parsed.retryExternalActionId) {
      const priorAction = await externalActionsRepo.getExternalAction(parsed.retryExternalActionId);
      const linkedRefundExternalIds =
        priorAction.refundExternalRecordIds.length > 0
          ? priorAction.refundExternalRecordIds
          : priorAction.refundExternalRecordId
            ? [priorAction.refundExternalRecordId]
            : [];
      const acceptedLinkedIds = new Set(
        [refundExternalRecordId, resolvedRefundId as string].filter(
          (value): value is string => Boolean(value),
        ),
      );
      const linkMatched =
        linkedRefundExternalIds.length === 0
          ? false
          : linkedRefundExternalIds.some((id) => acceptedLinkedIds.has(id));
      if (!linkMatched) {
        fail({
          message: "retryExternalActionId does not belong to this Refund External.",
          status: 409,
          stage: "ambiguity",
          externalActionId,
        });
      }
      const isWritebackRetryable =
        priorAction.status === "Failed" ||
        (priorAction.status === "Succeeded" && priorAction.writebackStatus === "Failed");
      if (!isWritebackRetryable) {
        fail({
          message: "retryExternalActionId must reference a Failed action or writeback-failed action.",
          status: 422,
          stage: "validation",
          externalActionId,
        });
      }
    }

    const priorSucceededCreate = priorCreateActions.find((row) => row.status === "Succeeded");
    if (priorSucceededCreate && !writebackRecoveryOnly && !parsed.force) {
      fail({
        message:
          "A prior successful Create External Action already exists for this Refund External. Run writeback recovery instead of a new provider call.",
        status: 409,
        stage: "writeback",
        externalActionId,
      });
    }

    if (alreadySyncedCompleted) {
      await externalActionsRepo.updateExternalAction({
        recordId: externalActionId,
        status: "Ignored",
        occurredAt: new Date().toISOString(),
        providerReferenceId: refundExternal.externalRefundId ?? undefined,
        responsePayload: JSON.stringify({ mode: "already_synced_completed" }),
        httpStatusCode: 200,
        errorSummary: "",
        writebackStatus: "Succeeded",
        writebackSucceededAt: new Date().toISOString(),
        writebackError: "",
        writebackLastAttemptAt: new Date().toISOString(),
        retryable: false,
      });
      return successResponse({
        recordId: parsed.recordId,
        crossedProviderBoundary: false,
        providerResult: "noop",
        externalActionId,
        externalRefundId: refundExternal.externalRefundId as string,
        writebackStatus: "Succeeded",
        idempotencyKey,
      });
    }

    if (writebackRecoveryOnly) {
      try {
        await refundExternalsRepo.updateRefundExternalRecord(refundExternalRecordId, {
          [airtableSchema.operations.fields.refundExternals.writebackStatus]: "Succeeded",
          [airtableSchema.operations.fields.refundExternals.writebackError]: "",
          [airtableSchema.operations.fields.refundExternals.writebackAt]: new Date().toISOString(),
        });
        await externalActionsRepo.updateExternalAction({
          recordId: externalActionId,
          status: "Ignored",
          occurredAt: new Date().toISOString(),
          providerReferenceId: refundExternal.externalRefundId ?? undefined,
          responsePayload: JSON.stringify({ mode: "writeback_recovery" }),
          httpStatusCode: 200,
          errorSummary: "",
          writebackStatus: "Succeeded",
          writebackSucceededAt: new Date().toISOString(),
          writebackError: "",
          writebackLastAttemptAt: new Date().toISOString(),
          orgIntegrationRecordId: orgIntegration.recordId,
          providerAccountRecordId: providerAccount.recordId,
          refundExternalRecordId: refundExternalRecordId,
          retryable: false,
        });

        return successResponse({
          recordId: parsed.recordId,
          crossedProviderBoundary: false,
          providerResult: "noop",
          externalActionId,
          externalRefundId: refundExternal.externalRefundId as string,
          writebackStatus: "Succeeded",
          idempotencyKey,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Writeback recovery failed.";
        const status = error instanceof SyncEndpointError ? error.status : 502;
        await updateExternalActionFailed({
          recordId: externalActionId,
          message,
          statusCode: status,
          stage: "writeback",
          writebackStatus: "Failed",
        });
        actionFailurePersisted = true;
        fail({
          message,
          status,
          stage: "writeback",
          crossedProviderBoundary: false,
          externalActionId,
        });
      }
    }

    let orderExternal:
      | {
          recordId: string;
          orgIntegrationId: string | null;
          externalPaymentId: string | null;
          externalInvoiceId: string | null;
        }
      | null = null;
    try {
      orderExternal = await resolveOrderExternalForRefund({
        orderId: order.recordId,
        orgIntegrationId: orgIntegration.recordId,
        provider: orgIntegration.provider ?? refundExternal.provider ?? "",
      });
      if (!orderExternal.externalPaymentId && !orderExternal.externalInvoiceId) {
        fail({
          message:
            "Order External is missing refund target identity (External Payment ID or External Invoice ID).",
          status: 422,
          stage: "validation",
          externalActionId,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to resolve Order External target.";
      const status = error instanceof SyncEndpointError ? error.status : 409;
      await updateExternalActionFailed({
        recordId: externalActionId,
        message,
        statusCode: status,
        stage: status === 409 ? "ambiguity" : "validation",
        writebackStatus: "Succeeded",
      });
      actionFailurePersisted = true;
      fail({
        message,
        status,
        stage: status === 409 ? "ambiguity" : "validation",
        crossedProviderBoundary: false,
        externalActionId,
      });
    }
    if (!orderExternal) {
      fail({
        message: "Failed to resolve Order External target.",
        status: 409,
        stage: "ambiguity",
        crossedProviderBoundary: false,
        externalActionId,
      });
    }
    const resolvedOrderExternal = orderExternal as {
      recordId: string;
      orgIntegrationId: string | null;
      externalPaymentId: string | null;
      externalInvoiceId: string | null;
    };

    // First trigger-row write before provider call: align Org Integration from resolved Order External.
    const resolvedOrgIntegrationLink = resolvedOrderExternal.orgIntegrationId
      ? [resolvedOrderExternal.orgIntegrationId]
      : [orgIntegration.recordId];
    try {
      await refundExternalsRepo.updateRefundExternalRecord(refundExternalRecordId, {
        [airtableSchema.operations.fields.refundExternals.orgIntegration]: resolvedOrgIntegrationLink,
        [airtableSchema.operations.fields.refundExternals.syncStatus]: "Pending",
        [airtableSchema.operations.fields.refundExternals.syncError]: "",
        [airtableSchema.operations.fields.refundExternals.writebackStatus]: "Pending",
        [airtableSchema.operations.fields.refundExternals.writebackError]: "",
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to update Refund External before provider call.";
      const status = error instanceof SyncEndpointError ? error.status : 502;
      await updateExternalActionFailed({
        recordId: externalActionId,
        message,
        statusCode: status,
        stage: stageFromStatus(status),
        writebackStatus: "Failed",
      });
      actionFailurePersisted = true;
      fail({
        message,
        status,
        stage: "writeback",
        crossedProviderBoundary: false,
        externalActionId,
      });
    }

    try {
      const providerResult = await createProviderRefund({
        provider: orgIntegration.provider ?? refundExternal.provider ?? "",
        apiCredentialAlias: providerAccount.apiCredentialAlias as string,
        amount: refund.refundAmount ?? refundExternal.refundAmount ?? 0,
        currency: order.currency ?? "USD",
        externalPaymentId: resolvedOrderExternal.externalPaymentId,
        externalInvoiceId: resolvedOrderExternal.externalInvoiceId,
        idempotencyKey,
        metadata: {
          refundExternalId: refundExternalRecordId,
          refundId: refund.recordId,
          orderId: order.recordId,
        },
      });

      const writebackNow = new Date().toISOString();

      try {
        await refundExternalsRepo.updateRefundExternalRecord(refundExternalRecordId, {
          [airtableSchema.operations.fields.refundExternals.syncStatus]: "Synced",
          [airtableSchema.operations.fields.refundExternals.externalRefundId]: providerResult.externalRefundId,
          [airtableSchema.operations.fields.refundExternals.currentExternalStatus]: providerResult.externalStatus,
          [airtableSchema.operations.fields.refundExternals.lastSyncedAt]: writebackNow,
          [airtableSchema.operations.fields.refundExternals.lastProviderActivityAt]: writebackNow,
          [airtableSchema.operations.fields.refundExternals.syncError]: "",
          [airtableSchema.operations.fields.refundExternals.writebackStatus]: "Succeeded",
          [airtableSchema.operations.fields.refundExternals.writebackAt]: writebackNow,
          [airtableSchema.operations.fields.refundExternals.writebackError]: "",
        });

        await externalActionsRepo.updateExternalAction({
          recordId: externalActionId,
          status: providerResult.result === "noop" ? "Ignored" : "Succeeded",
          occurredAt: writebackNow,
          providerReferenceId: providerResult.providerReferenceId,
          responsePayload: providerResult.responsePayload,
          httpStatusCode: providerResult.httpStatusCode,
          errorSummary: "",
          writebackStatus: "Succeeded",
          writebackSucceededAt: writebackNow,
          writebackError: "",
          writebackLastAttemptAt: writebackNow,
        });

        return successResponse({
          recordId: parsed.recordId,
          crossedProviderBoundary: true,
          providerResult: providerResult.result,
          externalActionId,
          externalRefundId: providerResult.externalRefundId,
          writebackStatus: "Succeeded",
          idempotencyKey,
        });
      } catch (writebackError) {
        const message = writebackError instanceof Error ? writebackError.message : "Writeback failed.";
        const status = writebackError instanceof SyncEndpointError ? writebackError.status : 502;
        const writebackAt = new Date().toISOString();
        try {
          await refundExternalsRepo.updateRefundExternalRecord(refundExternalRecordId, {
            [airtableSchema.operations.fields.refundExternals.writebackStatus]: "Failed",
            [airtableSchema.operations.fields.refundExternals.writebackError]: message,
            [airtableSchema.operations.fields.refundExternals.writebackAt]: writebackAt,
          });
        } catch {
          // preserve original writeback failure
        }
        await updateExternalActionFailed({
          recordId: externalActionId,
          message,
          statusCode: status,
          stage: "writeback",
          writebackStatus: "Failed",
          rawPayload: providerResult.responsePayload,
        });
        actionFailurePersisted = true;
        fail({
          message,
          status,
          stage: "writeback",
          crossedProviderBoundary: true,
          externalActionId,
        });
      }
    } catch (providerError) {
      if (providerError instanceof ProcessRefundExternalError) throw providerError;

      const message = providerError instanceof Error ? providerError.message : "Provider refund execution failed.";
      const status = providerError instanceof SyncEndpointError ? providerError.status : 502;
      const rawPayload = providerError instanceof SyncEndpointError ? providerError.rawPayload : undefined;
      const failureNow = new Date().toISOString();

      try {
        await refundExternalsRepo.updateRefundExternalRecord(refundExternalRecordId, {
          [airtableSchema.operations.fields.refundExternals.syncStatus]: "Failed",
          [airtableSchema.operations.fields.refundExternals.syncError]: message,
          [airtableSchema.operations.fields.refundExternals.lastProviderActivityAt]: failureNow,
          [airtableSchema.operations.fields.refundExternals.writebackStatus]: "Not Started",
          [airtableSchema.operations.fields.refundExternals.writebackError]: "",
        });
      } catch {
        // preserve provider failure
      }

      await updateExternalActionFailed({
        recordId: externalActionId,
        message,
        statusCode: status,
        stage: "provider",
        writebackStatus: "Not Started",
        rawPayload: typeof rawPayload === "string" ? rawPayload : undefined,
      });
      actionFailurePersisted = true;

      fail({
        message,
        status,
        stage: "provider",
        crossedProviderBoundary: true,
        externalActionId,
      });
    }

    throw new SyncEndpointError("Unexpected refund external processing control flow.", 500, {
      exposeMessage: false,
    });
  } catch (error) {
    if (!actionFailurePersisted) {
      if (error instanceof ProcessRefundExternalError) {
        const writebackStatus =
          error.stage === "provider"
            ? "Not Started"
            : error.stage === "writeback"
              ? "Failed"
              : "Succeeded";
        await updateExternalActionFailed({
          recordId: externalActionId,
          message: error.message,
          statusCode: error.status,
          stage: error.stage,
          writebackStatus,
        });
      } else {
        const message = error instanceof Error ? error.message : "Unexpected server error.";
        const status = error instanceof SyncEndpointError ? error.status : 500;
        const stage = stageFromStatus(status);
        await updateExternalActionFailed({
          recordId: externalActionId,
          message,
          statusCode: status,
          stage,
          writebackStatus: stage === "provider" ? "Not Started" : stage === "writeback" ? "Failed" : "Succeeded",
        });
      }
    }
    throw error;
  }
}

export function processRefundExternalFailureFromError(
  error: unknown,
  recordId: string | null,
): { status: number; body: ProcessRefundExternalFailureResponseDto } {
  return toFailureResponse(error, recordId);
}
