export type CardSyncRequestDto = {
  recordId: string;
};

export type CardSyncSuccessResponse = {
  ok: true;
  syncStatus: "Synced";
  cardsFound: number;
};

export type CardSyncErrorResponse = {
  ok: false;
  error: string;
};

export type CardSyncResponse = CardSyncSuccessResponse | CardSyncErrorResponse;

