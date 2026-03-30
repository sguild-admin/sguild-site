import crypto from "crypto";

import {
  getClientExternalRecord,
  updateClientExternalSnapshots,
} from "@/lib/airtable/client-external-sync";
import { syncSquareCustomer } from "@/lib/providers/square/client-external-sync";
import { SyncEndpointError } from "@/lib/errors";
import type { SquareContext } from "./client.schema";

function timingSafeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

export function validateAirtableSecret(request: Request): void {
  const configuredSecret = process.env.AIRTABLE_SYNC_SECRET;
  if (!configuredSecret) {
    throw new SyncEndpointError("Airtable sync secret is not configured.", 500, {
      exposeMessage: false,
    });
  }

  const providedSecret = request.headers.get("x-airtable-secret") ?? "";
  if (!providedSecret || !timingSafeEqual(configuredSecret, providedSecret)) {
    throw new SyncEndpointError("Unauthorized", 401);
  }
}

export async function loadClientExternal(recordId: string) {
  return getClientExternalRecord(recordId);
}

export async function persistClientExternalSnapshots(
  recordId: string,
  fields: Partial<Record<"Name Snapshot" | "Phone Snapshot", string>>,
) {
  return updateClientExternalSnapshots(recordId, fields);
}

export async function runSquareClientSync(
  input: Parameters<typeof syncSquareCustomer>[0],
  context: SquareContext,
) {
  return syncSquareCustomer(input, context);
}

export function validateClientsSecret(request: Request): void {
  validateAirtableSecret(request);
}
