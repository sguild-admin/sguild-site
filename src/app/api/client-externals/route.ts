import { handleClientExternals, methodNotAllowed } from "@/modules/client-externals";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return handleClientExternals(request);
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
