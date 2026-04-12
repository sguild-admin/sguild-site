import { SyncEndpointError } from "@/lib/errors";
import { assertJsonRequest, parseJsonBody } from "@/lib/http/request";
import {
  cancelLesson,
  completeLesson,
  getLessonForOutcome,
  methodNotAllowed,
  recordNoShow,
  toLessonOutcomeFailureResponse,
  type LessonCancellationReason,
  type LessonProcessOutcomeSuccessResponseDto,
  type LessonRequestedOutcome,
} from "@/modules/lessons";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let recordId = "unknown";
  try {
    assertJsonRequest(request);
    const body = (await parseJsonBody(request)) as {
      recordId?: string;
      lessonRecordId?: string;
      idempotencyKey?: string;
    };
    recordId = (body.recordId ?? body.lessonRecordId ?? "").trim();
    if (!recordId) {
      throw new SyncEndpointError("Missing recordId.", 400);
    }

    const lesson = await getLessonForOutcome(recordId);
    if (lesson.requestOutcome !== true) {
      throw new SyncEndpointError("Request Outcome must be checked.", 422);
    }

    const requestedOutcome = (lesson.requestedOutcome ?? "").trim() as LessonRequestedOutcome;
    let response: LessonProcessOutcomeSuccessResponseDto;
    if (requestedOutcome === "Completed") {
      const result = await completeLesson(recordId, {
        outcomeNotes: lesson.outcomeNotes ?? undefined,
        idempotencyKey: body.idempotencyKey?.trim() || undefined,
      });
      response = {
        ok: true,
        endpoint: "/api/lessons/process-outcome",
        recordId,
        result: result.result,
        requestedOutcome,
        reservationResolved: result.reservationResolved,
        reservationResolution: result.reservationResolved ? "Consumed" : null,
        reversalCreated: false,
        writebackStatus: result.writebackStatus,
      };
    } else if (requestedOutcome === "Canceled") {
      const reason = (lesson.cancellationReason ?? "").trim();
      if (!reason) {
        throw new SyncEndpointError(
          "Cancellation Reason is required for Canceled outcome.",
          422,
        );
      }
      const result = await cancelLesson(
        recordId,
        reason as LessonCancellationReason,
        lesson.notes ?? undefined,
        { idempotencyKey: body.idempotencyKey?.trim() || undefined },
      );
      response = {
        ok: true,
        endpoint: "/api/lessons/process-outcome",
        recordId,
        result: result.result,
        requestedOutcome,
        reservationResolved: result.reservationResolved,
        reservationResolution: result.reservationResolution,
        reversalCreated: result.reversalCreated,
        writebackStatus: result.writebackStatus,
      };
    } else if (requestedOutcome === "No-Show") {
      const result = await recordNoShow(recordId, lesson.notes ?? undefined, {
        idempotencyKey: body.idempotencyKey?.trim() || undefined,
      });
      response = {
        ok: true,
        endpoint: "/api/lessons/process-outcome",
        recordId,
        result: result.result,
        requestedOutcome,
        reservationResolved: result.reservationResolved,
        reservationResolution: result.reservationResolution,
        reversalCreated: false,
        writebackStatus: result.writebackStatus,
      };
    } else {
      throw new SyncEndpointError(
        "Requested Outcome must be Completed, Canceled, or No-Show.",
        422,
      );
    }

    return Response.json(response, { status: 200 });
  } catch (error) {
    const { status, body } = toLessonOutcomeFailureResponse(
      "/api/lessons/process-outcome",
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
