import { NextResponse } from "next/server";
import { assertJsonRequest, parseJsonBody } from "@/lib/http/request";
import { SyncEndpointError } from "@/lib/errors";
import { assertAuthorizedSyncRequest } from "@/modules/integrations";
import type {
  ProviderAccountsErrorResponseDto,
  ProviderAccountsResponseDto,
} from "./dto";
import { providerAccountsRepo } from "./repo";
import { parseProviderAccountsRequestBody } from "./schema";

function toErrorResponse(
  error: unknown,
): { status: number; body: ProviderAccountsErrorResponseDto } {
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

export async function runProviderAccountsWorkflow(body: unknown): Promise<ProviderAccountsResponseDto> {
  const parsed = parseProviderAccountsRequestBody(body);

  if (parsed.operation === "create") {
    const record = await providerAccountsRepo.createProviderAccount(parsed.payload);
    return { ok: true, operation: "create", record };
  }

  if (parsed.operation === "update") {
    const record = await providerAccountsRepo.updateProviderAccount(parsed.payload);
    return { ok: true, operation: "update", record };
  }

  if (parsed.operation === "get") {
    const record = await providerAccountsRepo.getProviderAccount(parsed.payload.recordId);
    return { ok: true, operation: "get", record };
  }

  const record = await providerAccountsRepo.findProviderAccountByKey(parsed.payload);
  return { ok: true, operation: "find_by_key", record };
}

export async function handleProviderAccounts(request: Request): Promise<NextResponse> {
  try {
    assertAuthorizedSyncRequest(request);
    assertJsonRequest(request);
    const body = await parseJsonBody(request);
    const response = await runProviderAccountsWorkflow(body);
    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    const { status, body } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
