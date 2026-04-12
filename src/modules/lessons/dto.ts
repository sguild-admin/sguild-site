export type LessonCancellationReason =
  | "Client Canceled"
  | "Coach Canceled"
  | "Bad Weather"
  | "Access Issue"
  | "Scheduling Error"
  | "Duplicate Lesson";

export type LessonRequestedOutcome = "Completed" | "Canceled" | "No-Show";

export type LessonOutcomeFailureStage =
  | "validation"
  | "execution"
  | "writeback"
  | "ambiguity";

export type LessonCompleteSuccessResponseDto = {
  ok: true;
  endpoint: "/api/lessons/complete";
  recordId: string;
  result: "succeeded" | "noop";
  reservationResolved: boolean;
  writebackStatus: "Succeeded" | "Failed";
};

export type LessonCancelSuccessResponseDto = {
  ok: true;
  endpoint: "/api/lessons/cancel";
  recordId: string;
  result: "succeeded" | "noop";
  reservationResolved: boolean;
  reservationResolution: "Consumed" | "Released" | null;
  reversalCreated: boolean;
  writebackStatus: "Succeeded" | "Failed";
};

export type LessonNoShowSuccessResponseDto = {
  ok: true;
  endpoint: "/api/lessons/no-show";
  recordId: string;
  result: "succeeded" | "noop";
  reservationResolved: boolean;
  reservationResolution: "Consumed" | "Released" | null;
  writebackStatus: "Succeeded" | "Failed";
};

export type LessonProcessOutcomeSuccessResponseDto = {
  ok: true;
  endpoint: "/api/lessons/process-outcome";
  recordId: string;
  result: "succeeded" | "noop";
  requestedOutcome: LessonRequestedOutcome;
  reservationResolved: boolean;
  reservationResolution: "Consumed" | "Released" | null;
  reversalCreated: boolean;
  writebackStatus: "Succeeded" | "Failed";
};

export type LessonOutcomeFailureResponseDto = {
  ok: false;
  endpoint:
    | "/api/lessons/complete"
    | "/api/lessons/cancel"
    | "/api/lessons/no-show"
    | "/api/lessons/process-outcome";
  recordId: string;
  stage: LessonOutcomeFailureStage;
  error: string;
};
