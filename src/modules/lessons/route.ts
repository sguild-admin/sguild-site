import { NextResponse } from "next/server";
import { getLessonsNotImplementedResponse } from "./service";

export function methodNotAllowed(): NextResponse {
  return NextResponse.json(
    { ok: false, error: "Method Not Allowed" },
    { status: 405, headers: { Allow: "POST" } },
  );
}

export function handleLessonsNotImplemented(): NextResponse {
  return NextResponse.json(getLessonsNotImplementedResponse(), { status: 501 });
}
