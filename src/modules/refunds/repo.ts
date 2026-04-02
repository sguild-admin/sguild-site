import { invoicesRepo } from "@/modules/invoices";

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
