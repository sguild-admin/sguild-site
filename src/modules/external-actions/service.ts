import { NextResponse } from "next/server";
import { assertJsonRequest, parseJsonBody } from "@/lib/http/request";
import { SyncEndpointError } from "@/lib/errors";
import { assertAuthorizedSyncRequest } from "@/modules/integrations";
import { ordersRepo, runSendInvoice } from "@/modules/orders";
import type {
  ExternalActionsErrorResponseDto,
  ExternalActionsResponseDto,
  RetryExternalActionFailureResponseDto,
  RetryClassification,
  RetryExternalActionRequestDto,
  RetryExternalActionSuccessResponseDto,
  SyncExternalActionFailureResponseDto,
  SyncExternalActionProviderResult,
  SyncExternalActionRequestDto,
  SyncExternalActionStage,
  SyncExternalActionSuccessResponseDto,
  SyncExternalActionWritebackStatus,
} from "./dto";
import { externalActionsRepo } from "./repo";
import { classifyRetryability, inferErrorType } from "./retry-classification";
import {
  parseExternalActionsRequestBody,
  parseRetryExternalActionBody,
  parseSyncExternalActionBody,
} from "./schema";

const SYNC_ENDPOINT = "/api/external-actions/sync" as const;
const RETRY_ENDPOINT = "/api/external-actions/retry" as const;

class SyncExternalActionError extends SyncEndpointError {
  readonly recordId: string;
  readonly stage: SyncExternalActionStage;
  readonly crossedProviderBoundary: boolean;
  readonly externalActionId: string;
  readonly persistedFailureWrite: boolean;

  constructor(input: {
    message: string;
    status: number;
    recordId: string;
    stage: SyncExternalActionStage;
    crossedProviderBoundary: boolean;
    externalActionId: string;
    persistedFailureWrite?: boolean;
  }) {
    super(input.message, input.status);
    this.recordId = input.recordId;
    this.stage = input.stage;
    this.crossedProviderBoundary = input.crossedProviderBoundary;
    this.externalActionId = input.externalActionId;
    this.persistedFailureWrite = Boolean(input.persistedFailureWrite);
  }
}

class RetryExternalActionError extends SyncEndpointError {
  readonly recordId: string;
  readonly stage: SyncExternalActionStage;
  readonly crossedProviderBoundary: boolean;
  readonly externalActionId: string;

  constructor(input: {
    message: string;
    status: number;
    recordId: string;
    stage: SyncExternalActionStage;
    crossedProviderBoundary: boolean;
    externalActionId: string;
  }) {
    super(input.message, input.status);
    this.recordId = input.recordId;
    this.stage = input.stage;
    this.crossedProviderBoundary = input.crossedProviderBoundary;
    this.externalActionId = input.externalActionId;
  }
}

function toErrorResponse(
  error: unknown,
): { status: number; body: ExternalActionsErrorResponseDto } {
  if (error instanceof SyncEndpointError) {
    return {
      status: error.status,
      body: {
        ok: false,
        error: error.exposeMessage ? error.message : "Unexpected server error.",
      },
    };
  }

  return {
    status: 500,
    body: {
      ok: false,
      error: error instanceof Error ? error.message : "Unexpected server error.",
    },
  };
}

export async function runExternalActionsWorkflow(body: unknown): Promise<ExternalActionsResponseDto> {
  const parsed = parseExternalActionsRequestBody(body);

  if (parsed.operation === "create") {
    const recordId = await externalActionsRepo.createExternalAction(parsed.payload);
    return { ok: true, operation: "create", recordId };
  }

  if (parsed.operation === "update") {
    await externalActionsRepo.updateExternalAction(parsed.payload);
    return { ok: true, operation: "update", recordId: parsed.payload.recordId };
  }

  if (parsed.operation === "find_inbound_by_identity") {
    const record = await externalActionsRepo.findInboundExternalActionByIdentity(parsed.payload);
    return { ok: true, operation: "find_inbound_by_identity", record };
  }

  const count = await externalActionsRepo.countExternalActionsByExternalLink(parsed.payload);
  return { ok: true, operation: "count_by_external", count };
}

function normalizeNameFromProvider(input: {
  squareGivenName: string | null;
  squareFamilyName: string | null;
  squareNickname: string | null;
}): string | null {
  const full = [input.squareGivenName, input.squareFamilyName]
    .filter((v): v is string => Boolean(v))
    .join(" ")
    .trim();
  return full || input.squareNickname || null;
}

function syncSuccessResponse(input: {
  recordId: string;
  crossedProviderBoundary: boolean;
  providerResult: SyncExternalActionProviderResult;
  externalActionId: string;
  writebackStatus: SyncExternalActionWritebackStatus;
  idempotencyKey: string;
}): SyncExternalActionSuccessResponseDto {
  return {
    ok: true,
    endpoint: SYNC_ENDPOINT,
    recordId: input.recordId,
    crossedProviderBoundary: input.crossedProviderBoundary,
    providerResult: input.providerResult,
    externalActionId: input.externalActionId,
    writebackStatus: input.writebackStatus,
    idempotencyKey: input.idempotencyKey,
  };
}

function retrySuccessResponse(input: {
  recordId: string;
  crossedProviderBoundary: boolean;
  providerResult: SyncExternalActionProviderResult;
  externalActionId: string;
  writebackStatus: SyncExternalActionWritebackStatus;
  idempotencyKey: string;
}): RetryExternalActionSuccessResponseDto {
  return {
    ok: true,
    endpoint: RETRY_ENDPOINT,
    recordId: input.recordId,
    crossedProviderBoundary: input.crossedProviderBoundary,
    providerResult: input.providerResult,
    externalActionId: input.externalActionId,
    writebackStatus: input.writebackStatus,
    idempotencyKey: input.idempotencyKey,
  };
}

function syncErrorResponse(error: unknown): { status: number; body: SyncExternalActionFailureResponseDto } {
  if (error instanceof SyncExternalActionError) {
    return {
      status: error.status,
      body: {
        ok: false,
        endpoint: SYNC_ENDPOINT,
        recordId: error.recordId,
        crossedProviderBoundary: error.crossedProviderBoundary,
        stage: error.stage,
        error: error.exposeMessage ? error.message : "Unexpected server error.",
        externalActionId: error.externalActionId,
      },
    };
  }

  if (error instanceof SyncEndpointError) {
    return {
      status: error.status,
      body: {
        ok: false,
        endpoint: SYNC_ENDPOINT,
        recordId: "unknown",
        crossedProviderBoundary: false,
        stage: "validation",
        error: error.exposeMessage ? error.message : "Unexpected server error.",
        externalActionId: "unknown",
      },
    };
  }

  return {
    status: 500,
    body: {
      ok: false,
      endpoint: SYNC_ENDPOINT,
      recordId: "unknown",
      crossedProviderBoundary: false,
      stage: "validation",
      error: error instanceof Error ? error.message : "Unexpected server error.",
      externalActionId: "unknown",
    },
  };
}

function retryErrorResponse(error: unknown): { status: number; body: RetryExternalActionFailureResponseDto } {
  if (error instanceof RetryExternalActionError) {
    return {
      status: error.status,
      body: {
        ok: false,
        endpoint: RETRY_ENDPOINT,
        recordId: error.recordId,
        crossedProviderBoundary: error.crossedProviderBoundary,
        stage: error.stage,
        error: error.exposeMessage ? error.message : "Unexpected server error.",
        externalActionId: error.externalActionId,
      },
    };
  }

  if (error instanceof SyncEndpointError) {
    return {
      status: error.status,
      body: {
        ok: false,
        endpoint: RETRY_ENDPOINT,
        recordId: "unknown",
        crossedProviderBoundary: false,
        stage: "validation",
        error: error.exposeMessage ? error.message : "Unexpected server error.",
        externalActionId: "unknown",
      },
    };
  }

  return {
    status: 500,
    body: {
      ok: false,
      endpoint: RETRY_ENDPOINT,
      recordId: "unknown",
      crossedProviderBoundary: false,
      stage: "validation",
      error: error instanceof Error ? error.message : "Unexpected server error.",
      externalActionId: "unknown",
    },
  };
}

function targetFromAction(action: Awaited<ReturnType<typeof externalActionsRepo.getExternalAction>>) {
  const targets: Array<{
    field: "Client External" | "Card External" | "Order External" | "Refund External";
    id: string;
  }> = [];
  const byField = [
    {
      field: "Client External" as const,
      ids: action.clientExternalRecordIds.length
        ? action.clientExternalRecordIds
        : action.clientExternalRecordId
          ? [action.clientExternalRecordId]
          : [],
    },
    {
      field: "Card External" as const,
      ids: action.cardExternalRecordIds.length
        ? action.cardExternalRecordIds
        : action.cardExternalRecordId
          ? [action.cardExternalRecordId]
          : [],
    },
    {
      field: "Order External" as const,
      ids: action.orderExternalRecordIds.length
        ? action.orderExternalRecordIds
        : action.orderExternalRecordId
          ? [action.orderExternalRecordId]
          : [],
    },
    {
      field: "Refund External" as const,
      ids: action.refundExternalRecordIds.length
        ? action.refundExternalRecordIds
        : action.refundExternalRecordId
          ? [action.refundExternalRecordId]
          : [],
    },
  ];

  for (const group of byField) {
    for (const id of group.ids) {
      targets.push({ field: group.field, id });
    }
  }
  return targets;
}

function validateSyncActionType(actionType: string | null, recordId: string): void {
  const supported = new Set(["Create", "Send", "Refresh", "Void", "Reconcile", "Retry"]);
  if (!actionType || !supported.has(actionType)) {
    throw new SyncExternalActionError({
      message: "Action Type is not supported for outbound sync execution.",
      status: 422,
      recordId,
      stage: "validation",
      crossedProviderBoundary: false,
      externalActionId: recordId,
    });
  }
}

function buildIdempotencyKey(input: {
  explicit?: string;
  externalActionId: string;
  actionType: string;
  targetExternalId: string;
}): string {
  if (input.explicit) return input.explicit;
  return `external-actions.sync:${input.externalActionId}:${input.actionType}:${input.targetExternalId}`;
}

function buildRetryIdempotencyKey(input: {
  explicit?: string;
  failedExternalActionId: string;
  attemptNumber: number;
}): string {
  if (input.explicit) return input.explicit;
  return `retry|${input.failedExternalActionId}|${input.attemptNumber}`;
}

function toProviderResultFromStatus(
  status: "Pending" | "Succeeded" | "Failed" | "Ignored" | null,
): SyncExternalActionProviderResult {
  if (status === "Succeeded") return "succeeded";
  if (status === "Failed") return "failed";
  if (status === "Ignored") return "noop";
  return "ignored";
}

function toWritebackStatus(
  status: "Not Started" | "Pending" | "Succeeded" | "Failed" | null,
): SyncExternalActionWritebackStatus {
  if (status === "Succeeded" || status === "Failed" || status === "Pending") return status;
  return "Pending";
}

function readOriginalActionTypeFromNotes(notes: string | null): string | null {
  if (!notes) return null;
  const match = notes.match(/originalActionType=([A-Za-z]+)/);
  return match?.[1] ?? null;
}

function validateProviderContextAlignment(
  action: Awaited<ReturnType<typeof externalActionsRepo.getExternalAction>>,
  recordId: string,
): void {
  if (!action.providerAccountRecordId) return;
  const conflicts = [
    {
      label: "Org Integration Provider Account",
      value: action.orgIntegrationProviderAccountRecordId,
    },
    {
      label: "Client External Provider Account",
      value: action.clientExternalProviderAccountRecordId,
    },
    {
      label: "Card External Provider Account",
      value: action.cardExternalProviderAccountRecordId,
    },
    {
      label: "Order External Provider Account",
      value: action.orderExternalProviderAccountRecordId,
    },
    {
      label: "Refund External Provider Account",
      value: action.refundExternalProviderAccountRecordId,
    },
  ].filter((entry) => Boolean(entry.value) && entry.value !== action.providerAccountRecordId);

  if (conflicts.length > 0) {
    throw new RetryExternalActionError({
      message: `${conflicts[0].label} conflicts with Provider Account on External Action.`,
      status: 409,
      recordId,
      stage: "ambiguity",
      crossedProviderBoundary: false,
      externalActionId: recordId,
    });
  }
}

type RetryMode = "writeback_only" | "provider_call";

// Retry logic is driven by Retry Classification, not by Status.
// Status reflects provider execution. Writeback Status reflects persistence.
// Retry must handle both independently.
function resolveRetryMode(classification: RetryClassification): RetryMode {
  if (classification === "Writeback Failure") {
    return "writeback_only";
  }
  return "provider_call";
}

function parseClientExternalWritebackPayload(responsePayload: string): { externalCustomerId: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(responsePayload);
  } catch {
    throw new SyncEndpointError("Cannot retry writeback: response payload is not valid JSON.", 422);
  }

  if (typeof parsed !== "object" || parsed == null || Array.isArray(parsed)) {
    throw new SyncEndpointError("Cannot retry writeback: response payload shape is invalid.", 422);
  }

  const externalCustomerId = (parsed as { externalCustomerId?: unknown }).externalCustomerId;
  if (typeof externalCustomerId !== "string" || externalCustomerId.trim().length === 0) {
    throw new SyncEndpointError("Cannot retry writeback: response payload is missing externalCustomerId.", 422);
  }

  return { externalCustomerId: externalCustomerId.trim() };
}

function parseOrderRecordIdFromRequestPayload(requestPayload: string | null): string | null {
  if (!requestPayload) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(requestPayload);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed == null || Array.isArray(parsed)) return null;
  const recordId = (parsed as { recordId?: unknown }).recordId;
  if (typeof recordId !== "string") return null;
  const trimmed = recordId.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asExternalLinkType(
  field: "Client External" | "Card External" | "Order External" | "Refund External",
): "Client External" | "Card External" | "Order External" | "Refund External" {
  return field;
}

function inferLegacyRetryStage(
  action: Awaited<ReturnType<typeof externalActionsRepo.getExternalAction>>,
): SyncExternalActionStage {
  if (
    action.writebackStatus === "Failed" &&
    (action.status === "Succeeded" || action.status === "Ignored")
  ) {
    return "writeback";
  }

  if (action.httpStatusCode === 409) return "ambiguity";
  if (action.httpStatusCode === 422) return "validation";
  return "provider";
}

async function markActionFailed(input: {
  recordId: string;
  stage: SyncExternalActionStage;
  message: string;
  statusCode: number;
  crossedProviderBoundary: boolean;
  errorType?: string;
}): Promise<never> {
  const classification = classifyRetryability({
    stage: input.stage,
    httpStatus: input.statusCode,
    errorType: input.errorType,
  });
  await externalActionsRepo.updateExternalAction({
    recordId: input.recordId,
    status: input.stage === "writeback" ? "Succeeded" : "Failed",
    httpStatusCode: input.statusCode,
    retryable: classification.retryable,
    retryClassification: classification.classification,
    errorSummary: input.message,
    writebackStatus: "Failed",
    writebackError: input.message,
    writebackLastAttemptAt: new Date().toISOString(),
  });
  throw new SyncExternalActionError({
    message: input.message,
    status: input.statusCode,
    recordId: input.recordId,
    stage: input.stage,
    crossedProviderBoundary: input.crossedProviderBoundary,
    externalActionId: input.recordId,
    persistedFailureWrite: true,
  });
}

export async function runSyncExternalAction(body: unknown): Promise<SyncExternalActionSuccessResponseDto> {
  const parsed: SyncExternalActionRequestDto = parseSyncExternalActionBody(body);
  const action = await externalActionsRepo.getExternalAction(parsed.recordId);

  try {
    if (action.direction !== "Outbound") {
      throw new SyncExternalActionError({
        message: "Only outbound External Actions are supported by this endpoint.",
        status: 422,
        recordId: parsed.recordId,
        stage: "validation",
        crossedProviderBoundary: false,
        externalActionId: parsed.recordId,
      });
    }
    validateSyncActionType(action.actionType, parsed.recordId);

    const targets = targetFromAction(action);
    if (targets.length !== 1) {
      throw new SyncExternalActionError({
        message:
          targets.length === 0
            ? "Missing linked external target."
            : "Multiple linked external targets found. Exactly one is required.",
        status: 409,
        recordId: parsed.recordId,
        stage: "ambiguity",
        crossedProviderBoundary: false,
        externalActionId: parsed.recordId,
      });
    }
    const target = targets[0];

    if (!action.providerAccountRecordId) {
      throw new SyncExternalActionError({
        message: "Missing Provider Account context on External Action.",
        status: 422,
        recordId: parsed.recordId,
        stage: "validation",
        crossedProviderBoundary: false,
        externalActionId: parsed.recordId,
      });
    }

    const providerAccount = await externalActionsRepo.getProviderAccount(action.providerAccountRecordId);
    if (!providerAccount.operationallyUsable || !providerAccount.accessTokenAlias) {
      throw new SyncExternalActionError({
        message: "Provider Account is not runnable.",
        status: 422,
        recordId: parsed.recordId,
        stage: "validation",
        crossedProviderBoundary: false,
        externalActionId: parsed.recordId,
      });
    }

    if (action.status === "Succeeded" && action.writebackStatus === "Succeeded" && !parsed.force) {
      const idempotencyKey = buildIdempotencyKey({
        explicit: parsed.idempotencyKey,
        externalActionId: parsed.recordId,
        actionType: action.actionType as string,
        targetExternalId: target.id,
      });
      return syncSuccessResponse({
        recordId: parsed.recordId,
        crossedProviderBoundary: false,
        providerResult: "noop",
        externalActionId: parsed.recordId,
        writebackStatus: "Succeeded",
        idempotencyKey,
      });
    }

    const idempotencyKey = buildIdempotencyKey({
      explicit: parsed.idempotencyKey,
      externalActionId: parsed.recordId,
      actionType: action.actionType as string,
      targetExternalId: target.id,
    });

    if (parsed.retryExternalActionId && parsed.retryExternalActionId !== parsed.recordId) {
      throw new SyncExternalActionError({
        message: "retryExternalActionId must match consumed External Action recordId for this endpoint.",
        status: 422,
        recordId: parsed.recordId,
        stage: "validation",
        crossedProviderBoundary: false,
        externalActionId: parsed.recordId,
      });
    }

    const priorSuccessCount = await externalActionsRepo.countSuccessfulActionsByScope({
      providerReferenceId: idempotencyKey,
      providerAccountRecordId: action.providerAccountRecordId,
      externalEntityType: action.externalEntityType as "Client" | "Card" | "Order" | "Refund",
      actionType: action.actionType as "Create" | "Send" | "Refresh" | "Void" | "Import" | "Webhook" | "Reconcile" | "Retry",
      targetField: target.field,
      targetRecordId: target.id,
      excludeRecordId: parsed.recordId,
    });
    if (priorSuccessCount > 0 && !parsed.force) {
      await externalActionsRepo.updateExternalAction({
        recordId: parsed.recordId,
        status: "Ignored",
        providerReferenceId: idempotencyKey,
        errorSummary: "",
        httpStatusCode: 200,
        writebackStatus: "Succeeded",
        writebackSucceededAt: new Date().toISOString(),
        writebackLastAttemptAt: new Date().toISOString(),
      });
      return syncSuccessResponse({
        recordId: parsed.recordId,
        crossedProviderBoundary: false,
        providerResult: "noop",
        externalActionId: parsed.recordId,
        writebackStatus: "Succeeded",
        idempotencyKey,
      });
    }

    await externalActionsRepo.updateExternalAction({
      recordId: parsed.recordId,
      status: "Pending",
      providerReferenceId: idempotencyKey,
      requestPayload: JSON.stringify({
        recordId: parsed.recordId,
        targetField: target.field,
        targetRecordId: target.id,
        actionType: action.actionType,
        force: Boolean(parsed.force),
        idempotencyKey,
      }),
      writebackStatus: "Pending",
      writebackLastAttemptAt: new Date().toISOString(),
    });

    if (target.field !== "Client External" || action.externalEntityType !== "Client") {
      await externalActionsRepo.updateExternalAction({
        recordId: parsed.recordId,
        status: "Ignored",
        httpStatusCode: 200,
        responsePayload: JSON.stringify({
          providerResult: "ignored",
          reason: "Entity/action sync adapter is not implemented yet for this target type.",
        }),
        errorSummary: "",
        writebackStatus: "Succeeded",
        writebackSucceededAt: new Date().toISOString(),
        writebackLastAttemptAt: new Date().toISOString(),
      });
      return syncSuccessResponse({
        recordId: parsed.recordId,
        crossedProviderBoundary: false,
        providerResult: "ignored",
        externalActionId: parsed.recordId,
        writebackStatus: "Succeeded",
        idempotencyKey,
      });
    }

    const clientExternal = await externalActionsRepo.getClientExternal(target.id);
    if (clientExternal.providerAccountRecordId && clientExternal.providerAccountRecordId !== action.providerAccountRecordId) {
      throw new SyncExternalActionError({
        message: "Client External provider account mismatch.",
        status: 409,
        recordId: parsed.recordId,
        stage: "ambiguity",
        crossedProviderBoundary: false,
        externalActionId: parsed.recordId,
      });
    }

    if (
      action.actionType === "Create" &&
      clientExternal.externalCustomerId &&
      clientExternal.syncStatus?.toLowerCase() === "synced" &&
      !parsed.force
    ) {
      await externalActionsRepo.updateExternalAction({
        recordId: parsed.recordId,
        status: "Ignored",
        httpStatusCode: 200,
        responsePayload: JSON.stringify({
          providerResult: "noop",
          reason: "Client External already has provider customer mapping.",
        }),
        errorSummary: "",
        writebackStatus: "Succeeded",
        writebackSucceededAt: new Date().toISOString(),
        writebackLastAttemptAt: new Date().toISOString(),
      });
      return syncSuccessResponse({
        recordId: parsed.recordId,
        crossedProviderBoundary: false,
        providerResult: "noop",
        externalActionId: parsed.recordId,
        writebackStatus: "Succeeded",
        idempotencyKey,
      });
    }

    let providerResult: SyncExternalActionProviderResult = "succeeded";
    try {
      const providerSync = await externalActionsRepo.runSquareClientActionSync({
        clientExternal,
        providerAccount,
      });
      if (providerSync.providerMode === "verified") providerResult = "noop";

      await externalActionsRepo.updateExternalAction({
        recordId: parsed.recordId,
        status: providerResult === "noop" ? "Ignored" : "Succeeded",
        provider: providerAccount.provider ?? action.provider ?? "Square",
        providerEventType: action.providerEventType ?? action.actionType ?? undefined,
        providerReferenceId: providerSync.externalCustomerId,
        httpStatusCode: 200,
        errorSummary: "",
        responsePayload: JSON.stringify({
          mode: providerSync.providerMode,
          path: providerSync.providerPath,
          externalCustomerId: providerSync.externalCustomerId,
        }),
        rawProviderPayload: JSON.stringify(providerSync),
        writebackStatus: "Pending",
        writebackLastAttemptAt: new Date().toISOString(),
      });

      try {
        await externalActionsRepo.writeClientExternalSyncResult({
          recordId: clientExternal.recordId,
          externalCustomerId: providerSync.externalCustomerId,
          syncStatus: "Synced",
          nameSnapshot: normalizeNameFromProvider(providerSync),
          phoneSnapshot: providerSync.squarePhoneNumber,
        });
      } catch (writebackError) {
        const message = writebackError instanceof Error ? writebackError.message : "Writeback failed.";
        const classification = classifyRetryability({
          stage: "writeback",
          httpStatus: 502,
          errorType: inferErrorType(message),
        });
        await externalActionsRepo.updateExternalAction({
          recordId: parsed.recordId,
          status: providerResult === "noop" ? "Ignored" : "Succeeded",
          httpStatusCode: 502,
          retryable: classification.retryable,
          retryClassification: classification.classification,
          errorSummary: message,
          writebackStatus: "Failed",
          writebackError: message,
          writebackRetryCount: (action.attemptNumber ?? 0) + 1,
          writebackLastAttemptAt: new Date().toISOString(),
        });
        throw new SyncExternalActionError({
          message,
          status: 502,
          recordId: parsed.recordId,
          stage: "writeback",
          crossedProviderBoundary: true,
          externalActionId: parsed.recordId,
          persistedFailureWrite: true,
        });
      }

      await externalActionsRepo.updateExternalAction({
        recordId: parsed.recordId,
        writebackStatus: "Succeeded",
        writebackSucceededAt: new Date().toISOString(),
        writebackError: "",
        writebackLastAttemptAt: new Date().toISOString(),
      });

      return syncSuccessResponse({
        recordId: parsed.recordId,
        crossedProviderBoundary: true,
        providerResult,
        externalActionId: parsed.recordId,
        writebackStatus: "Succeeded",
        idempotencyKey,
      });
    } catch (providerError) {
      if (providerError instanceof SyncExternalActionError) throw providerError;

      const message = providerError instanceof Error ? providerError.message : "Provider sync failed.";
      const statusCode = providerError instanceof SyncEndpointError ? providerError.status : 500;
      const classification = classifyRetryability({
        stage: "provider",
        httpStatus: statusCode,
        errorType: inferErrorType(message),
      });
      await externalActionsRepo.updateExternalAction({
        recordId: parsed.recordId,
        status: "Failed",
        httpStatusCode: statusCode,
        retryable: classification.retryable,
        retryClassification: classification.classification,
        errorSummary: message,
        rawProviderPayload: providerError instanceof SyncEndpointError ? providerError.rawPayload : undefined,
        writebackStatus: "Failed",
        writebackError: message,
        writebackRetryCount: (action.attemptNumber ?? 0) + 1,
        writebackLastAttemptAt: new Date().toISOString(),
      });
      throw new SyncExternalActionError({
        message,
        status: statusCode,
        recordId: parsed.recordId,
        stage: "provider",
        crossedProviderBoundary: true,
        externalActionId: parsed.recordId,
        persistedFailureWrite: true,
      });
    }
  } catch (error) {
    if (error instanceof SyncExternalActionError && error.persistedFailureWrite) throw error;
    if (error instanceof SyncExternalActionError) {
      return await markActionFailed({
        recordId: error.recordId,
        stage: error.stage,
        message: error.message,
        statusCode: error.status,
        crossedProviderBoundary: error.crossedProviderBoundary,
        errorType: inferErrorType(error.message),
      });
    }
    return await markActionFailed({
      recordId: parsed.recordId,
      stage: "validation",
      message: error instanceof Error ? error.message : "Unexpected sync error.",
      statusCode: error instanceof SyncEndpointError ? error.status : 500,
      crossedProviderBoundary: false,
      errorType: inferErrorType(error instanceof Error ? error.message : undefined),
    });
  }
}

export async function runRetryExternalAction(body: unknown): Promise<RetryExternalActionSuccessResponseDto> {
  const parsed: RetryExternalActionRequestDto = parseRetryExternalActionBody(body);
  const failedAction = await externalActionsRepo.getExternalAction(parsed.recordId);

  try {
    if (failedAction.direction !== "Outbound") {
      throw new RetryExternalActionError({
        message: "External Action must be Outbound to retry.",
        status: 422,
        recordId: parsed.recordId,
        stage: "validation",
        crossedProviderBoundary: false,
        externalActionId: parsed.recordId,
      });
    }
    if (failedAction.retryable !== true) {
      throw new RetryExternalActionError({
        message: "External Action is not retryable.",
        status: 422,
        recordId: parsed.recordId,
        stage: "validation",
        crossedProviderBoundary: false,
        externalActionId: parsed.recordId,
      });
    }

    const targets = targetFromAction(failedAction);
    if (targets.length !== 1) {
      throw new RetryExternalActionError({
        message:
          targets.length === 0
            ? "Missing linked external target."
            : "Multiple linked external targets found. Exactly one is required.",
        status: 409,
        recordId: parsed.recordId,
        stage: "ambiguity",
        crossedProviderBoundary: false,
        externalActionId: parsed.recordId,
      });
    }
    const target = targets[0];

    if (!failedAction.providerAccountRecordId) {
      throw new RetryExternalActionError({
        message: "Missing Provider Account context on External Action.",
        status: 422,
        recordId: parsed.recordId,
        stage: "validation",
        crossedProviderBoundary: false,
        externalActionId: parsed.recordId,
      });
    }

    validateProviderContextAlignment(failedAction, parsed.recordId);

    const providerAccount = await externalActionsRepo.getProviderAccount(failedAction.providerAccountRecordId);
    if (!providerAccount.operationallyUsable || !providerAccount.accessTokenAlias) {
      throw new RetryExternalActionError({
        message: "Provider Account is not runnable.",
        status: 422,
        recordId: parsed.recordId,
        stage: "validation",
        crossedProviderBoundary: false,
        externalActionId: parsed.recordId,
      });
    }

    let retryClassification = failedAction.retryClassification as RetryClassification | null;
    if (!retryClassification) {
      const inferredStage = inferLegacyRetryStage(failedAction);
      const inferred = classifyRetryability({
        stage: inferredStage,
        httpStatus: failedAction.httpStatusCode ?? undefined,
        errorType: inferErrorType(failedAction.errorSummary),
      });
      retryClassification = inferred.classification;
      await externalActionsRepo.updateExternalAction({
        recordId: failedAction.recordId,
        retryable: inferred.retryable,
        retryClassification: inferred.classification,
        writebackLastAttemptAt: new Date().toISOString(),
      });
      if (!inferred.retryable) {
        throw new RetryExternalActionError({
          message: "External Action is not retryable after classification backfill.",
          status: 422,
          recordId: parsed.recordId,
          stage: inferredStage,
          crossedProviderBoundary: false,
          externalActionId: parsed.recordId,
        });
      }
    }
    const retryMode = resolveRetryMode(retryClassification);
    if (retryClassification === "Writeback Failure" && !failedAction.responsePayload) {
      throw new Error("Cannot retry writeback without response payload");
    }

    const originalActionType =
      failedAction.actionType === "Retry"
        ? readOriginalActionTypeFromNotes(failedAction.notes)
        : failedAction.actionType;
    if (retryMode === "provider_call") {
      if (!originalActionType) {
        throw new RetryExternalActionError({
          message: "Unable to determine original action semantics for retry.",
          status: 409,
          recordId: parsed.recordId,
          stage: "ambiguity",
          crossedProviderBoundary: false,
          externalActionId: parsed.recordId,
        });
      }
      const supportedRetriableActionTypes = new Set(["Create", "Send", "Refresh", "Void"]);
      if (!supportedRetriableActionTypes.has(originalActionType)) {
        throw new RetryExternalActionError({
          message: "Original action type is not supported by this retry endpoint.",
          status: 422,
          recordId: parsed.recordId,
          stage: "validation",
          crossedProviderBoundary: false,
          externalActionId: parsed.recordId,
        });
      }
    }

    const countedAttempts =
      (await externalActionsRepo.countExternalActionsByExternalLink({
        externalLinkType: asExternalLinkType(target.field),
        externalRecordId: target.id,
        direction: "Outbound",
      })) + 1;
    const attemptNumber = Math.max((failedAction.attemptNumber ?? 0) + 1, countedAttempts);
    const idempotencyKey = buildRetryIdempotencyKey({
      explicit: parsed.idempotencyKey,
      failedExternalActionId: failedAction.recordId,
      attemptNumber,
    });

    const existingRetry = await externalActionsRepo.findRetryActionByProviderReferenceId(idempotencyKey);
    if (existingRetry) {
      await externalActionsRepo.updateExternalAction({
        recordId: failedAction.recordId,
        retryable: false,
        writebackLastAttemptAt: new Date().toISOString(),
      });
      return retrySuccessResponse({
        recordId: parsed.recordId,
        crossedProviderBoundary: false,
        providerResult: toProviderResultFromStatus(existingRetry.status),
        externalActionId: existingRetry.recordId,
        writebackStatus: toWritebackStatus(existingRetry.writebackStatus),
        idempotencyKey,
      });
    }

    if (
      retryMode === "provider_call" &&
      target.field === "Order External" &&
      failedAction.externalEntityType === "Order" &&
      originalActionType === "Send"
    ) {
      let orderRecordId: string | null = null;
      try {
        const linkedOrderExternal = await ordersRepo.getOrderExternalRecord(target.id);
        orderRecordId = linkedOrderExternal.orderId;
      } catch {
        orderRecordId = null;
      }
      if (!orderRecordId) {
        orderRecordId = parseOrderRecordIdFromRequestPayload(failedAction.requestPayload);
      }
      if (!orderRecordId) {
        throw new RetryExternalActionError({
          message: "Cannot resolve Order recordId from linked Order External or External Action request payload.",
          status: 409,
          recordId: parsed.recordId,
          stage: "ambiguity",
          crossedProviderBoundary: false,
          externalActionId: parsed.recordId,
        });
      }

      const updateRetryBookkeeping = async (newExternalActionId?: string): Promise<void> => {
        const nowIso = new Date().toISOString();
        await externalActionsRepo.updateExternalAction({
          recordId: failedAction.recordId,
          retryable: false,
          writebackLastAttemptAt: nowIso,
          writebackRetryCount: (failedAction.writebackRetryCount ?? 0) + 1,
        });
        if (newExternalActionId && newExternalActionId !== failedAction.recordId) {
          await externalActionsRepo.updateExternalAction({
            recordId: newExternalActionId,
            attemptNumber,
          });
        }
      };

      try {
        const sendResponse = await runSendInvoice({
          recordId: orderRecordId,
          force: Boolean(parsed.force),
          idempotencyKey,
          externalActionAttemptNumber: attemptNumber,
        });
        await updateRetryBookkeeping(sendResponse.externalActionId);
        return retrySuccessResponse({
          recordId: parsed.recordId,
          crossedProviderBoundary: sendResponse.crossedProviderBoundary,
          providerResult: sendResponse.providerResult,
          externalActionId: sendResponse.externalActionId,
          writebackStatus: sendResponse.writebackStatus,
          idempotencyKey: sendResponse.idempotencyKey,
        });
      } catch (error) {
        if (error instanceof SyncEndpointError) {
          const tagged = error as unknown as {
            stage?: unknown;
            crossedProviderBoundary?: unknown;
            externalActionId?: unknown;
          };
          const stage =
            typeof tagged.stage === "string" &&
            (tagged.stage === "validation" ||
              tagged.stage === "provider" ||
              tagged.stage === "writeback" ||
              tagged.stage === "ambiguity")
              ? (tagged.stage as SyncExternalActionStage)
              : "provider";
          const crossedProviderBoundary =
            typeof tagged.crossedProviderBoundary === "boolean"
              ? tagged.crossedProviderBoundary
              : stage === "provider" || stage === "writeback";
          const externalActionId =
            typeof tagged.externalActionId === "string"
              ? tagged.externalActionId
              : parsed.recordId;

          if (externalActionId && externalActionId !== parsed.recordId) {
            try {
              await updateRetryBookkeeping(externalActionId);
            } catch {
              // Preserve original error; retry bookkeeping can be repaired separately.
            }
          }

          throw new RetryExternalActionError({
            message: error.message,
            status: error.status,
            recordId: parsed.recordId,
            stage,
            crossedProviderBoundary,
            externalActionId,
          });
        }
        throw error;
      }
    }

    if (retryMode === "provider_call" && (target.field !== "Client External" || failedAction.externalEntityType !== "Client" || originalActionType !== "Create")) {
      throw new RetryExternalActionError({
        message: "Retry execution adapter is currently implemented only for Client Create actions.",
        status: 422,
        recordId: parsed.recordId,
        stage: "validation",
        crossedProviderBoundary: false,
        externalActionId: parsed.recordId,
      });
    }
    if (retryMode === "writeback_only" && (target.field !== "Client External" || failedAction.externalEntityType !== "Client")) {
      throw new RetryExternalActionError({
        message: "Writeback repair adapter is currently implemented only for Client External actions.",
        status: 422,
        recordId: parsed.recordId,
        stage: "validation",
        crossedProviderBoundary: false,
        externalActionId: parsed.recordId,
      });
    }

    const clientExternal = await externalActionsRepo.getClientExternal(target.id);
    if (clientExternal.providerAccountRecordId && clientExternal.providerAccountRecordId !== failedAction.providerAccountRecordId) {
      throw new RetryExternalActionError({
        message: "Client External provider account mismatch.",
        status: 409,
        recordId: parsed.recordId,
        stage: "ambiguity",
        crossedProviderBoundary: false,
        externalActionId: parsed.recordId,
      });
    }

    if (
      retryMode === "provider_call" &&
      clientExternal.externalCustomerId &&
      clientExternal.syncStatus?.toLowerCase() === "synced" &&
      !parsed.force
    ) {
      return retrySuccessResponse({
        recordId: parsed.recordId,
        crossedProviderBoundary: false,
        providerResult: "noop",
        externalActionId: parsed.recordId,
        writebackStatus: "Succeeded",
        idempotencyKey,
      });
    }

    const nowIso = new Date().toISOString();
    const retryActionId = await externalActionsRepo.createExternalAction({
      externalEntityType: failedAction.externalEntityType ?? "Client",
      actionType: "Retry",
      direction: "Outbound",
      triggerSource: "Manual",
      occurredAt: nowIso,
      status: "Pending",
      attemptNumber,
      retryable: false,
      notes: `Retry of ${failedAction.recordId}; originalActionType=${originalActionType ?? "Unknown"}`,
      orgIntegrationRecordId: failedAction.orgIntegrationRecordId ?? undefined,
      providerAccountRecordId: failedAction.providerAccountRecordId,
      clientExternalRecordId: failedAction.clientExternalRecordId ?? undefined,
      cardExternalRecordId: failedAction.cardExternalRecordId ?? undefined,
      orderExternalRecordId: failedAction.orderExternalRecordId ?? undefined,
      refundExternalRecordId: failedAction.refundExternalRecordId ?? undefined,
      provider: failedAction.provider ?? providerAccount.provider ?? undefined,
      providerEventType: failedAction.providerEventType ?? originalActionType ?? undefined,
      providerReferenceId: idempotencyKey,
      requestPayload: JSON.stringify({
        retryOfExternalActionId: failedAction.recordId,
        originalActionType: originalActionType ?? undefined,
        targetField: target.field,
        targetRecordId: target.id,
        force: Boolean(parsed.force),
        idempotencyKey,
      }),
      writebackStatus: "Pending",
      writebackLastAttemptAt: nowIso,
    });

    await externalActionsRepo.updateExternalAction({
      recordId: failedAction.recordId,
      retryable: false,
      writebackLastAttemptAt: nowIso,
      writebackRetryCount: (failedAction.writebackRetryCount ?? 0) + 1,
    });

    if (retryMode === "writeback_only") {
      try {
        const payload = parseClientExternalWritebackPayload(failedAction.responsePayload as string);
        await externalActionsRepo.writeClientExternalSyncResult({
          recordId: clientExternal.recordId,
          externalCustomerId: payload.externalCustomerId,
          syncStatus: "Synced",
        });
        await externalActionsRepo.updateExternalAction({
          recordId: retryActionId,
          status: failedAction.status === "Ignored" ? "Ignored" : "Succeeded",
          retryable: false,
          responsePayload: JSON.stringify({
            retryMode,
            replaySourceExternalActionId: failedAction.recordId,
            externalCustomerId: payload.externalCustomerId,
          }),
          writebackStatus: "Succeeded",
          writebackSucceededAt: new Date().toISOString(),
          writebackError: "",
          writebackLastAttemptAt: new Date().toISOString(),
        });
        return retrySuccessResponse({
          recordId: parsed.recordId,
          crossedProviderBoundary: false,
          providerResult: "noop",
          externalActionId: retryActionId,
          writebackStatus: "Succeeded",
          idempotencyKey,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Writeback retry failed.";
        const classification = classifyRetryability({
          stage: "writeback",
          httpStatus: error instanceof SyncEndpointError ? error.status : 502,
          errorType: inferErrorType(message),
        });
        await externalActionsRepo.updateExternalAction({
          recordId: retryActionId,
          status: failedAction.status === "Ignored" ? "Ignored" : "Succeeded",
          httpStatusCode: error instanceof SyncEndpointError ? error.status : 502,
          retryable: classification.retryable,
          retryClassification: classification.classification,
          errorSummary: message,
          writebackStatus: "Failed",
          writebackError: message,
          writebackLastAttemptAt: new Date().toISOString(),
        });
        throw new RetryExternalActionError({
          message,
          status: error instanceof SyncEndpointError ? error.status : 502,
          recordId: parsed.recordId,
          stage: "writeback",
          crossedProviderBoundary: false,
          externalActionId: retryActionId,
        });
      }
    }

    try {
      const syncResponse = await runSyncExternalAction({
        recordId: retryActionId,
        force: parsed.force,
        idempotencyKey,
      });

      return retrySuccessResponse({
        recordId: parsed.recordId,
        crossedProviderBoundary: syncResponse.crossedProviderBoundary,
        providerResult: syncResponse.providerResult,
        externalActionId: syncResponse.externalActionId,
        writebackStatus: syncResponse.writebackStatus,
        idempotencyKey: syncResponse.idempotencyKey,
      });
    } catch (error) {
      if (error instanceof SyncExternalActionError) {
        throw new RetryExternalActionError({
          message: error.message,
          status: error.status,
          recordId: parsed.recordId,
          stage: error.stage,
          crossedProviderBoundary: error.crossedProviderBoundary,
          externalActionId: error.externalActionId,
        });
      }
      throw error;
    }
  } catch (error) {
    if (error instanceof RetryExternalActionError) throw error;

    throw new RetryExternalActionError({
      message: error instanceof Error ? error.message : "Unexpected retry error.",
      status: error instanceof SyncEndpointError ? error.status : 500,
      recordId: parsed.recordId,
      stage: "validation",
      crossedProviderBoundary: false,
      externalActionId: parsed.recordId,
    });
  }
}

export async function handleExternalActions(request: Request): Promise<NextResponse> {
  try {
    assertAuthorizedSyncRequest(request);
    assertJsonRequest(request);
    const body = await parseJsonBody(request);
    const response = await runExternalActionsWorkflow(body);
    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    const { status, body } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}

export async function handleSyncExternalAction(request: Request): Promise<NextResponse> {
  try {
    assertAuthorizedSyncRequest(request);
    assertJsonRequest(request);
    const body = await parseJsonBody(request);
    const response = await runSyncExternalAction(body);
    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    const { status, body } = syncErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}

export async function handleRetryExternalAction(request: Request): Promise<NextResponse> {
  try {
    assertAuthorizedSyncRequest(request);
    assertJsonRequest(request);
    const body = await parseJsonBody(request);
    const response = await runRetryExternalAction(body);
    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    const { status, body } = retryErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
