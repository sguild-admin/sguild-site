import { NextResponse } from "next/server";
import { handleProviderAccounts } from "./service";

export function methodNotAllowed(): NextResponse {
  return NextResponse.json(
    { ok: false, error: "Method Not Allowed" },
    { status: 405, headers: { Allow: "POST" } },
  );
}

export { handleProviderAccounts };
