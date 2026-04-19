import { NextResponse } from "next/server";
import { assertJsonRequest, parseJsonBody } from "@/lib/http/request";
import { cardExternalsRepo } from "./repo";
import { mapCardSyncError, runCardSync } from "./service";

export function methodNotAllowed(): NextResponse {
  return NextResponse.json(
    { ok: false, error: "Method Not Allowed" },
    { status: 405, headers: { Allow: "POST" } },
  );
}

export async function handleCardExternalSync(request: Request) {
  let parsedBody: unknown;
  try {
    cardExternalsRepo.validateCardExternalsSecret(request);
    assertJsonRequest(request);
    parsedBody = await parseJsonBody(request);
    const response = await runCardSync(parsedBody);
    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    const { status, body } = mapCardSyncError(error);
    return NextResponse.json(body, { status });
  }
}
