export type SyncMode = "created" | "updated" | "verified";

export type SyncSuccessResponse = {
  ok: true;
  syncStatus: "Synced";
  externalCustomerId: string;
  mode: SyncMode;
};

export type SyncErrorResponse = {
  ok: false;
  error: string;
};

export class SyncEndpointError extends Error {
  readonly status: number;
  readonly exposeMessage: boolean;

  constructor(message: string, status: number, options?: { exposeMessage?: boolean }) {
    super(message);
    this.name = "SyncEndpointError";
    this.status = status;
    this.exposeMessage = options?.exposeMessage ?? true;
  }
}

export function successResponse(
  externalCustomerId: string,
  mode: SyncMode,
): SyncSuccessResponse {
  return {
    ok: true,
    syncStatus: "Synced",
    externalCustomerId,
    mode,
  };
}

export function failureFromError(error: unknown): { status: number; body: SyncErrorResponse } {
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

