import { handleEnsureLessonSummary, methodNotAllowed } from "@/modules/client-profiles";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return handleEnsureLessonSummary(request);
}

export async function GET() {
  return methodNotAllowed();
}


