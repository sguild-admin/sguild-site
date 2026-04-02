import {
  handleSquareWebhookGet,
  handleSquareWebhookPost,
} from "@/modules/webhooks";

export const runtime = "nodejs";

export async function GET() {
  return handleSquareWebhookGet();
}

export async function POST(request: Request) {
  return handleSquareWebhookPost(request);
}

