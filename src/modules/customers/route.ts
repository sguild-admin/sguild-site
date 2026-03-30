import { NextResponse } from "next/server";
import { parseJsonBody } from "@/lib/http/request";
import { submitLead } from "./service";

export function methodNotAllowed(): NextResponse {
  return NextResponse.json(
    { ok: false, error: "Method Not Allowed" },
    { status: 405, headers: { Allow: "POST" } },
  );
}

export async function handleLeadSubmission(request: Request) {
  try {
    const body = await parseJsonBody(request);
    const result = await submitLead(body);
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error("Lead submission failed", error);
    return NextResponse.json(
      { ok: false, error: "Unable to submit your request right now." },
      { status: 500 },
    );
  }
}

