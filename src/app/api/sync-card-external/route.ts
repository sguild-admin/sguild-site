import { NextResponse } from "next/server";

import { validateAirtableSecret } from "@/lib/integrations/card-external-sync/auth";
import { failureFromError, SyncEndpointError } from "@/lib/integrations/card-external-sync/response";
import { runCardExternalSync } from "@/lib/integrations/card-external-sync/service";

export const runtime = "nodejs";

type SyncCardExternalRequestBody = {
  recordId?: unknown;
};

function methodNotAllowed(): NextResponse {
  return NextResponse.json(
    { ok: false, error: "Method Not Allowed" },
    { status: 405, headers: { Allow: "POST" } },
  );
}

function parseSyncCardExternalRequest(body: unknown): string {
  if (typeof body !== "object" || body == null || Array.isArray(body)) {
    throw new SyncEndpointError("Invalid request body.", 400);
  }

  const { recordId } = body as SyncCardExternalRequestBody;
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

    parsedRecordId = parseSyncCardExternalRequest(body);
    const response = await runCardExternalSync(parsedRecordId);
    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    const { status, body } = failureFromError(error);
    console.error("Card external sync failed", {
      operation: "sync_card_external",
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

