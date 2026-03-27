import { getClientExternalRecord } from "./airtable";
import { resolveSquareContext } from "./provider-context";
import { successResponse, SyncEndpointError, SyncSuccessResponse } from "./response";
import { syncSquareCustomer } from "./square";

const OPERATION = "sync_client_external";

function assertOperationalPrerequisites(record: {
  providerAccountId: string | null;
  clientId: string | null;
  missingRequiredLinks: string | null;
  nameSnapshot: string | null;
  clientCanonicalName: string | null;
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

  if (!record.nameSnapshot && !record.clientCanonicalName) {
    throw new SyncEndpointError(
      "Missing customer identity: Name Snapshot or linked Clients.Client Name is required.",
      422,
    );
  }
}

export async function runClientExternalSync(recordId: string): Promise<SyncSuccessResponse> {
  const clientExternal = await getClientExternalRecord(recordId);
  assertOperationalPrerequisites(clientExternal);
  const effectiveNameSnapshot = clientExternal.nameSnapshot ?? clientExternal.clientCanonicalName;
  const syncInput = {
    ...clientExternal,
    nameSnapshot: effectiveNameSnapshot,
  };

  const requestedPath = clientExternal.externalCustomerId ? "update_or_verify" : "create";

  let provider: string | null = clientExternal.provider ?? null;
  let providerAccountId: string | null = clientExternal.providerAccountId ?? null;

  try {
    const squareContext = resolveSquareContext(syncInput);
    provider = squareContext.provider;
    providerAccountId = squareContext.providerAccountId;

    const syncResult = await syncSquareCustomer(syncInput, squareContext);

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
