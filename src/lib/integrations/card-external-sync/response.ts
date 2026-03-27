export type CardSyncSuccessResponse = {
  ok: true;
  syncStatus: "Synced";
  cardsFound: number;
};

export type CardSyncErrorResponse = {
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

export function successResponse(cardsFound: number): CardSyncSuccessResponse {
  return {
    ok: true,
    syncStatus: "Synced",
    cardsFound,
  };
}

export function failureFromError(error: unknown): { status: number; body: CardSyncErrorResponse } {
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

