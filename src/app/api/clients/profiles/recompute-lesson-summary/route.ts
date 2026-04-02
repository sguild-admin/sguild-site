import {
  handleRecomputeSingleLessonSummary,
  methodNotAllowed,
} from "@/modules/client-profiles";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return handleRecomputeSingleLessonSummary(request);
}

export async function GET() {
  return methodNotAllowed();
}



