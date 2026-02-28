import crypto from "crypto";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

function timingSafeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

export async function GET(request: Request) {
  const verifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN;
  if (!verifyToken) {
    return NextResponse.json(
      { error: "META_WEBHOOK_VERIFY_TOKEN is not configured." },
      { status: 500 },
    );
  }

  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === verifyToken && challenge) {
    return new NextResponse(challenge, { status: 200 });
  }

  return new NextResponse(null, { status: 403 });
}

export async function POST(request: Request) {
  const appSecret = process.env.META_APP_SECRET;
  if (!appSecret) {
    return NextResponse.json(
      { error: "META_APP_SECRET is not configured." },
      { status: 500 },
    );
  }

  // Use raw body bytes for signature verification before JSON parsing.
  const rawBody = await request.text();
  const signature = request.headers.get("x-hub-signature-256") ?? "";
  const expected =
    "sha256=" + crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex");

  if (!timingSafeEqual(expected, signature)) {
    return new NextResponse(null, { status: 401 });
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const payload = body as {
    entry?: Array<{
      id?: string;
      changes?: Array<{
        field?: string;
        value?: { leadgen_id?: string; page_id?: string };
      }>;
    }>;
  };

  // Acknowledge success. Any heavy downstream processing should be queued.
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field === "leadgen") {
        const leadgenId = change.value?.leadgen_id;
        const pageId = change.value?.page_id ?? entry.id;
        console.log("Meta leadgen webhook event received", { leadgenId, pageId });
        // enqueue job: fetchLeadDetails({ leadgenId, pageId })
      }
    }
  }

  return new NextResponse(null, { status: 200 });
}
