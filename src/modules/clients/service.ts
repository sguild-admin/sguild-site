import { SyncEndpointError } from "@/lib/errors";
import { createExternalAction, updateExternalAction } from "@/modules/integrations";
import { clientSyncRepo } from "./repo";
import { parseSyncRecordId, resolveSquareContext } from "./schema";
import type { SyncErrorResponse, SyncSuccessResponse } from "./dto";

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

  await clientSyncRepo.writeClientExternalSyncPending(clientExternal.recordId);

  let externalActionId: string | null = null;

  try {
    const squareContext = resolveSquareContext(syncInput);
    provider = squareContext.provider;
    providerAccountId = squareContext.providerAccountId;

    const actionType = clientExternal.externalCustomerId ? "Refresh" : "Create";
    externalActionId = await createExternalAction({
      externalEntityType: "Client",
      actionType,
      direction: "Outbound",
      triggerSource: "Automation",
      occurredAt: new Date().toISOString(),
      status: "Pending",
      attemptNumber: 1,
      retryable: true,
      providerAccountRecordId: clientExternal.providerAccountId ?? undefined,
      provider: provider ?? undefined,
      providerReferenceId: clientExternal.recordId,
      requestPayload: JSON.stringify({
        action: actionType,
        clientExternalRecordId: clientExternal.recordId,
        clientId: clientExternal.clientId,
        externalCustomerId: clientExternal.externalCustomerId,
        nameSnapshot: effectiveNameSnapshot,
        phoneSnapshot: effectivePhoneSnapshot,
      }),
      writebackStatus: "Pending",
      writebackLastAttemptAt: new Date().toISOString(),
    });

    const syncResult = await clientSyncRepo.runSquareClientSync(syncInput, squareContext);

    const desiredNameSnapshot = buildSquareSnapshotName(syncResult) ?? effectiveNameSnapshot;
    const desiredPhoneSnapshot = syncResult.squarePhoneNumber ?? effectivePhoneSnapshot;

    await clientSyncRepo.writeClientExternalSyncSuccess({
      recordId: clientExternal.recordId,
      externalCustomerId: syncResult.externalCustomerId,
      nameSnapshot: desiredNameSnapshot,
      phoneSnapshot: desiredPhoneSnapshot,
      externalActionId,
    });

    const providerEventType =
      syncResult.path === "create" ? "CreateCustomer"
      : syncResult.path === "matched" && syncResult.mode === "updated" ? "UpdateCustomer"
      : syncResult.path === "matched" ? "RetrieveCustomer"
      : syncResult.path === "verify" ? "RetrieveCustomer"
      : "UpdateCustomer";

    const nowIso = new Date().toISOString();
    await updateExternalAction(externalActionId, {
      status: "Succeeded",
      httpStatusCode: 200,
      providerEventType,
      providerEventId: syncResult.externalCustomerId,
      rawProviderPayload: syncResult.rawProviderPayload ?? undefined,
      responsePayload: JSON.stringify({
        path: syncResult.path,
        mode: syncResult.mode,
        externalCustomerId: syncResult.externalCustomerId,
        squareGivenName: syncResult.squareGivenName,
        squareFamilyName: syncResult.squareFamilyName,
        squarePhoneNumber: syncResult.squarePhoneNumber,
      }),
      writebackStatus: "Succeeded",
      writebackSucceededAt: nowIso,
      writebackLastAttemptAt: nowIso,
      writebackError: "",
      retryable: false,
    });

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

    if (externalActionId) {
      const httpCode = error instanceof SyncEndpointError ? error.status : 500;
      try {
        await updateExternalAction(externalActionId, {
          status: "Failed",
          httpStatusCode: httpCode,
          errorSummary: message,
          writebackStatus: "Failed",
          writebackError: message,
          writebackLastAttemptAt: new Date().toISOString(),
          retryable: true,
        });
      } catch (eaErr) {
        console.error("Failed to update EA on client sync failure", {
          externalActionId,
          error: eaErr instanceof Error ? eaErr.message : String(eaErr),
        });
      }
    }

    try {
      await clientSyncRepo.writeClientExternalSyncFailure(clientExternal.recordId, message);
    } catch (writeErr) {
      console.error("Failed to write sync failure status", {
        recordId: clientExternal.recordId,
        error: writeErr instanceof Error ? writeErr.message : String(writeErr),
      });
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

