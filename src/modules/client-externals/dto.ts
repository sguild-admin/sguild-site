export type ClientExternalStatus = "Active" | "Inactive" | "Failed" | "Pending";
export type ClientExternalSyncStatus = "Not Synced" | "Pending" | "Synced" | "Failed";

export type ClientExternalRecordDto = {
  recordId: string;
  externalCustomerId: string | null;
  status: ClientExternalStatus | null;
  notes: string | null;
  clientRecordId: string | null;
  providerAccountRecordId: string | null;
  provider: string | null;
  externalActionIds: string[];
  cardExternalIds: string[];
  nameSnapshot: string | null;
  phoneSnapshot: string | null;
  syncStatus: ClientExternalSyncStatus | null;
  syncError: string | null;
  lastSyncedAt: string | null;
  lastSuccessfulCallAt: string | null;
  lastErrorAt: string | null;
  hasException: boolean;
  exceptionReason: string | null;
};

export type CreateClientExternalDto = {
  clientRecordId: string;
  providerAccountRecordId: string;
  externalCustomerId?: string;
  status?: ClientExternalStatus;
  notes?: string;
  nameSnapshot?: string;
  phoneSnapshot?: string;
  syncStatus?: ClientExternalSyncStatus;
  syncError?: string;
  lastSyncedAt?: string;
  lastSuccessfulCallAt?: string;
  lastErrorAt?: string;
};

export type UpdateClientExternalDto = {
  recordId: string;
  externalCustomerId?: string;
  status?: ClientExternalStatus;
  notes?: string;
  nameSnapshot?: string;
  phoneSnapshot?: string;
  syncStatus?: ClientExternalSyncStatus;
  syncError?: string;
  lastSyncedAt?: string;
  lastSuccessfulCallAt?: string;
  lastErrorAt?: string;
};

export type FindClientExternalByContextDto = {
  clientRecordId: string;
  providerAccountRecordId: string;
};

export type SyncAllClientExternalsDto = {
  dryRun?: boolean;
};

export type SyncAllClientExternalsResultDto = {
  scanned: number;
  updated: number;
  skippedNoClient: number;
  skippedNoPhoneOnClient: number;
  skippedHasPhoneSnapshot: number;
};

export type ClientExternalsRequestDto =
  | { operation: "create"; payload: CreateClientExternalDto }
  | { operation: "update"; payload: UpdateClientExternalDto }
  | { operation: "get"; payload: { recordId: string } }
  | { operation: "find_by_context"; payload: FindClientExternalByContextDto }
  | { operation: "sync_all"; payload: SyncAllClientExternalsDto };

export type ClientExternalsResponseDto =
  | { ok: true; operation: "create"; record: ClientExternalRecordDto }
  | { ok: true; operation: "update"; record: ClientExternalRecordDto }
  | { ok: true; operation: "get"; record: ClientExternalRecordDto }
  | { ok: true; operation: "find_by_context"; record: ClientExternalRecordDto | null }
  | { ok: true; operation: "sync_all"; result: SyncAllClientExternalsResultDto; dryRun: boolean };

export type ClientExternalsErrorResponseDto = {
  ok: false;
  error: string;
};
