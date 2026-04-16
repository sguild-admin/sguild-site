import { parseRefundWebhookEvent } from "./schema";
import { parseProcessRefundBody } from "./schema";
import { SyncEndpointError } from "@/lib/errors";
import {
  processRefundExternalFailureFromError,
  runProcessRefundExternal,
} from "@/modules/refund-externals";
import type {
  ProcessRefundFailureResponseDto,
  ProcessRefundSuccessResponseDto,
  ProcessRefundWebhookEventInput,
} from "./dto";

export async function processRefundWebhookEvent(input: ProcessRefundWebhookEventInput) {
  return parseRefundWebhookEvent(input);
}

export async function runProcessRefund(body: unknown): Promise<ProcessRefundSuccessResponseDto> {
  const parsed = parseProcessRefundBody(body);
  const response = await runProcessRefundExternal(parsed);

  return {
    ok: true,
    endpoint: "/api/refunds/process",
    recordId: response.recordId,
    crossedProviderBoundary: response.crossedProviderBoundary,
    providerResult: response.providerResult,
    externalActionId: response.externalActionId,
    externalRefundId: response.externalRefundId,
    writebackStatus: response.writebackStatus,
    idempotencyKey: response.idempotencyKey,
  };
}

export function processRefundFailureFromError(
  error: unknown,
  recordId: string | null,
): { status: number; body: ProcessRefundFailureResponseDto } {
  const mapped = processRefundExternalFailureFromError(error, recordId);
  if (mapped.body.ok) {
    throw new SyncEndpointError("Unexpected success response in failure mapper.", 500, {
      exposeMessage: false,
    });
  }

  return {
    status: mapped.status,
    body: {
      ok: false,
      endpoint: "/api/refunds/process",
      recordId: mapped.body.recordId,
      crossedProviderBoundary: mapped.body.crossedProviderBoundary,
      stage: mapped.body.stage,
      error: mapped.body.error,
      ...(mapped.body.externalActionId ? { externalActionId: mapped.body.externalActionId } : {}),
    },
  };
}
