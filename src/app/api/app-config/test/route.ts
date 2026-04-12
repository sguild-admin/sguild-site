import {
  handleAppConfigTestGet,
  handleAppConfigTestPost,
  methodNotAllowed,
} from "@/modules/app-config";

export const runtime = "nodejs";

export async function GET() {
  return handleAppConfigTestGet();
}

export async function POST(request: Request) {
  return handleAppConfigTestPost(request);
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
