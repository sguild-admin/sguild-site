import {
  handleSquareWebhookGet,
  handleSquareWebhookPost,
} from "@/modules/webhooks/route";

export const runtime = "nodejs";

export async function GET() {
  return handleSquareWebhookGet();
}

export async function POST(request: Request) {
  return handleSquareWebhookPost(request);
}
