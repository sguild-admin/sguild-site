import { NextResponse } from "next/server";

import {
  createInvoiceExternal,
  findInvoiceExternalByInvoiceAndOrgIntegration,
  getOrderRecord,
  getOrgIntegrationRecord,
  listInvoicesByOrder,
  listOrderExternalsByInvoice,
  updateInvoiceExternal,
} from "@/lib/integrations/order-billing-processor/airtable";
import { validateAirtableSecret } from "@/lib/integrations/order-billing-processor/auth";
import { resolveProviderContext } from "@/lib/integrations/order-billing-processor/provider-context";
import { failureFromError, SyncEndpointError } from "@/lib/integrations/order-billing-processor/response";
import {
  cancelInvoice,
  getInvoiceDetails,
  getInvoicePublicUrl,
} from "@/lib/integrations/order-billing-processor/square";

export const runtime = "nodejs";

type ReconcileInvoiceExternalsBody = {
  orderRecordId?: unknown;
  orgIntegrationRecordId?: unknown;
  dryRun?: unknown;
};

type InvoiceReconcileResult = {
  invoiceId: string;
  canonicalExternalInvoiceId: string | null;
  createdInvoiceExternalRecordId: string | null;
  reusedInvoiceExternalRecordId: string | null;
  canceledExternalInvoiceIds: string[];
  skippedCancelExternalInvoiceIds: Array<{ externalInvoiceId: string; reason: string }>;
  errors: string[];
};

function methodNotAllowed(): NextResponse {
  return NextResponse.json(
    { ok: false, error: "Method Not Allowed" },
    { status: 405, headers: { Allow: "POST" } },
  );
}

function parseBody(body: unknown): {
  orderRecordId: string;
  orgIntegrationRecordId: string;
  dryRun: boolean;
} {
  if (typeof body !== "object" || body == null || Array.isArray(body)) {
    throw new SyncEndpointError("Invalid request body.", 400);
  }

  const typed = body as ReconcileInvoiceExternalsBody;
  const orderRecordId = typeof typed.orderRecordId === "string" ? typed.orderRecordId.trim() : "";
  const orgIntegrationRecordId =
    typeof typed.orgIntegrationRecordId === "string" ? typed.orgIntegrationRecordId.trim() : "";

  if (!orderRecordId) throw new SyncEndpointError("Missing orderRecordId.", 400);
  if (!orgIntegrationRecordId) throw new SyncEndpointError("Missing orgIntegrationRecordId.", 400);

  return {
    orderRecordId,
    orgIntegrationRecordId,
    dryRun: typed.dryRun !== false,
  };
}

function pickCanonicalExternalInvoiceId(input: {
  fromInvoiceExternal: string | null;
  fromOrderExternals: string[];
}): { externalInvoiceId: string | null; error?: string } {
  if (input.fromInvoiceExternal) {
    return { externalInvoiceId: input.fromInvoiceExternal };
  }

  const uniqueFromOrderExternals = [...new Set(input.fromOrderExternals)];
  if (uniqueFromOrderExternals.length === 0) {
    return { externalInvoiceId: null, error: "No external invoice ID found in Order Externals or Invoice Externals." };
  }

  if (uniqueFromOrderExternals.length > 1) {
    return {
      externalInvoiceId: null,
      error:
        "Multiple external invoice IDs found for this Invoice without an existing Invoice External canonical row.",
    };
  }

  return { externalInvoiceId: uniqueFromOrderExternals[0] };
}

async function reconcileOneInvoice(input: {
  invoiceId: string;
  orderRecordId: string;
  orgIntegrationRecordId: string;
  dryRun: boolean;
}): Promise<InvoiceReconcileResult> {
  const result: InvoiceReconcileResult = {
    invoiceId: input.invoiceId,
    canonicalExternalInvoiceId: null,
    createdInvoiceExternalRecordId: null,
    reusedInvoiceExternalRecordId: null,
    canceledExternalInvoiceIds: [],
    skippedCancelExternalInvoiceIds: [],
    errors: [],
  };

  const orgIntegration = await getOrgIntegrationRecord(input.orgIntegrationRecordId);
  const context = resolveProviderContext(orgIntegration, "Invoice");

  const invoiceExternal = await findInvoiceExternalByInvoiceAndOrgIntegration(
    input.invoiceId,
    input.orgIntegrationRecordId,
  );
  if (invoiceExternal) {
    result.reusedInvoiceExternalRecordId = invoiceExternal.recordId;
  }

  const linkedOrderExternals = await listOrderExternalsByInvoice(input.invoiceId);
  const candidateExternalInvoiceIds = linkedOrderExternals
    .map((row) => row.externalInvoiceId)
    .filter((value): value is string => typeof value === "string" && value.length > 0);

  const canonicalPick = pickCanonicalExternalInvoiceId({
    fromInvoiceExternal: invoiceExternal?.externalInvoiceId ?? null,
    fromOrderExternals: candidateExternalInvoiceIds,
  });

  if (!canonicalPick.externalInvoiceId) {
    result.errors.push(canonicalPick.error ?? "Unable to determine canonical external invoice ID.");
    return result;
  }

  result.canonicalExternalInvoiceId = canonicalPick.externalInvoiceId;

  const canonicalDetails = await getInvoiceDetails({
    context,
    externalInvoiceId: canonicalPick.externalInvoiceId,
  });
  const hostedInvoiceUrl = canonicalDetails.publicUrl ?? (await getInvoicePublicUrl({
    context,
    externalInvoiceId: canonicalPick.externalInvoiceId,
  }));

  if (!invoiceExternal) {
    if (!input.dryRun) {
      const created = await createInvoiceExternal({
        Invoice: [input.invoiceId],
        Order: [input.orderRecordId],
        "Org Integration": [input.orgIntegrationRecordId],
        "External Invoice ID": canonicalPick.externalInvoiceId,
        "External Status": canonicalDetails.status ?? "UNKNOWN",
        "Amount Due": 0,
        "Amount Paid": 0,
        ...(hostedInvoiceUrl ? { "Hosted Invoice URL": hostedInvoiceUrl } : {}),
        "Last Synced At": new Date().toISOString(),
        "Raw Payload": canonicalDetails.rawPayload,
        "Sync Status": "Synced",
        "Sync Error": "",
      });
      result.createdInvoiceExternalRecordId = created.recordId;
    }
  } else if (!input.dryRun) {
    await updateInvoiceExternal(invoiceExternal.recordId, {
      "External Invoice ID": canonicalPick.externalInvoiceId,
      "External Status": canonicalDetails.status ?? invoiceExternal.externalStatus ?? "UNKNOWN",
      ...(hostedInvoiceUrl ? { "Hosted Invoice URL": hostedInvoiceUrl } : {}),
      "Last Synced At": new Date().toISOString(),
      "Raw Payload": canonicalDetails.rawPayload,
      "Sync Status": "Synced",
      "Sync Error": "",
    });
  }

  const uniqueCandidates = [...new Set(candidateExternalInvoiceIds)];
  const extras = uniqueCandidates.filter((id) => id !== canonicalPick.externalInvoiceId);

  for (const extraExternalInvoiceId of extras) {
    try {
      const details = await getInvoiceDetails({
        context,
        externalInvoiceId: extraExternalInvoiceId,
      });
      const status = (details.status ?? "").toUpperCase();

      if (status === "CANCELED") {
        result.skippedCancelExternalInvoiceIds.push({
          externalInvoiceId: extraExternalInvoiceId,
          reason: "Already canceled",
        });
        continue;
      }

      if (status === "PAID") {
        result.skippedCancelExternalInvoiceIds.push({
          externalInvoiceId: extraExternalInvoiceId,
          reason: "Already paid; cannot auto-cancel safely",
        });
        continue;
      }

      if (input.dryRun) {
        result.skippedCancelExternalInvoiceIds.push({
          externalInvoiceId: extraExternalInvoiceId,
          reason: "dryRun=true",
        });
        continue;
      }

      if (details.version == null) {
        result.skippedCancelExternalInvoiceIds.push({
          externalInvoiceId: extraExternalInvoiceId,
          reason: "Missing Square invoice version for cancel",
        });
        continue;
      }

      await cancelInvoice({
        context,
        externalInvoiceId: extraExternalInvoiceId,
        version: details.version,
      });
      result.canceledExternalInvoiceIds.push(extraExternalInvoiceId);
    } catch (error) {
      result.errors.push(
        `Failed processing extra external invoice ${extraExternalInvoiceId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  return result;
}

export async function POST(request: Request) {
  try {
    validateAirtableSecret(request);

    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().includes("application/json")) {
      throw new SyncEndpointError("Content-Type must be application/json.", 400);
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new SyncEndpointError("Invalid JSON payload.", 400);
    }

    const parsed = parseBody(body);

    await getOrderRecord(parsed.orderRecordId);
    const invoices = await listInvoicesByOrder(parsed.orderRecordId);
    if (invoices.length === 0) {
      throw new SyncEndpointError("No Invoices linked to this Order.", 422);
    }

    const results: InvoiceReconcileResult[] = [];
    for (const invoice of invoices) {
      const result = await reconcileOneInvoice({
        invoiceId: invoice.recordId,
        orderRecordId: parsed.orderRecordId,
        orgIntegrationRecordId: parsed.orgIntegrationRecordId,
        dryRun: parsed.dryRun,
      });
      results.push(result);
    }

    return NextResponse.json(
      {
        ok: true,
        dryRun: parsed.dryRun,
        orderRecordId: parsed.orderRecordId,
        orgIntegrationRecordId: parsed.orgIntegrationRecordId,
        invoicesProcessed: results.length,
        results,
      },
      { status: 200 },
    );
  } catch (error) {
    const { status, body } = failureFromError(error);
    return NextResponse.json(body, { status });
  }
}

export async function GET() {
  return methodNotAllowed();
}

export async function PUT() {
  return methodNotAllowed();
}

export async function PATCH() {
  return methodNotAllowed();
}

export async function DELETE() {
  return methodNotAllowed();
}
