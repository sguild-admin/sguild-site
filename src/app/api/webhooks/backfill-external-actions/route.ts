import { NextResponse } from "next/server";
import { handleBackfillExternalActionsFromWebhookEvents } from "@/modules/webhooks";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return handleBackfillExternalActionsFromWebhookEvents(request);
}

export async function GET() {
  return NextResponse.json(
    { ok: false, error: "Method Not Allowed" },
    { status: 405, headers: { Allow: "POST" } },
  );
}
