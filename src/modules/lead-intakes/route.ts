import { NextResponse } from "next/server";
import { parseJsonBody } from "@/lib/http/request";
import { SyncEndpointError } from "@/lib/errors";
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
    console.error("Lead submission failed [lead-intakes-route-v2]", error);
    if (error instanceof SyncEndpointError) {
      return NextResponse.json(
        {
          ok: false,
          error:
            process.env.NODE_ENV === "development"
              ? error.message
              : "Unable to submit your request right now.",
        },
        { status: error.status >= 400 && error.status < 600 ? error.status : 500 },
      );
    }
    return NextResponse.json(
      { ok: false, error: "Unable to submit your request right now." },
      { status: 500 },
    );
  }
}
