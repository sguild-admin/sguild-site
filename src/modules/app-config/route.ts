import { NextResponse } from "next/server";
import { assertJsonRequest, parseJsonBody } from "@/lib/http/request";
import { SyncEndpointError } from "@/lib/errors";
import { assertAuthorizedSyncRequest } from "@/modules/integrations";
import { parseAppConfigAliasTestRequest } from "./schema";
import { readAppConfigHealth, recordAppConfigTestResult, testAliasConfigured } from "./service";

function toErrorResponse(error: unknown): { status: number; body: { ok: false; error: string } } {
  if (error instanceof SyncEndpointError) {
    return {
      status: error.status,
      body: {
        ok: false,
        error: error.message,
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

export function methodNotAllowed(): NextResponse {
  return NextResponse.json(
    { ok: false, error: "Method Not Allowed" },
    { status: 405, headers: { Allow: "GET, POST" } },
  );
}

export async function handleAppConfigTestGet(): Promise<NextResponse> {
  try {
    return NextResponse.json(
      {
        ok: true,
        configHealth: readAppConfigHealth(),
      },
      { status: 200 },
    );
  } catch (error) {
    const { status, body } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}

export async function handleAppConfigTestPost(request: Request): Promise<NextResponse> {
  const testedAt = new Date().toISOString();
  let appConfigRecordId: string | undefined;

  const writeTestResult = async (input: { status: "passed" | "failed"; error: string }) => {
    try {
      await recordAppConfigTestResult({
        status: input.status,
        error: input.error,
        testedAt,
        appConfigRecordId,
      });
      return { ok: true as const };
    } catch (writeError) {
      console.error("Failed to write App-Config test result", writeError);
      return {
        ok: false as const,
        error: writeError instanceof Error ? writeError.message : "Unknown write error.",
      };
    }
  };

  try {
    assertAuthorizedSyncRequest(request);
    assertJsonRequest(request);
    const rawBody = await parseJsonBody(request);
    let bodyForParse: unknown = rawBody;
    const headerAlias = request.headers.get("x-airtable-secret-alias")?.trim() ?? "";

    if (typeof rawBody === "object" && rawBody != null && !Array.isArray(rawBody)) {
      const typed = rawBody as {
        appConfigRecordId?: unknown;
        recordId?: unknown;
        alias?: unknown;
        config?: unknown;
        provider?: unknown;
        target?: unknown;
      };
      const raw = typed.appConfigRecordId ?? typed.recordId;
      if (typeof raw === "string" && raw.trim().length > 0) {
        appConfigRecordId = raw.trim();
      }

      bodyForParse = {
        ...typed,
        ...(typeof typed.alias === "string" && typed.alias.trim().length > 0
          ? {}
          : (headerAlias ? { alias: headerAlias } : {})),
        ...(
          (typeof typed.config === "string" && typed.config.trim().length > 0) ||
          (typeof typed.provider === "string" && typed.provider.trim().length > 0) ||
          (typeof typed.target === "string" && typed.target.trim().length > 0)
            ? {}
            : { config: "airtable" }
        ),
      };
    }

    const parsed = parseAppConfigAliasTestRequest(bodyForParse);
    const configured = testAliasConfigured(parsed);
    const writeback = await writeTestResult({
      status: "passed",
      error: "",
    });

    return NextResponse.json(
      {
        ok: true,
        config: parsed.config,
        alias: parsed.alias,
        aliasConfigured: configured,
        configHealth: readAppConfigHealth(),
        writeback,
      },
      { status: 200 },
    );
  } catch (error) {
    const writeback = await writeTestResult({
      status: "failed",
      error: error instanceof Error ? error.message : "Unexpected server error.",
    });
    const { status, body } = toErrorResponse(error);
    return NextResponse.json(
      {
        ...body,
        writeback,
      },
      { status },
    );
  }
}
