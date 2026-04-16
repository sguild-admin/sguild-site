import { NextResponse } from "next/server";
import { SyncEndpointError } from "@/lib/errors";
import { assertJsonRequest, parseJsonBody } from "@/lib/http/request";
import { parseRefundItemRecordIdBody } from "./schema";
import { getRefundItem } from "./service";
import type { RefundItemScaffoldErrorResponseDto } from "./dto";

export function methodNotAllowed(): NextResponse {
  return NextResponse.json(
    { ok: false, error: "Method Not Allowed" },
    { status: 405, headers: { Allow: "POST" } },
  );
}

function mapRefundItemsError(
  error: unknown,
): { status: number; body: RefundItemScaffoldErrorResponseDto } {
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

export async function handleRefundItemRead(request: Request): Promise<NextResponse> {
  try {
    assertJsonRequest(request);
    const body = await parseJsonBody(request);
    const parsed = parseRefundItemRecordIdBody(body);
    const response = await getRefundItem(parsed.recordId);
    return NextResponse.json({ ok: true, refundItem: response }, { status: 200 });
  } catch (error) {
    const { status, body } = mapRefundItemsError(error);
    return NextResponse.json(body, { status });
  }
}
