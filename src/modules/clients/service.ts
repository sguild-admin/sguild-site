import { SyncEndpointError } from "@/lib/errors";
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

  try {
    const squareContext = resolveSquareContext(syncInput);
    provider = squareContext.provider;
    providerAccountId = squareContext.providerAccountId;

    const syncResult = await clientSyncRepo.runSquareClientSync(syncInput, squareContext);

    const postSyncSnapshotPatch: Partial<Record<"Name Snapshot" | "Phone Snapshot", string>> = {
      ...snapshotPatch,
    };
    const desiredNameSnapshot = buildSquareSnapshotName(syncResult) ?? effectiveNameSnapshot;
    if (desiredNameSnapshot && desiredNameSnapshot !== (clientExternal.nameSnapshot ?? null)) {
      postSyncSnapshotPatch["Name Snapshot"] = desiredNameSnapshot;
    }
    const desiredPhoneSnapshot = syncResult.squarePhoneNumber ?? effectivePhoneSnapshot;
    if (desiredPhoneSnapshot && desiredPhoneSnapshot !== (clientExternal.phoneSnapshot ?? null)) {
      postSyncSnapshotPatch["Phone Snapshot"] = desiredPhoneSnapshot;
    }
    if (Object.keys(postSyncSnapshotPatch).length > 0) {
      await clientSyncRepo.persistClientExternalSnapshots(clientExternal.recordId, postSyncSnapshotPatch);
    }

    console.info("Client external sync completed", {
      operation: OPERATION,
      recordId: clientExternal.recordId,
      provider,
      providerAccountId,
      path: syncResult.path,
      outcome: "success",
      mode: syncResult.mode,
    });

    return successResponse(syncResult.externalCustomerId, syncResult.mode);
  } catch (error) {
    console.error("Client external sync failed", {
      operation: OPERATION,
      recordId: clientExternal.recordId,
      provider,
      providerAccountId,
      path: requestedPath,
      outcome: "failed",
      error: error instanceof Error ? error.message : "Unknown error",
    });
    throw error;
  }
}

export async function runClientSync(body: unknown) {
  const recordId = parseSyncRecordId(body);
  return runClientExternalSync(recordId);
}

