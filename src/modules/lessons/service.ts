import type { LessonsNotImplementedResponse } from "./dto";

export function getLessonsNotImplementedResponse(): LessonsNotImplementedResponse {
  return {
    ok: false,
    error: "Lessons module is not implemented yet.",
  };
}
