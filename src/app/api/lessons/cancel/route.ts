import { SyncEndpointError } from "@/lib/errors";
import { assertJsonRequest, parseJsonBody } from "@/lib/http/request";
import {
  cancelLesson,
  methodNotAllowed,
  toLessonOutcomeFailureResponse,
  type LessonCancellationReason,
} from "@/modules/lessons";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let recordId = "unknown";
  try {
    assertJsonRequest(request);
    const body = (await parseJsonBody(request)) as {
      recordId?: string;
      lessonRecordId?: string;
      cancellationReason?: string;
      notes?: string;
      idempotencyKey?: string;
    };
    recordId = (body.recordId ?? body.lessonRecordId ?? "").trim();
    if (!recordId) {
      throw new SyncEndpointError("Missing recordId.", 400);
    }
    if (!body.cancellationReason || typeof body.cancellationReason !== "string") {
      throw new SyncEndpointError("Missing cancellationReason.", 400);
    }
    const response = await cancelLesson(
      recordId,
      body.cancellationReason.trim() as LessonCancellationReason,
      body.notes?.trim() || undefined,
      { idempotencyKey: body.idempotencyKey?.trim() || undefined },
    );
    return Response.json(response, { status: 200 });
  } catch (error) {
    const { status, body } = toLessonOutcomeFailureResponse(
      "/api/lessons/cancel",
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
