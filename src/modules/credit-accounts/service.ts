import { NextResponse } from "next/server";
import { assertJsonRequest, parseJsonBody } from "@/lib/http/request";
import { SyncEndpointError } from "@/lib/errors";
import { assertAuthorizedSyncRequest } from "@/modules/integrations";
import type {
  CreditAccountsErrorResponseDto,
  EnsureCreditAccountRequestDto,
  EnsureCreditAccountResponseDto,
} from "./dto";
import {
  createCreditAccount,
  findCreditAccountByProfile,
  getClientProfileIdentity,
} from "./repo";
import { parseEnsureCreditAccountBody } from "./schema";

export async function ensureCreditAccountForProfile(
  input: EnsureCreditAccountRequestDto,
): Promise<EnsureCreditAccountResponseDto> {
  const profile = await getClientProfileIdentity(input.clientProfileRecordId);
  if (!profile.clientId) {
    throw new SyncEndpointError("Client Profile is missing Client link.", 422);
  }

  const existing = await findCreditAccountByProfile(input.clientProfileRecordId);
  if (existing) {
    return {
      ok: true,
      creditAccountRecordId: existing.recordId,
      created: false,
    };
  }

  const created = await createCreditAccount({
    clientProfileRecordId: input.clientProfileRecordId,
    status: "Active",
  });
  return {
    ok: true,
    creditAccountRecordId: created.recordId,
    created: true,
  };
}

function toErrorResponse(error: unknown): { status: number; body: CreditAccountsErrorResponseDto } {
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

export async function handleEnsureCreditAccount(request: Request): Promise<NextResponse> {
  try {
    assertAuthorizedSyncRequest(request);
    assertJsonRequest(request);
    const body = await parseJsonBody(request);
    const parsed = parseEnsureCreditAccountBody(body);
    const response = await ensureCreditAccountForProfile(parsed);
    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    const { status, body } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
