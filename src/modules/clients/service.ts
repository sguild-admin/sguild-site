import { SyncEndpointError } from "@/lib/errors";
import { clientSyncRepo } from "./repo";
import { parseSyncRecordId, resolveSquareContext } from "./schema";
import type { SyncErrorResponse, SyncSuccessResponse } from "./dto";
import {
  classifyRetryability,
  externalActionsRepo,
  inferErrorType,
} from "@/modules/external-actions";

const OPERATION = "sync_client_external";

function buildSquareSnapshotName(syncResult: {
  squareGivenName: string | null;
  squareFamilyName: string | null;
  squareNickname: string | null;
}): string | null {
  const given = syncResult.squareGivenName?.trim() || null;
  const family = syncResult.squareFamilyName?.trim() || null;
  const combined = [given, family].filter((part): part is string => Boolean(part)).join(" ").trim();
  if (combined) return combined;
  return syncResult.squareNickname?.trim() || null;
}

function assertOperationalPrerequisites(record: {
  providerAccountId: string | null;
  clientId: string | null;
  missingRequiredLinks: string | null;
  nameSnapshot: string | null;
  clientCanonicalName: string | null;
  clientCanonicalFirstName: string | null;
  clientCanonicalLastName: string | null;
}): void {
  if (!record.providerAccountId) {
    throw new SyncEndpointError("Missing required links: Provider Account.", 422);
  }
  if (!record.clientId) {
    throw new SyncEndpointError("Missing required links: Client.", 422);
  }
  if (record.missingRequiredLinks) {
    throw new SyncEndpointError(record.missingRequiredLinks, 422);
  }
  if (
    !record.nameSnapshot &&
    !record.clientCanonicalName &&
    !record.clientCanonicalFirstName &&
    !record.clientCanonicalLastName
  ) {
    throw new SyncEndpointError(
      "Missing customer identity: Name Snapshot or linked Clients name fields are required.",
      422,
    );
  }
}

function successResponse(externalCustomerId: string, mode: "created" | "updated" | "verified"): SyncSuccessResponse {
  return {
    ok: true,
    syncStatus: "Synced",
    externalCustomerId,
    mode,
  };
}

export function mapClientSyncError(error: unknown): { status: number; body: SyncErrorResponse } {
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
      error: "Unexpected server error.",
    },
  };
}

export async function runClientExternalSync(recordId: string): Promise<SyncSuccessResponse> {
  const clientExternal = await clientSyncRepo.loadClientExternal(recordId);
  assertOperationalPrerequisites(clientExternal);

  const canonicalJoinedName = [
    clientExternal.clientCanonicalFirstName,
    clientExternal.clientCanonicalLastName,
  ]
    .filter((part): part is string => Boolean(part))
    .join(" ")
    .trim();

  const effectiveNameSnapshot = (
    clientExternal.nameSnapshot ??
    clientExternal.clientCanonicalName ??
    (canonicalJoinedName || null)
  );
  const effectivePhoneSnapshot = (
    clientExternal.phoneSnapshot ??
    clientExternal.latestPhoneNormalized ??
    clientExternal.clientCanonicalPhone
  );

  const snapshotPatch: Partial<Record<"Name Snapshot" | "Phone Snapshot", string>> = {};
  if (!clientExternal.nameSnapshot && effectiveNameSnapshot) {
    snapshotPatch["Name Snapshot"] = effectiveNameSnapshot;
  }

  const syncInput = {
    ...clientExternal,
    nameSnapshot: effectiveNameSnapshot,
    phoneSnapshot: effectivePhoneSnapshot,
  };
  const requestedPath = clientExternal.externalCustomerId ? "update_or_verify" : "create";

  let provider: string | null = clientExternal.provider ?? null;
  let providerAccountId: string | null = clientExternal.providerAccountId ?? null;
  let externalActionId: string | null = null;
  let attemptNumber = 1;
  let providerCompleted = false;
  let providerResultMode: "created" | "updated" | "verified" | null = null;

  try {
    await clientSyncRepo.writeClientExternalSyncPending(clientExternal.recordId);
    const squareContext = resolveSquareContext(syncInput);
    provider = squareContext.provider;
    providerAccountId = squareContext.providerAccountId;
    attemptNumber =
      (await externalActionsRepo.countExternalActionsByExternalLink({
        externalLinkType: "Client External",
        externalRecordId: clientExternal.recordId,
        direction: "Outbound",
      })) + 1;
    externalActionId = await externalActionsRepo.createExternalAction({
      externalEntityType: "Client",
      actionType: clientExternal.externalCustomerId ? "Refresh" : "Create",
      direction: "Outbound",
      triggerSource: "Automation",
      occurredAt: new Date().toISOString(),
      status: "Pending",
      attemptNumber,
      retryable: true,
      provider: squareContext.provider,
      providerReferenceId: `client-external-sync:${clientExternal.recordId}`,
      providerAccountRecordId: squareContext.providerAccountId,
      clientExternalRecordId: clientExternal.recordId,
      requestPayload: JSON.stringify({ recordId: clientExternal.recordId }),
      writebackStatus: "Pending",
      writebackLastAttemptAt: new Date().toISOString(),
    });

    const syncResult = await clientSyncRepo.runSquareClientSync(syncInput, squareContext);
    providerCompleted = true;
    providerResultMode = syncResult.mode;

    const postSyncSnapshotPatch: Partial<Record<"Name Snapshot" | "Phone Snapshot", string>> = {
      ...snapshotPatch,
    };
    const desiredNameSnapshot = buildSquareSnapshotName(syncResult) ?? effectiveNameSnapshot;
    if (desiredNameSnapshot && desiredNameSnapshot !== (clientExternal.nameSnapshot ?? null)) {
      postSyncSnapshotPatch["Name Snapshot"] = desiredNameSnapshot;
    }
    const bootstrapClientPhone =
      clientExternal.clientCanonicalPhone ??
      clientExternal.latestPhoneNormalized ??
      effectivePhoneSnapshot;
    const desiredPhoneSnapshot =
      syncResult.mode === "created"
        ? (bootstrapClientPhone ?? syncResult.squarePhoneNumber ?? effectivePhoneSnapshot)
        : (syncResult.squarePhoneNumber ?? effectivePhoneSnapshot);
    if (desiredPhoneSnapshot && desiredPhoneSnapshot !== (clientExternal.phoneSnapshot ?? null)) {
      postSyncSnapshotPatch["Phone Snapshot"] = desiredPhoneSnapshot;
    }
    if (Object.keys(postSyncSnapshotPatch).length > 0) {
      await clientSyncRepo.persistClientExternalSnapshots(clientExternal.recordId, postSyncSnapshotPatch);
    }
    await clientSyncRepo.writeClientExternalSyncSuccess({
      recordId: clientExternal.recordId,
      externalCustomerId: syncResult.externalCustomerId,
      nameSnapshot: desiredNameSnapshot,
      phoneSnapshot: desiredPhoneSnapshot,
      externalActionId,
    });
    if (externalActionId) {
      await externalActionsRepo.updateExternalAction({
        recordId: externalActionId,
        status: syncResult.mode === "verified" ? "Ignored" : "Succeeded",
        occurredAt: new Date().toISOString(),
        providerReferenceId: syncResult.externalCustomerId,
        responsePayload: JSON.stringify(syncResult),
        rawProviderPayload: JSON.stringify(syncResult),
        httpStatusCode: 200,
        errorSummary: "",
        writebackStatus: "Succeeded",
        writebackSucceededAt: new Date().toISOString(),
        writebackError: "",
        writebackLastAttemptAt: new Date().toISOString(),
      });
    }

    console.info("Client external sync completed", {
      operation: OPERATION,
      recordId: clientExternal.recordId,
      provider,
      providerAccountId,
      path: syncResult.path,
      outcome: "success",
      mode: syncResult.mode,
      externalActionId,
    });

    return successResponse(syncResult.externalCustomerId, syncResult.mode);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    try {
      await clientSyncRepo.writeClientExternalSyncFailure(clientExternal.recordId, message);
    } catch {
      // no-op secondary failure
    }
    if (externalActionId) {
      try {
        const statusCode = error instanceof SyncEndpointError ? error.status : 500;
        const stage = providerCompleted ? "writeback" : "provider";
        const classification = classifyRetryability({
          stage,
          httpStatus: statusCode,
          errorType: inferErrorType(message),
        });
        await externalActionsRepo.updateExternalAction({
          recordId: externalActionId,
          status:
            stage === "writeback"
              ? providerResultMode === "verified"
                ? "Ignored"
                : "Succeeded"
              : "Failed",
          occurredAt: new Date().toISOString(),
          httpStatusCode: statusCode,
          retryable: classification.retryable,
          retryClassification: classification.classification,
          errorSummary: message,
          rawProviderPayload: error instanceof SyncEndpointError ? error.rawPayload : undefined,
          writebackStatus: "Failed",
          writebackError: message,
          writebackRetryCount: attemptNumber,
          writebackLastAttemptAt: new Date().toISOString(),
        });
      } catch {
        // no-op secondary failure
      }
    }
    console.error("Client external sync failed", {
      operation: OPERATION,
      recordId: clientExternal.recordId,
      provider,
      providerAccountId,
      path: requestedPath,
      outcome: "failed",
      error: message,
      externalActionId,
    });
    throw error;
  }
}

export async function runClientSync(body: unknown) {
  const recordId = parseSyncRecordId(body);
  return runClientExternalSync(recordId);
}

