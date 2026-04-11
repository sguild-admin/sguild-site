import { NextResponse } from "next/server";
import { assertJsonRequest, parseJsonBody } from "@/lib/http/request";
import { runGrantCredits } from "@/modules/orders/grant-credits";
import { parseGrantCreditsBody } from "@/modules/orders/schema";
import { SyncEndpointError } from "@/lib/errors";
import type { GrantCreditsResponse } from "@/modules/orders/dto";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<NextResponse<GrantCreditsResponse>> {
  try {
    assertJsonRequest(request);
    const body = await parseJsonBody(request);
    const parsedRequest = parseGrantCreditsBody(body);
    const response = await runGrantCredits(parsedRequest);
    return NextResponse.json(response, { status: response.ok ? 200 : 422 });
  } catch (error) {
    let statusCode = 500;
    let errorMessage = "Unexpected server error";
    let recordId = "unknown";

    if (error instanceof SyncEndpointError) {
      statusCode = error.status;
      errorMessage = error.message;
    } else if (error instanceof Error) {
      errorMessage = error.message;
    }

    const response: GrantCreditsResponse = {
      ok: false,
      endpoint: "/orders/grant-credits",
      recordId,
      stage: "validation",
      error: errorMessage,
    };

    return NextResponse.json(response, { status: statusCode });
  }
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json(
    { ok: false, error: "Method Not Allowed" },
    { status: 405, headers: { Allow: "POST" } },
  );
}
