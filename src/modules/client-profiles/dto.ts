export type EnsureLessonSummaryRequestDto = {
  profileRecordId: string;
};

export type RecomputeSingleLessonSummaryRequestDto = {
  profileRecordId: string;
  lessonSummaryRecordId?: string;
};

export type RecomputeLessonSummariesRequestDto = {
  pageSize: number;
  maxProfiles: number;
};

export type EnsureLessonSummaryResponse = {
  ok: true;
  profileRecordId: string;
  lessonSummaryRecordId: string;
  result: "created" | "linked_existing" | "already_exists";
};

export type BackfillLessonSummariesResponse = {
  ok: true;
  scanned: number;
  created: number;
  linkedExisting: number;
  alreadyExists: number;
  failed: number;
  failures: Array<{ profileRecordId: string; error: string }>;
};

export type RecomputeLessonSummariesResponse = {
  ok: true;
  scanned: number;
  recomputed: number;
  created: number;
  linkedExisting: number;
  alreadyExists: number;
  failed: number;
  failures: Array<{ profileRecordId: string; error: string }>;
};

export type RecomputeSingleLessonSummaryResponse = {
  ok: true;
  profileRecordId: string;
  lessonSummaryRecordId: string;
  result: "created" | "linked_existing" | "already_exists";
  recomputed: true;
};

export type ClientProfilesErrorResponse = {
  ok: false;
  error: string;
};
