import { invoicesRepo } from "@/modules/invoices";
import { airtableRequest, parseAirtableError } from "@/lib/airtable/client";
import { airtableSchema } from "@/config/airtable-schema";
import { SyncEndpointError } from "@/lib/errors";

export async function markInvoiceExternalRefundSignals(input: {
  invoiceExternalRecordId: string;
  eventType: "invoice.refunded" | "refund.updated";
  providerEventId: string;
  payloadJson: string;
}) {
  return invoicesRepo.updateInvoiceExternal(input.invoiceExternalRecordId, {
    "Last Webhook Event Type": input.eventType,
    "Last Webhook Event ID": input.providerEventId,
    "Webhook Raw Payload": input.payloadJson,
    "Webhook Received At": new Date().toISOString(),
  });
}

export async function updateRefundStatusCompleted(refundRecordId: string): Promise<void> {
  const refundsTable = airtableSchema.operations.tables.refunds;
  const refundStatusField = airtableSchema.operations.fields.refunds.status;
  const statusCandidates = ["Completed", "Completed "];
  let lastMessage = "Unknown Airtable error.";

  for (const statusValue of statusCandidates) {
    const response = await airtableRequest(
      `${encodeURIComponent(refundsTable)}/${encodeURIComponent(refundRecordId)}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          fields: {
            [refundStatusField]: statusValue,
          },
        }),
      },
    );

    if (response.ok) return;

    const message = await parseAirtableError(response);
    lastMessage = message;
    const invalidChoice =
      message.includes("Insufficient permissions to create new select option") ||
      message.includes("INVALID_MULTIPLE_CHOICE_OPTIONS");
    if (!invalidChoice) {
      throw new SyncEndpointError(`Failed to update Refund status: ${message}`, 502);
    }
  }

  throw new SyncEndpointError(`Failed to update Refund status: ${lastMessage}`, 502);
}
