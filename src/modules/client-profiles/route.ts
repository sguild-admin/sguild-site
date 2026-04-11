import { NextResponse } from "next/server";
import { assertJsonRequest, parseJsonBody } from "@/lib/http/request";
import { SyncEndpointError } from "@/lib/errors";
import { clientSyncRepo } from "@/modules/clients";
import {
  backfillClientProfileLessonSummaries,
  ensureLessonSummaryForClientProfile,
  recomputeAllClientProfileLessonSummaries,
  recomputeClientProfileLessonSummary,
  runClientProfilesWorkflow,
} from "./service";
import {
  parseBackfillLessonSummariesBody,
  parseEnsureLessonSummaryBody,
  parseRecomputeLessonSummariesBody,
  parseRecomputeSingleLessonSummaryBody,
} from "./schema";
import type { ClientProfilesErrorResponse } from "./dto";

export function methodNotAllowed(): NextResponse {
  return NextResponse.json(
    { ok: false, error: "Method Not Allowed" },
    { status: 405, headers: { Allow: "POST" } },
  );
}

function mapClientProfilesError(error: unknown): { status: number; body: ClientProfilesErrorResponse } {
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

export async function handleEnsureLessonSummary(request: Request): Promise<NextResponse> {
  try {
    clientSyncRepo.validateClientsSecret(request);
    assertJsonRequest(request);
    const body = await parseJsonBody(request);
    const parsed = parseEnsureLessonSummaryBody(body);
    const response = await ensureLessonSummaryForClientProfile(parsed.profileRecordId);
    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    const { status, body } = mapClientProfilesError(error);
    return NextResponse.json(body, { status });
  }
}

export async function handleClientProfiles(request: Request): Promise<NextResponse> {
  try {
    clientSyncRepo.validateClientsSecret(request);
    assertJsonRequest(request);
    const body = await parseJsonBody(request);
    const response = await runClientProfilesWorkflow(body);
    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    const { status, body } = mapClientProfilesError(error);
    return NextResponse.json(body, { status });
  }
}

export async function handleBackfillLessonSummaries(request: Request): Promise<NextResponse> {
  try {
    clientSyncRepo.validateClientsSecret(request);
    assertJsonRequest(request);
    const body = await parseJsonBody(request);
    const parsed = parseBackfillLessonSummariesBody(body);
    const response = await backfillClientProfileLessonSummaries(parsed);
    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    const { status, body } = mapClientProfilesError(error);
    return NextResponse.json(body, { status });
  }
}

export async function handleRecomputeAllLessonSummaries(request: Request): Promise<NextResponse> {
  try {
    clientSyncRepo.validateClientsSecret(request);
    assertJsonRequest(request);
    const body = await parseJsonBody(request);
    const parsed = parseRecomputeLessonSummariesBody(body);
    const response = await recomputeAllClientProfileLessonSummaries(parsed);
    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    const { status, body } = mapClientProfilesError(error);
    return NextResponse.json(body, { status });
  }
}

export async function handleRecomputeSingleLessonSummary(request: Request): Promise<NextResponse> {
  try {
    clientSyncRepo.validateClientsSecret(request);
    assertJsonRequest(request);
    const body = await parseJsonBody(request);
    const parsed = parseRecomputeSingleLessonSummaryBody(body);
    const response = await recomputeClientProfileLessonSummary(parsed);
    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    const { status, body } = mapClientProfilesError(error);
    return NextResponse.json(body, { status });
  }
}
