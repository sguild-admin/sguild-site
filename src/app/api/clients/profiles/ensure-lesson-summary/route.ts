import { NextResponse } from "next/server";
import { assertJsonRequest, parseJsonBody } from "@/lib/http/request";
import { validateClientsSecret } from "@/modules/clients/client.repo";
import { ensureLessonSummaryForClientProfile } from "@/modules/clients/profile.service";
import { parseEnsureLessonSummaryBody } from "@/modules/clients/profile.schema";
import { SyncEndpointError } from "@/lib/errors";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    validateClientsSecret(request);
    assertJsonRequest(request);
    const body = await parseJsonBody(request);
    const parsed = parseEnsureLessonSummaryBody(body);
    const response = await ensureLessonSummaryForClientProfile(parsed.profileRecordId);
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
