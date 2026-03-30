import { NextResponse } from "next/server";
import { assertJsonRequest, parseJsonBody } from "@/lib/http/request";
import { validateClientsSecret } from "@/modules/clients/client.repo";
import { recomputeAllClientProfileLessonSummaries } from "@/modules/clients/profile.service";
import { parseRecomputeLessonSummariesBody } from "@/modules/clients/profile.schema";
import { SyncEndpointError } from "@/lib/errors";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    validateClientsSecret(request);
    assertJsonRequest(request);
    const body = await parseJsonBody(request);
    const parsed = parseRecomputeLessonSummariesBody(body);
    const response = await recomputeAllClientProfileLessonSummaries(parsed);
    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    if (error instanceof SyncEndpointError) {
      return NextResponse.json(
        { ok: false, error: error.exposeMessage ? error.message : "Unexpected server error." },
        { status: error.status },
      );
    }

    return NextResponse.json({ ok: false, error: "Unexpected server error." }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json(
    { ok: false, error: "Method Not Allowed" },
    { status: 405, headers: { Allow: "POST" } },
  );
}

