import { handleBackfillLessonSummaries, methodNotAllowed } from "@/modules/client-profiles";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return handleBackfillLessonSummaries(request);
}

export async function GET() {
  return methodNotAllowed();
}


