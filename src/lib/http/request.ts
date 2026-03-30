import { SyncEndpointError } from "@/lib/errors";

export function assertJsonRequest(request: Request): void {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new SyncEndpointError("Content-Type must be application/json.", 400);
  }
}

export async function parseJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new SyncEndpointError("Invalid JSON payload.", 400);
  }
}
