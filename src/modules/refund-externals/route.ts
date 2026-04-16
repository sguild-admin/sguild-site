import { NextResponse } from "next/server";
import { assertJsonRequest, parseJsonBody } from "@/lib/http/request";
import { assertAuthorizedSyncRequest } from "@/modules/integrations";
import {
  processRefundExternalFailureFromError,
  runProcessRefundExternal,
} from "./service";

export function methodNotAllowed(): NextResponse {
  return NextResponse.json(
    { ok: false, error: "Method Not Allowed" },
    { status: 405, headers: { Allow: "POST" } },
  );
}

export async function handleProcessRefundExternal(request: Request): Promise<NextResponse> {
  let recordId: string | null = null;
  try {
    assertAuthorizedSyncRequest(request);
    assertJsonRequest(request);
    const body = await parseJsonBody(request);
    const typed = body as { recordId?: unknown };
    if (typeof typed.recordId === "string" && typed.recordId.trim().length > 0) {
      recordId = typed.recordId.trim();
    }

    const response = await runProcessRefundExternal(body);
    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    const { status, body } = processRefundExternalFailureFromError(error, recordId);
    return NextResponse.json(body, { status });
  }
}
