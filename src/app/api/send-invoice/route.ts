import { handleSendInvoice, methodNotAllowed } from "@/modules/invoices";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return handleSendInvoice(request);
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

