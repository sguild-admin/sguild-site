export type OrderExternalSyncStatus = "Pending" | "Synced" | "Failed" | "Ignored";
export type OrderExternalWritebackStatus = "Not Started" | "Pending" | "Succeeded" | "Failed";

export type OrderExternalRecordDto = {
  recordId: string;
  orderRecordId: string | null;
  orgIntegrationRecordId: string | null;
  globalProviderAccountRecordId: string | null;
  externalActionIds: string[];
  syncStatus: OrderExternalSyncStatus | null;
  writebackStatus: OrderExternalWritebackStatus | null;
  currentExternalStatus: string | null;
  lastProviderActivityAt: string | null;
  lastSyncedAt: string | null;
  syncError: string | null;
  writebackAt: string | null;
  writebackError: string | null;
  notes: string | null;
  externalOrderId: string | null;
  externalPaymentId: string | null;
  externalInvoiceId: string | null;
  externalPaymentStatusSnapshot: string | null;
  externalInvoiceStatusSnapshot: string | null;
  externalInvoiceUrlSnapshot: string | null;
  externalInvoiceSentAtSnapshot: string | null;
  externalInvoicePaidAtSnapshot: string | null;
  customerIdSnapshot: string | null;
  cardIdSnapshot: string | null;
  amountSnapshotCents: number | null;
  rawPayloadSnapshot: string | null;
  provider: string | null;
  organizationRecordId: string | null;
  clientProfileRecordId: string | null;
  clientRecordId: string | null;
  orderStatus: string | null;
  billingState: string | null;
  paymentCollectionMethod: string | null;
  orderTotal: number | null;
  orderAmountPaid: number | null;
  hasExternalIdentity: boolean;
  needsProviderReview: boolean;
  missingRequiredLinks: boolean;
  canonicalOrgMismatch: boolean;
  hasException: boolean;
  exceptionReason: string | null;
};

export type CreateOrderExternalDto = {
  orderRecordId: string;
  orgIntegrationRecordId?: string;
  globalProviderAccountRecordId?: string;
  syncStatus?: OrderExternalSyncStatus;
  writebackStatus?: OrderExternalWritebackStatus;
  currentExternalStatus?: string;
  lastProviderActivityAt?: string;
  lastSyncedAt?: string;
  syncError?: string;
  writebackAt?: string;
  writebackError?: string;
  notes?: string;
  externalOrderId?: string;
  externalPaymentId?: string;
  externalInvoiceId?: string;
  externalPaymentStatusSnapshot?: string;
  externalInvoiceStatusSnapshot?: string;
  externalInvoiceUrlSnapshot?: string;
  externalInvoiceSentAtSnapshot?: string;
  externalInvoicePaidAtSnapshot?: string;
  customerIdSnapshot?: string;
  cardIdSnapshot?: string;
  amountSnapshotCents?: number;
  rawPayloadSnapshot?: string;
};

export type UpdateOrderExternalDto = {
  recordId: string;
  orgIntegrationRecordId?: string;
  clientExternalRecordId?: string;
  globalProviderAccountRecordId?: string;
  syncStatus?: OrderExternalSyncStatus;
  writebackStatus?: OrderExternalWritebackStatus;
  currentExternalStatus?: string;
  lastProviderActivityAt?: string;
  lastSyncedAt?: string;
  syncError?: string;
  writebackAt?: string;
  writebackError?: string;
  notes?: string;
  externalOrderId?: string;
  externalPaymentId?: string;
  externalInvoiceId?: string;
  externalPaymentStatusSnapshot?: string;
  externalInvoiceStatusSnapshot?: string;
  externalInvoiceUrlSnapshot?: string;
  externalInvoiceSentAtSnapshot?: string;
  externalInvoicePaidAtSnapshot?: string;
  customerIdSnapshot?: string;
  cardIdSnapshot?: string;
  amountSnapshotCents?: number;
  rawPayloadSnapshot?: string;
};

export type FindOrderExternalsByOrderDto = {
  orderRecordId: string;
};

export type FindOrderExternalByExternalIdsDto = {
  externalOrderId?: string;
  externalPaymentId?: string;
  externalInvoiceId?: string;
};

export type OrderExternalsRequestDto =
  | { operation: "create"; payload: CreateOrderExternalDto }
  | { operation: "update"; payload: UpdateOrderExternalDto }
  | { operation: "get"; payload: { recordId: string } }
  | { operation: "find_by_order"; payload: FindOrderExternalsByOrderDto }
  | { operation: "find_by_external_ids"; payload: FindOrderExternalByExternalIdsDto };

export type OrderExternalsResponseDto =
  | { ok: true; operation: "create"; record: OrderExternalRecordDto }
  | { ok: true; operation: "update"; record: OrderExternalRecordDto }
  | { ok: true; operation: "get"; record: OrderExternalRecordDto }
  | { ok: true; operation: "find_by_order"; records: OrderExternalRecordDto[] }
  | { ok: true; operation: "find_by_external_ids"; record: OrderExternalRecordDto | null };

export type OrderExternalsErrorResponseDto = {
  ok: false;
  error: string;
};
