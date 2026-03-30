import { NextResponse } from "next/server";
import { assertJsonRequest, parseJsonBody } from "@/lib/http/request";
import { validateClientsSecret } from "./client.repo";
import { mapClientSyncError, runClientSync } from "./client.service";

export function methodNotAllowed(): NextResponse {
  return NextResponse.json(
    { ok: false, error: "Method Not Allowed" },
    { status: 405, headers: { Allow: "POST" } },
  );
}

export async function handleClientExternalSync(request: Request) {
  let parsedBody: unknown;
  try {
    validateClientsSecret(request);
    assertJsonRequest(request);
    parsedBody = await parseJsonBody(request);
    const response = await runClientSync(parsedBody);
    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    const { status, body } = mapClientSyncError(error);
    return NextResponse.json(body, { status });
  }
}
