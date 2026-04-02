export type RecomputeLessonSummaryInputDto = {
  profileRecordId: string;
  lessonSummaryRecordId: string;
  lessonRecordIds: string[];
};

export type RecomputeLessonSummaryResultDto = {
  ok: true;
  lessonSummaryRecordId: string;
  recomputedAt: string;
};

export type LessonSummariesErrorResponse = {
  ok: false;
  error: string;
};
