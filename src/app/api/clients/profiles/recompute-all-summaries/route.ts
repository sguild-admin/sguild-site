import { handleRecomputeAllLessonSummaries, methodNotAllowed } from "@/modules/client-profiles";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return handleRecomputeAllLessonSummaries(request);
}

export async function GET() {
  return methodNotAllowed();
}



