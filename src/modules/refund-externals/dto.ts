export type ProcessRefundExternalRequestDto = {
  recordId: string;
  force: boolean;
  retryExternalActionId: string | null;
  idempotencyKey: string | null;
};

export type ProcessRefundExternalStage =
  | "validation"
  | "provider"
  | "writeback"
  | "ambiguity";

export type ProcessRefundExternalProviderResult = "succeeded" | "noop";
export type ProcessRefundExternalWritebackStatus = "Succeeded" | "Failed" | "Pending";

export type ProcessRefundExternalSuccessResponseDto = {
  ok: true;
  endpoint: "/api/refund-externals/process";
  recordId: string;
  crossedProviderBoundary: boolean;
  providerResult: ProcessRefundExternalProviderResult;
  externalActionId: string;
  externalRefundId: string;
  writebackStatus: ProcessRefundExternalWritebackStatus;
  idempotencyKey: string;
};

export type ProcessRefundExternalFailureResponseDto = {
  ok: false;
  endpoint: "/api/refund-externals/process";
  recordId: string;
  crossedProviderBoundary: boolean;
  stage: ProcessRefundExternalStage;
  error: string;
  externalActionId?: string;
};
