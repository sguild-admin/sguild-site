import { SyncEndpointError } from "@/lib/errors";
import { assertJsonRequest, parseJsonBody } from "@/lib/http/request";
import { completeLesson, methodNotAllowed, toLessonOutcomeFailureResponse } from "@/modules/lessons";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let recordId = "unknown";
  try {
    assertJsonRequest(request);
    const body = (await parseJsonBody(request)) as {
      recordId?: string;
      lessonRecordId?: string;
      outcomeNotes?: string;
      idempotencyKey?: string;
    };
    recordId = (body.recordId ?? body.lessonRecordId ?? "").trim();
    if (!recordId) {
      throw new SyncEndpointError("Missing recordId.", 400);
    }
    const response = await completeLesson(recordId, {
      outcomeNotes: body.outcomeNotes?.trim() || undefined,
      idempotencyKey: body.idempotencyKey?.trim() || undefined,
    });
    return Response.json(response, { status: 200 });
  } catch (error) {
    const { status, body } = toLessonOutcomeFailureResponse(
      "/api/lessons/complete",
      error,
      recordId,
    );
    return Response.json(body, { status });
  }
}

export async function GET() {
  return methodNotAllowed();
}

export async function PUT() {
  return methodNotAllowed();
}

export async function PATCH() {
  return methodNotAllowed();
}

export async function DELETE() {
  return methodNotAllowed();
}
