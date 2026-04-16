export type ProcessRefundWebhookEventInput = {
  eventType: string;
  providerEventId: string;
  merchantId: string | null;
  occurredAt: string | null;
  payloadJson: string;
};

export type RefundEvent = {
  provider: "Square";
  eventType: "invoice.refunded" | "refund.updated";
  providerEventId: string;
  merchantId: string | null;
  occurredAt: string | null;
  payloadJson: string;
};

export type ProcessRefundRequestDto = {
  recordId: string;
  force: boolean;
  retryExternalActionId: string | null;
  idempotencyKey: string | null;
};

export type ProcessRefundStage = "validation" | "provider" | "writeback" | "ambiguity";

export type ProcessRefundProviderResult = "succeeded" | "noop";
export type ProcessRefundWritebackStatus = "Succeeded" | "Failed" | "Pending";

export type ProcessRefundSuccessResponseDto = {
  ok: true;
  endpoint: "/api/refunds/process";
  recordId: string;
  crossedProviderBoundary: boolean;
  providerResult: ProcessRefundProviderResult;
  externalActionId: string;
  externalRefundId: string;
  writebackStatus: ProcessRefundWritebackStatus;
  idempotencyKey: string;
};

export type ProcessRefundFailureResponseDto = {
  ok: false;
  endpoint: "/api/refunds/process";
  recordId: string;
  crossedProviderBoundary: boolean;
  stage: ProcessRefundStage;
  error: string;
  externalActionId?: string;
};
