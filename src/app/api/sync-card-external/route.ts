import { handleCardExternalSync, methodNotAllowed } from "@/modules/cards/route";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return handleCardExternalSync(request);
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

