import { GET as baseGet, POST as basePost } from "@/app/webhooks/meta/route";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return baseGet(request);
}

export async function POST(request: Request) {
  return basePost(request);
}
