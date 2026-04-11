import type { RetryClassification } from "./retry-classification";
export type { RetryClassification } from "./retry-classification";

export type ExternalActionEntityType = "Client" | "Card" | "Order" | "Refund";

export type ExternalActionType =
  | "Create"
  | "Send"
  | "Refresh"
  | "Void"
  | "Import"
  | "Webhook"
  | "Reconcile"
  | "Retry";

export type ExternalActionDirection = "Outbound" | "Inbound";
export type ExternalActionTriggerSource =
  | "Manual"
  | "Automation"
  | "Webhook"
  | "Script"
  | "Backfill";
export type ExternalActionStatus = "Pending" | "Succeeded" | "Failed" | "Ignored";
export type ExternalActionWritebackStatus = "Not Started" | "Pending" | "Succeeded" | "Failed";

export type CreateExternalActionDto = {
  externalEntityType: ExternalActionEntityType;
  actionType: ExternalActionType;
  direction: ExternalActionDirection;
  triggerSource?: ExternalActionTriggerSource;
  occurredAt?: string;
  status?: ExternalActionStatus;
  attemptNumber?: number;
  retryable?: boolean;
  retryClassification?: RetryClassification;
  notes?: string;
  orgIntegrationRecordId?: string;
  providerAccountRecordId?: string;
  clientExternalRecordId?: string;
  cardExternalRecordId?: string;
  orderExternalRecordId?: string;
  refundExternalRecordId?: string;
  provider?: string;
  providerEventType?: string;
  providerReferenceId?: string;
  httpStatusCode?: number;
  errorSummary?: string;
  requestPayload?: string;
  responsePayload?: string;
  rawProviderPayload?: string;
  writebackStatus?: ExternalActionWritebackStatus;
  writebackSucceededAt?: string;
  writebackError?: string;
  writebackRetryCount?: number;
  writebackLastAttemptAt?: string;
};

export type UpdateExternalActionDto = Partial<CreateExternalActionDto> & {
  recordId: string;
};

export type FindInboundExternalActionDto = {
  provider: string;
  providerReferenceId: string;
  providerAccountRecordId?: string;
};

export type CountExternalActionsByExternalDto = {
  externalLinkType: "Client External" | "Card External" | "Order External" | "Refund External";
  externalRecordId: string;
  direction?: ExternalActionDirection;
};

export type ExternalActionRecordDto = {
  recordId: string;
  externalEntityType: ExternalActionEntityType | null;
  actionType: ExternalActionType | null;
  direction: ExternalActionDirection | null;
  status: ExternalActionStatus | null;
  attemptNumber: number | null;
  provider: string | null;
  providerReferenceId: string | null;
  providerAccountRecordId: string | null;
};

export type SyncExternalActionRequestDto = {
  recordId: string;
  force?: boolean;
  retryExternalActionId?: string;
  idempotencyKey?: string;
};

export type RetryExternalActionRequestDto = {
  recordId: string;
  force?: boolean;
  idempotencyKey?: string;
};

export type SyncExternalActionStage = "validation" | "provider" | "writeback" | "ambiguity";
export type SyncExternalActionProviderResult = "succeeded" | "failed" | "ignored" | "noop";
export type SyncExternalActionWritebackStatus = "Succeeded" | "Failed" | "Pending";

export type SyncExternalActionSuccessResponseDto = {
  ok: true;
  endpoint: "/api/external-actions/sync";
  recordId: string;
  crossedProviderBoundary: boolean;
  providerResult: SyncExternalActionProviderResult;
  externalActionId: string;
  writebackStatus: SyncExternalActionWritebackStatus;
  idempotencyKey: string;
};

export type SyncExternalActionFailureResponseDto = {
  ok: false;
  endpoint: "/api/external-actions/sync";
  recordId: string;
  crossedProviderBoundary: boolean;
  stage: SyncExternalActionStage;
  error: string;
  externalActionId: string;
};

export type RetryExternalActionSuccessResponseDto = {
  ok: true;
  endpoint: "/api/external-actions/retry";
  recordId: string;
  crossedProviderBoundary: boolean;
  providerResult: SyncExternalActionProviderResult;
  externalActionId: string;
  writebackStatus: SyncExternalActionWritebackStatus;
  idempotencyKey: string;
};

export type RetryExternalActionFailureResponseDto = {
  ok: false;
  endpoint: "/api/external-actions/retry";
  recordId: string;
  crossedProviderBoundary: boolean;
  stage: SyncExternalActionStage;
  error: string;
  externalActionId: string;
};

export type ExternalActionsRequestDto =
  | { operation: "create"; payload: CreateExternalActionDto }
  | { operation: "update"; payload: UpdateExternalActionDto }
  | { operation: "find_inbound_by_identity"; payload: FindInboundExternalActionDto }
  | { operation: "count_by_external"; payload: CountExternalActionsByExternalDto };

export type ExternalActionsResponseDto =
  | { ok: true; operation: "create"; recordId: string }
  | { ok: true; operation: "update"; recordId: string }
  | { ok: true; operation: "find_inbound_by_identity"; record: ExternalActionRecordDto | null }
  | { ok: true; operation: "count_by_external"; count: number };

export type ExternalActionsErrorResponseDto = {
  ok: false;
  error: string;
};
