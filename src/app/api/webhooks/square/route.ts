import { GET as baseGet, POST as basePost } from "@/app/webhooks/square/route";

export const runtime = "nodejs";

export async function GET() {
	return baseGet();
}

export async function POST(request: Request) {
	return basePost(request);
}
