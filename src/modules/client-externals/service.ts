import { NextResponse } from "next/server";
import { assertJsonRequest, parseJsonBody } from "@/lib/http/request";
import { SyncEndpointError } from "@/lib/errors";
import { assertAuthorizedSyncRequest } from "@/modules/integrations";
import type {
  ClientExternalsErrorResponseDto,
  ClientExternalsResponseDto,
} from "./dto";
import { clientExternalsRepo } from "./repo";
import { parseClientExternalsRequestBody } from "./schema";

function toErrorResponse(
  error: unknown,
): { status: number; body: ClientExternalsErrorResponseDto } {
  if (error instanceof SyncEndpointError) {
    return {
      status: error.status,
      body: {
        ok: false,
        error: error.exposeMessage ? error.message : "Unexpected server error.",
      },
    };
  }

  return {
    status: 500,
    body: {
      ok: false,
      error: error instanceof Error ? error.message : "Unexpected server error.",
    },
  };
}

export async function runClientExternalsWorkflow(body: unknown): Promise<ClientExternalsResponseDto> {
  const parsed = parseClientExternalsRequestBody(body);

  if (parsed.operation === "create") {
    const record = await clientExternalsRepo.createClientExternal(parsed.payload);
    return { ok: true, operation: "create", record };
  }

  if (parsed.operation === "update") {
    const record = await clientExternalsRepo.updateClientExternal(parsed.payload);
    return { ok: true, operation: "update", record };
  }

  if (parsed.operation === "get") {
    const record = await clientExternalsRepo.getClientExternal(parsed.payload.recordId);
    return { ok: true, operation: "get", record };
  }

  if (parsed.operation === "sync_all") {
    const result = await clientExternalsRepo.syncAllClientExternalPhoneSnapshots(parsed.payload);
    return { ok: true, operation: "sync_all", result, dryRun: parsed.payload.dryRun === true };
  }

  const record = await clientExternalsRepo.findClientExternalByContext(parsed.payload);
  return { ok: true, operation: "find_by_context", record };
}

export async function handleClientExternals(request: Request): Promise<NextResponse> {
  try {
    assertAuthorizedSyncRequest(request);
    assertJsonRequest(request);
    const body = await parseJsonBody(request);
    const response = await runClientExternalsWorkflow(body);
    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    const { status, body } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
