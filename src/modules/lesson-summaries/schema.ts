import { SyncEndpointError } from "@/lib/errors";
import type { RecomputeLessonSummaryInputDto } from "./dto";

type RecomputeLessonSummaryBody = {
  profileRecordId?: unknown;
  lessonSummaryRecordId?: unknown;
  lessonRecordIds?: unknown;
};

export function parseRecomputeLessonSummaryBody(
  body: unknown,
): RecomputeLessonSummaryInputDto {
  if (typeof body !== "object" || body == null || Array.isArray(body)) {
    throw new SyncEndpointError("Invalid request body.", 400);
  }

  const typed = body as RecomputeLessonSummaryBody;
  const profileRecordId =
    typeof typed.profileRecordId === "string" ? typed.profileRecordId.trim() : "";
  const lessonSummaryRecordId =
    typeof typed.lessonSummaryRecordId === "string"
      ? typed.lessonSummaryRecordId.trim()
      : "";

  if (!profileRecordId) {
    throw new SyncEndpointError("Missing profileRecordId.", 400);
  }
  if (!lessonSummaryRecordId) {
    throw new SyncEndpointError("Missing lessonSummaryRecordId.", 400);
  }
  if (!Array.isArray(typed.lessonRecordIds)) {
    throw new SyncEndpointError("Missing lessonRecordIds.", 400);
  }

  const lessonRecordIds = typed.lessonRecordIds
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter((value) => value.length > 0);

  if (lessonRecordIds.length === 0) {
    throw new SyncEndpointError("Missing lessonRecordIds.", 400);
  }

  return {
    profileRecordId,
    lessonSummaryRecordId,
    lessonRecordIds,
  };
}
