export type SyncMode = "created" | "updated" | "verified";

export type SyncRecordRequestDto = {
  recordId: string;
};

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
