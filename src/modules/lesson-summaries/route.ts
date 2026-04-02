import { NextResponse } from "next/server";
import { assertJsonRequest, parseJsonBody } from "@/lib/http/request";
import { SyncEndpointError } from "@/lib/errors";
import { clientSyncRepo } from "@/modules/clients";
import { parseRecomputeLessonSummaryBody } from "./schema";
import { recomputeLessonSummary } from "./service";
import type { LessonSummariesErrorResponse } from "./dto";

export function methodNotAllowed(): NextResponse {
  return NextResponse.json(
    { ok: false, error: "Method Not Allowed" },
    { status: 405, headers: { Allow: "POST" } },
  );
}

function mapLessonSummariesError(
  error: unknown,
): { status: number; body: LessonSummariesErrorResponse } {
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

export async function handleRecomputeLessonSummary(request: Request): Promise<NextResponse> {
  try {
    clientSyncRepo.validateClientsSecret(request);
    assertJsonRequest(request);
    const body = await parseJsonBody(request);
    const parsed = parseRecomputeLessonSummaryBody(body);
    const response = await recomputeLessonSummary(parsed);
    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    const { status, body } = mapLessonSummariesError(error);
    return NextResponse.json(body, { status });
  }
}
