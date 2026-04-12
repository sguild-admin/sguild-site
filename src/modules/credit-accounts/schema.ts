import { SyncEndpointError } from "@/lib/errors";
import type { EnsureCreditAccountRequestDto } from "./dto";

type EnsureCreditAccountBody = {
  clientProfileRecordId?: unknown;
  recordId?: unknown;
};

export function parseEnsureCreditAccountBody(body: unknown): EnsureCreditAccountRequestDto {
  if (typeof body !== "object" || body == null || Array.isArray(body)) {
    throw new SyncEndpointError("Invalid request body.", 400);
  }

  const typed = body as EnsureCreditAccountBody;
  const rawRecordId =
    typeof typed.clientProfileRecordId === "string"
      ? typed.clientProfileRecordId
      : (typeof typed.recordId === "string" ? typed.recordId : "");
  const clientProfileRecordId = rawRecordId.trim();

  if (!clientProfileRecordId) {
    throw new SyncEndpointError("Missing clientProfileRecordId.", 400);
  }

  return { clientProfileRecordId };
}
