export type DeliveryMethod = "Email" | "Sms" | "Link";

export type SendInvoiceRequestDto = {
  invoiceRecordId: string;
  orderRecordId?: string;
  orgIntegrationRecordId: string;
  invoiceExternalRecordId?: string;
  externalInvoiceId?: string;
  deliveryMethod?: DeliveryMethod;
  saveCard?: boolean;
  phoneSnapshot?: string;
  idempotencyKey?: string;
  forceResend: boolean;
};

export type ReconcileInvoiceExternalsRequestDto = {
  orderRecordId: string;
  orgIntegrationRecordId: string;
  dryRun: boolean;
};

export type InvoiceReconcileResultDto = {
  invoiceId: string;
  canonicalExternalInvoiceId: string | null;
  createdInvoiceExternalRecordId: string | null;
  reusedInvoiceExternalRecordId: string | null;
  canceledExternalInvoiceIds: string[];
  skippedCancelExternalInvoiceIds: Array<{ externalInvoiceId: string; reason: string }>;
  errors: string[];
};

export type SendInvoiceResponseDto = {
  ok: true;
  action: "Send Invoice";
  result: "processed" | "noop";
  invoiceId: string;
  orderId: string;
  invoiceExternalRecordId: string;
  externalInvoiceId: string;
  externalStatus: string;
  deliveryMethod: DeliveryMethod;
  saveCard: boolean;
  hostedInvoiceUrl?: string | null;
  sentAt?: string;
};

export type ReconcileInvoiceExternalsResponseDto = {
  ok: true;
  dryRun: boolean;
  orderRecordId: string;
  orgIntegrationRecordId: string;
  invoicesProcessed: number;
  results: InvoiceReconcileResultDto[];
};

