import {
  handleMetaWebhookGet,
  handleMetaWebhookPost,
} from "@/modules/webhooks";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return handleMetaWebhookGet(request);
}

export async function POST(request: Request) {
  return handleMetaWebhookPost(request);
}

