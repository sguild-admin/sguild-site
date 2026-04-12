import { handleLessonDebit, methodNotAllowed } from "@/modules/lesson-debit";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return handleLessonDebit(request);
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
