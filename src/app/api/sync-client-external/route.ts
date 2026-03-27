import { NextResponse } from "next/server";

import { validateAirtableSecret } from "@/lib/integrations/client-external-sync/auth";
import { failureFromError, SyncEndpointError } from "@/lib/integrations/client-external-sync/response";
import { runClientExternalSync } from "@/lib/integrations/client-external-sync/service";

export const runtime = "nodejs";

type SyncClientExternalRequestBody = {
  recordId?: unknown;
};

function methodNotAllowed(): NextResponse {
  return NextResponse.json(
    { ok: false, error: "Method Not Allowed" },
    { status: 405, headers: { Allow: "POST" } },
  );
}

function parseSyncClientExternalRequest(body: unknown): string {
  if (typeof body !== "object" || body == null || Array.isArray(body)) {
    throw new SyncEndpointError("Invalid request body.", 400);
  }

  const { recordId } = body as SyncClientExternalRequestBody;
  if (typeof recordId !== "string" || recordId.trim().length === 0) {
    throw new SyncEndpointError("Missing recordId.", 400);
  }

  return recordId.trim();
}

export async function POST(request: Request) {
  let parsedRecordId: string | null = null;

  try {
    validateAirtableSecret(request);
    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().includes("application/json")) {
      throw new SyncEndpointError("Content-Type must be application/json.", 400);
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new SyncEndpointError("Invalid JSON payload.", 400);
    }

    parsedRecordId = parseSyncClientExternalRequest(body);
    const response = await runClientExternalSync(parsedRecordId);
    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    const { status, body } = failureFromError(error);

    console.error("Client external sync failed", {
      operation: "sync_client_external",
      recordId: parsedRecordId,
      status,
      error: error instanceof Error ? error.message : "Unknown error",
    });

    return NextResponse.json(body, { status });
  }
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
