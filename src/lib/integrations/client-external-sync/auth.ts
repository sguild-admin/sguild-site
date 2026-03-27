import crypto from "crypto";

import { SyncEndpointError } from "./response";

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

