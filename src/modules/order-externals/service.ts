import { NextResponse } from "next/server";
import { assertJsonRequest, parseJsonBody } from "@/lib/http/request";
import { SyncEndpointError } from "@/lib/errors";
import { assertAuthorizedSyncRequest } from "@/modules/integrations";
import type {
  OrderExternalsErrorResponseDto,
  OrderExternalsResponseDto,
} from "./dto";
import { orderExternalsRepo } from "./repo";
import { parseOrderExternalsRequestBody } from "./schema";

function toErrorResponse(
  error: unknown,
): { status: number; body: OrderExternalsErrorResponseDto } {
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
      error: error instanceof Error ? error.message : "Unexpected server error.",
    },
  };
}

export async function runOrderExternalsWorkflow(body: unknown): Promise<OrderExternalsResponseDto> {
  const parsed = parseOrderExternalsRequestBody(body);

  if (parsed.operation === "create") {
    const record = await orderExternalsRepo.createOrderExternal(parsed.payload);
    return { ok: true, operation: "create", record };
  }
  if (parsed.operation === "update") {
    const record = await orderExternalsRepo.updateOrderExternal(parsed.payload);
    return { ok: true, operation: "update", record };
  }
  if (parsed.operation === "get") {
    const record = await orderExternalsRepo.getOrderExternal(parsed.payload.recordId);
    return { ok: true, operation: "get", record };
  }
  if (parsed.operation === "find_by_order") {
    const records = await orderExternalsRepo.findOrderExternalsByOrder(parsed.payload.orderRecordId);
    return { ok: true, operation: "find_by_order", records };
  }

  const record = await orderExternalsRepo.findOrderExternalByExternalIds(parsed.payload);
  return { ok: true, operation: "find_by_external_ids", record };
}

export async function handleOrderExternals(request: Request): Promise<NextResponse> {
  try {
    assertAuthorizedSyncRequest(request);
    assertJsonRequest(request);
    const body = await parseJsonBody(request);
    const response = await runOrderExternalsWorkflow(body);
    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    const { status, body } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}

