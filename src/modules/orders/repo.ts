import { SyncEndpointError } from "@/lib/errors";
import { airtableSchema } from "@/config/airtable-schema";
import {
  airtableRequest,
  escapeAirtableFormulaString,
  parseAirtableError,
} from "@/lib/airtable/client";
import { resolveSquareProviderContext } from "@/lib/providers/square/provider-context";
import {
  chargeWithCardOnFile,
  createOrderFromOrderItems,
} from "@/lib/providers/square/payments";
import {
  cancelInvoice,
  createInvoiceFromOrderItems,
  getInvoiceDetails,
  getInvoicePublicUrl,
  publishInvoice,
  updateInvoiceSettings,
} from "@/lib/providers/square/invoices";
import type { BillingAction } from "@/lib/types/billing";
import { clientSyncRepo } from "@/modules/clients";

const ORDER_EXTERNALS_TABLE = airtableSchema.operations.tables.orderExternals;
const EXTERNAL_ACTIONS_TABLE = airtableSchema.operations.tables.externalActions;
const ORDERS_TABLE = airtableSchema.operations.tables.orders;
const ORGANIZATIONS_TABLE = "Organizations";
const INVOICES_TABLE = airtableSchema.operations.tables.invoices;
const INVOICE_EXTERNALS_TABLE = airtableSchema.operations.tables.invoiceExternals;
const ORG_INTEGRATIONS_TABLE = airtableSchema.operations.tables.organizationIntegrations;
const PROVIDER_ACCOUNTS_TABLE = airtableSchema.operations.tables.providerAccounts;
const ORDER_ITEMS_TABLE = airtableSchema.operations.tables.orderItems;
const PROMOTION_REDEMPTIONS_TABLE = airtableSchema.operations.tables.promotionRedemptions;
const CLIENT_EXTERNALS_TABLE = airtableSchema.operations.tables.clientExternals;
const CARD_EXTERNALS_TABLE = airtableSchema.operations.tables.cardExternals;
const CLIENT_PROFILES_TABLE = airtableSchema.operations.tables.clientProfiles;
const ORDER_FIELDS = airtableSchema.operations.fields.orders;
const ORDER_ITEM_FIELDS = airtableSchema.operations.fields.orderItems;
const PROMOTION_REDEMPTION_FIELDS = airtableSchema.operations.fields.promotionRedemptions;
const ORDER_EXTERNAL_FIELDS = airtableSchema.operations.fields.orderExternals;
const PROVIDER_ACCOUNT_FIELDS = airtableSchema.operations.fields.providerAccounts;
const CLIENT_EXTERNAL_FIELDS = airtableSchema.operations.fields.clientExternals;
const EXTERNAL_ACTION_FIELDS = airtableSchema.operations.fields.externalActions;

type AirtableRecord = {
  id: string;
  fields?: Record<string, unknown>;
};

export type OrderExternalRecord = {
  recordId: string;
  orderId: string | null;
  orgIntegrationId: string | null;
  providerAccountId: string | null;
  externalActionIds: string[];
  externalPaymentId: string | null;
  externalOrderId: string | null;
  externalInvoiceId: string | null;
  syncStatus: string | null;
  writebackStatus: string | null;
  currentExternalStatus: string | null;
  externalInvoiceStatusSnapshot: string | null;
  externalInvoiceUrlSnapshot: string | null;
  externalInvoiceSentAtSnapshot: string | null;
  externalInvoicePaidAtSnapshot: string | null;
  customerIdSnapshot: string | null;
  amountSnapshotCents: number | null;
  orderStatus: string | null;
  billingState: string | null;
  paymentCollectionMethod: string | null;
  hasException: boolean;
};

export type OrderRecord = {
  recordId: string;
  clientId: string | null;
  amountDue: number | null;
  amountPaid: number | null;
  currency: string | null;
  billingStatus: string | null;
};

export type OrderSendInvoiceRecord = {
  recordId: string;
  status: string | null;
  billingState: string | null;
  paymentCollectionMethod: string | null;
  amountPaid: number | null;
  total: number | null;
  balanceDue: number | null;
  currency: string | null;
  paidAt: string | null;
  organizationId: string | null;
  clientProfileId: string | null;
  clientId: string | null;
  readyForProviderAction: boolean;
  hasException: boolean;
  orderedAt: string | null;
  modifiedAt: string | null;
};

export type InvoiceRecord = {
  recordId: string;
  orderId: string | null;
  status: string | null;
  deliveryMethod: string | null;
  saveCard: boolean | null;
  paymentLink: string | null;
  amountDue: number | null;
  amountPaid: number | null;
  issuedAt: string | null;
  dueAt: string | null;
  paidAt: string | null;
};

export type OrgIntegrationRecord = {
  recordId: string;
  provider: string | null;
  providerAccountId: string | null;
  accessToken: string | null;
  externalLocationId: string | null;
  status: string | null;
};

export type ClientExternalRecord = {
  recordId: string;
  clientId: string | null;
  providerAccountId: string | null;
  externalCustomerId: string | null;
  activeCardCount: number | null;
  status: string | null;
  syncStatus: string | null;
  modifiedAt: string | null;
};

export type ProviderAccountRecord = {
  recordId: string;
  provider: string | null;
  status: string | null;
  apiBaseUrl: string | null;
  apiCredentialAlias: string | null;
};

export type ExternalActionRecord = {
  recordId: string;
  provider: string | null;
  providerEventType: string | null;
  providerEventId: string | null;
  providerReferenceId: string | null;
  direction: string | null;
  actionType: string | null;
  status: string | null;
  writebackStatus: string | null;
  writebackError: string | null;
  rawProviderPayload: string | null;
  occurredAt: string | null;
  retryable: boolean;
  attemptNumber: number;
  orderExternalId: string | null;
  providerAccountId: string | null;
};

export type CardExternalRecord = {
  recordId: string;
  externalCardId: string | null;
  modifiedAt: string | null;
};

export type InvoiceExternalRecord = {
  recordId: string;
  invoiceId: string | null;
  orderId: string | null;
  orgIntegrationId: string | null;
  externalInvoiceId: string | null;
  externalOrderId: string | null;
  externalStatus: string | null;
  amountDue: number | null;
  amountPaid: number | null;
  amountRefunded: number | null;
  issuedAt: string | null;
  dueAt: string | null;
  paidAt: string | null;
  voidedAt: string | null;
  hostedInvoiceUrl: string | null;
  lastSyncedAt: string | null;
  lastSyncActivityAt: string | null;
  webhookReceivedAt: string | null;
  lastWebhookEventType: string | null;
  lastWebhookEventId: string | null;
  externalProcessRawPayload: string | null;
  webhookRawPayload: string | null;
  deliveryMethod: string | null;
  saveCard: boolean | null;
  phoneSnapshot: string | null;
  sentAt: string | null;
  lastSendError: string | null;
  sendAttemptCount: number | null;
  externalProcessStatus: string | null;
  externalProcessAction: string | null;
  externalProcessAt: string | null;
  externalProcessError: string | null;
  externalActionIdempotencyKey: string | null;
  writebackStatus: string | null;
  writebackAt: string | null;
  writebackError: string | null;
  writebackRetryCount: number | null;
  writebackLastAttemptAt: string | null;
  reconciliationStatus: string | null;
  lastApiResponseCode: number | null;
  lastApiMessage: string | null;
  internalNotes: string | null;
  rawPayload: string | null;
  syncStatus: string | null;
  syncError: string | null;
};

export type OrderItem = {
  recordId: string;
  description: string | null;
  netAmount: number | null;
  lineSubtotal: number | null;
  lineDiscount: number | null;
};

export type OrderResolveLifecycleRecord = {
  recordId: string;
  status: string | null;
  promotionResolutionRequested: boolean;
};

export type OrderItemPromotionResolutionRecord = {
  recordId: string;
  status: string | null;
  draftPromotionRedemptionCount: number | null;
  unresolvedDraftPromotionRedemptions: boolean;
  orderLinkIds: string[];
  promotionRedemptionIds: string[];
};

export type PromotionRedemptionResolutionRecord = {
  recordId: string;
  status: string | null;
  readyToApply: boolean;
  applicationRequested: boolean;
  appliedDiscountContribution: number | null;
  promotionNameSnapshot: string | null;
  orderItemLinkIds: string[];
};

export type OrderOpenRecord = {
  recordId: string;
  status: string | null;
  readyToOpen: boolean;
  openingRequested: boolean;
};

export type OrderItemOpenRecord = {
  recordId: string;
  status: string | null;
  readyToActivate: boolean;
  activeStateValid: boolean;
  orderLinkIds: string[];
};

export type GrantCreditsOrderRecord = {
  recordId: string;
  status: string | null;
  hasException: boolean;
  orderItemsCount: number;
  orderItemsExceptionCount: number;
  clientProfileId: string | null;
  organizationId: string | null;
};

export type GrantCreditsOrderItemRecord = {
  recordId: string;
  status: string | null;
  creditsGrantedTotal: number | null;
  creditsGrantedPerUnitSnapshot: number | null;
  quantity: number | null;
  creditLedgerEntryIds: string[];
};

function readString(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const parsed = readString(item);
      if (parsed) return parsed;
    }
  }
  return null;
}

function readFirstLinkedId(value: unknown): string | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const [first] = value;
  return typeof first === "string" && first.trim().length > 0 ? first.trim() : null;
}

function readLinkedIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const ids: string[] = [];
  for (const item of value) {
    if (typeof item === "string" && item.trim().length > 0) ids.push(item.trim());
  }
  return ids;
}

function readNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const parsed = readNumber(item);
      if (parsed != null) return parsed;
    }
  }
  return null;
}

function readBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return null;
    if (normalized === "true" || normalized === "yes" || normalized === "1") return true;
    if (normalized === "false" || normalized === "no" || normalized === "0") return false;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const parsed = readBoolean(item);
      if (parsed != null) return parsed;
    }
  }
  return null;
}

function readFlag(value: unknown): boolean {
  const bool = readBoolean(value);
  if (bool != null) return bool;
  const num = readNumber(value);
  if (num != null) return num !== 0;
  return false;
}

function toClientExternalRecord(record: AirtableRecord): ClientExternalRecord {
  const fields = record.fields ?? {};
  const providerAccountValue =
    readFirstLinkedId(fields[CLIENT_EXTERNAL_FIELDS.providerAccount]) ??
    readFirstLinkedId(fields["Provider Account"]);
  return {
    recordId: record.id,
    clientId: readFirstLinkedId(fields.Client) ?? readFirstLinkedId(fields["Client Profile"]),
    providerAccountId: providerAccountValue,
    externalCustomerId: readString(fields[CLIENT_EXTERNAL_FIELDS.externalCustomerId]),
    activeCardCount: readNumber(fields["Active Card Count"]),
    status: readString(fields[CLIENT_EXTERNAL_FIELDS.status]),
    syncStatus: readString(fields[CLIENT_EXTERNAL_FIELDS.syncStatus]),
    modifiedAt: readString(fields["Modified At"]),
  };
}

function readOrderItemDescription(fields: Record<string, unknown>): string | null {
  return (
    readString(fields["Offering Description"]) ??
    readString(fields["Offering Name"]) ??
    readString(fields.Description) ??
    readString(fields.Name) ??
    readString(fields.Title)
  );
}

function readOrderItemNetAmount(fields: Record<string, unknown>): number | null {
  const orderItemFields = airtableSchema.operations.fields.orderItems;
  const directNet =
    readNumber(fields["Net Amount"]) ??
    readNumber(fields[orderItemFields.lineTotalContribution]) ??
    readNumber(fields["Line Total Contribution"]) ??
    readNumber(fields["Amount"]) ??
    readNumber(fields["Total"]);
  if (directNet != null) return directNet;

  // Fallback compute path: subtotal - discount + tax + service charge.
  const subtotal =
    readNumber(fields[orderItemFields.lineSubtotal]) ??
    readNumber(fields["Line Subtotal"]) ??
    0;
  const discount =
    readNumber(fields[orderItemFields.lineDiscount]) ??
    readNumber(fields["Line Discount"]) ??
    0;
  const tax =
    readNumber(fields[orderItemFields.lineTax]) ??
    readNumber(fields["Line Tax"]) ??
    0;
  const serviceCharge =
    readNumber(fields[orderItemFields.lineServiceCharge]) ??
    readNumber(fields["Line Service Charge"]) ??
    0;
  const computed = subtotal - discount + tax + serviceCharge;
  if (Number.isFinite(computed) && computed > 0) return computed;

  // Last fallback for schemas exposing promotion discounts separately.
  const promoDiscount =
    readNumber(fields[orderItemFields.appliedPromotionDiscountTotal]) ??
    readNumber(fields["Applied Promotion Discount Total"]) ??
    0;
  const promoComputed = subtotal - promoDiscount + tax + serviceCharge;
  if (Number.isFinite(promoComputed) && promoComputed > 0) return promoComputed;

  return (
    readNumber(fields["Line Subtotal"]) ??
    readNumber(fields["Amount"]) ??
    readNumber(fields["Total"])
  );
}

function isEnabled(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "") return true;
    return normalized === "true" || normalized === "yes" || normalized === "enabled";
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return true;
    return value.some((item) => isEnabled(item));
  }
  if (typeof value === "object") {
    const asRecord = value as Record<string, unknown>;
    const name = readString(asRecord.name);
    if (name) return isEnabled(name);
    const id = readString(asRecord.id);
    if (id) return true;
  }
  return false;
}

function toOrderExternalRecord(record: AirtableRecord): OrderExternalRecord {
  const fields = record.fields ?? {};
  return {
    recordId: record.id,
    orderId:
      readFirstLinkedId(fields[ORDER_EXTERNAL_FIELDS.order]) ??
      readFirstLinkedId(fields.Order) ??
      readFirstLinkedId(fields.Orders) ??
      readFirstLinkedId(fields["Parent Order"]),
    orgIntegrationId:
      readFirstLinkedId(fields[ORDER_EXTERNAL_FIELDS.orgIntegration]) ??
      readFirstLinkedId(fields["Org Integration"]),
    providerAccountId:
      readFirstLinkedId(fields[ORDER_EXTERNAL_FIELDS.globalProviderAccount]) ??
      readFirstLinkedId(fields["Global Provider Account"]) ??
      readFirstLinkedId(fields["Provider Account"]),
    externalActionIds:
      readLinkedIds(fields[ORDER_EXTERNAL_FIELDS.externalActions]) ??
      readLinkedIds(fields["External Actions"]),
    externalPaymentId:
      readString(fields[ORDER_EXTERNAL_FIELDS.externalPaymentId]) ??
      readString(fields["External Payment ID"]),
    externalOrderId:
      readString(fields[ORDER_EXTERNAL_FIELDS.externalOrderId]) ??
      readString(fields["External Order ID"]),
    externalInvoiceId:
      readString(fields[ORDER_EXTERNAL_FIELDS.externalInvoiceId]) ??
      readString(fields["External Invoice ID"]),
    syncStatus: readString(fields[ORDER_EXTERNAL_FIELDS.syncStatus]),
    writebackStatus: readString(fields[ORDER_EXTERNAL_FIELDS.writebackStatus]),
    currentExternalStatus: readString(fields[ORDER_EXTERNAL_FIELDS.currentExternalStatus]),
    externalInvoiceStatusSnapshot: readString(fields[ORDER_EXTERNAL_FIELDS.externalInvoiceStatusSnapshot]),
    externalInvoiceUrlSnapshot: readString(fields[ORDER_EXTERNAL_FIELDS.externalInvoiceUrlSnapshot]),
    externalInvoiceSentAtSnapshot: readString(fields[ORDER_EXTERNAL_FIELDS.externalInvoiceSentAtSnapshot]),
    externalInvoicePaidAtSnapshot: readString(fields[ORDER_EXTERNAL_FIELDS.externalInvoicePaidAtSnapshot]),
    customerIdSnapshot: readString(fields[ORDER_EXTERNAL_FIELDS.customerIdSnapshot]),
    amountSnapshotCents: readNumber(fields[ORDER_EXTERNAL_FIELDS.amountSnapshotCents]),
    orderStatus: readString(fields[ORDER_EXTERNAL_FIELDS.orderStatus]),
    billingState: readString(fields[ORDER_EXTERNAL_FIELDS.billingState]),
    paymentCollectionMethod: readString(fields[ORDER_EXTERNAL_FIELDS.paymentCollectionMethod]),
    hasException: readFlag(fields[ORDER_EXTERNAL_FIELDS.hasException]),
  };
}

async function getRecord(
  tableName: string,
  recordId: string,
  resourceLabel: string,
): Promise<AirtableRecord> {
  const response = await airtableRequest(
    `${encodeURIComponent(tableName)}/${encodeURIComponent(recordId)}`,
    { method: "GET" },
  );

  if (response.status === 404) {
    throw new SyncEndpointError(`${resourceLabel} not found.`, 404);
  }

  if (!response.ok) {
    const message = await parseAirtableError(response);
    throw new SyncEndpointError(`Airtable request failed: ${message}`, 502);
  }

  return (await response.json()) as AirtableRecord;
}

async function getOrderExternalRecord(recordId: string): Promise<OrderExternalRecord> {
  const record = await getRecord(ORDER_EXTERNALS_TABLE, recordId, "Order External");
  return toOrderExternalRecord(record);
}

async function listOrderExternalsByOrder(
  orderRecordId: string,
): Promise<OrderExternalRecord[]> {
  const escapedOrderId = escapeAirtableFormulaString(orderRecordId);
  async function queryByLinkField(linkField: string): Promise<OrderExternalRecord[] | null> {
    const formula = `FIND('${escapedOrderId}', ARRAYJOIN({${linkField}}))`;
    let offset: string | undefined;
    const rows: OrderExternalRecord[] = [];

    do {
      const params = new URLSearchParams({ pageSize: "100", filterByFormula: formula });
      if (offset) params.set("offset", offset);

      const response = await airtableRequest(
        `${encodeURIComponent(ORDER_EXTERNALS_TABLE)}?${params.toString()}`,
        { method: "GET" },
      );
      if (!response.ok) {
        const message = await parseAirtableError(response);
        if (/Unknown field name/i.test(message) || /Unknown field names/i.test(message)) {
          return null;
        }
        throw new SyncEndpointError(`Failed to list Order Externals by Order: ${message}`, 502);
      }

      const body = (await response.json()) as { records?: AirtableRecord[]; offset?: string };
      for (const record of body.records ?? []) rows.push(toOrderExternalRecord(record));
      offset = body.offset;
    } while (offset);

    return rows;
  }

  for (const linkField of [ORDER_EXTERNAL_FIELDS.order, "Order", "Orders", "Parent Order"]) {
    const rows = await queryByLinkField(linkField);
    if (rows && rows.length > 0) return rows;
  }

  // Final fallback scan for unusual schemas: detect any linked-record array containing this Order id.
  let offset: string | undefined;
  const scannedRows: OrderExternalRecord[] = [];
  do {
    const params = new URLSearchParams({ pageSize: "100" });
    if (offset) params.set("offset", offset);

    const response = await airtableRequest(
      `${encodeURIComponent(ORDER_EXTERNALS_TABLE)}?${params.toString()}`,
      { method: "GET" },
    );
    if (!response.ok) {
      const message = await parseAirtableError(response);
      throw new SyncEndpointError(`Failed to list Order Externals by Order: ${message}`, 502);
    }

    const body = (await response.json()) as { records?: AirtableRecord[]; offset?: string };
    for (const record of body.records ?? []) {
      const fields = record.fields ?? {};
      const linksToOrder = Object.values(fields).some(
        (value) =>
          Array.isArray(value) &&
          value.some((item) => typeof item === "string" && item.trim() === orderRecordId),
      );
      if (!linksToOrder) continue;
      scannedRows.push(toOrderExternalRecord(record));
    }
    offset = body.offset;
  } while (offset);

  return scannedRows;
}

async function findOrderExternalByExternalInvoiceId(
  externalInvoiceId: string,
): Promise<OrderExternalRecord | null> {
  const escaped = escapeAirtableFormulaString(externalInvoiceId);
  const params = new URLSearchParams({
    pageSize: "1",
    filterByFormula: `{External Invoice ID}='${escaped}'`,
  });

  const response = await airtableRequest(
    `${encodeURIComponent(ORDER_EXTERNALS_TABLE)}?${params.toString()}`,
    { method: "GET" },
  );
  if (!response.ok) {
    const message = await parseAirtableError(response);
    throw new SyncEndpointError(`Failed to find Order External by External Invoice ID: ${message}`, 502);
  }

  const body = (await response.json()) as { records?: AirtableRecord[] };
  const record = body.records?.[0];
  if (!record) return null;
  return toOrderExternalRecord(record);
}

async function findOrderExternalByExternalOrderId(
  externalOrderId: string,
): Promise<OrderExternalRecord | null> {
  const escaped = escapeAirtableFormulaString(externalOrderId);
  const params = new URLSearchParams({
    pageSize: "1",
    filterByFormula: `{External Order ID}='${escaped}'`,
  });

  const response = await airtableRequest(
    `${encodeURIComponent(ORDER_EXTERNALS_TABLE)}?${params.toString()}`,
    { method: "GET" },
  );
  if (!response.ok) {
    const message = await parseAirtableError(response);
    throw new SyncEndpointError(`Failed to find Order External by External Order ID: ${message}`, 502);
  }

  const body = (await response.json()) as { records?: AirtableRecord[] };
  const record = body.records?.[0];
  if (!record) return null;
  return toOrderExternalRecord(record);
}

async function getOrderRecord(recordId: string): Promise<OrderRecord> {
  const record = await getRecord(ORDERS_TABLE, recordId, "Order");
  const fields = record.fields ?? {};

  return {
    recordId: record.id,
    clientId: readFirstLinkedId(fields.Client),
    amountDue: readNumber(fields["Amount Due"]),
    amountPaid: readNumber(fields["Amount Paid"]),
    currency: readString(fields.Currency),
    billingStatus: readString(fields["Billing Status"]),
  };
}

async function getOrderSendInvoiceRecord(recordId: string): Promise<OrderSendInvoiceRecord> {
  const record = await getRecord(ORDERS_TABLE, recordId, "Order");
  const fields = record.fields ?? {};

  return {
    recordId: record.id,
    status: readString(fields[ORDER_FIELDS.status]),
    billingState: readString(fields[ORDER_FIELDS.billingState]),
    paymentCollectionMethod: readString(fields[ORDER_FIELDS.paymentCollectionMethod]),
    amountPaid: readNumber(fields[ORDER_FIELDS.amountPaid]),
    total: readNumber(fields[ORDER_FIELDS.total]),
    balanceDue: readNumber(fields[ORDER_FIELDS.balanceDue]),
    currency: readString(fields[ORDER_FIELDS.currency]),
    paidAt: readString(fields[ORDER_FIELDS.paidAt]),
    organizationId: readFirstLinkedId(fields[ORDER_FIELDS.organization]),
    clientProfileId: readFirstLinkedId(fields[ORDER_FIELDS.clientProfile]),
    clientId: readFirstLinkedId(fields[ORDER_FIELDS.client]),
    readyForProviderAction: readFlag(fields[ORDER_FIELDS.readyForProviderAction]),
    hasException: readFlag(fields[ORDER_FIELDS.hasException]),
    orderedAt: readString(fields[ORDER_FIELDS.orderedAt]),
    modifiedAt: readString(fields[ORDER_FIELDS.modifiedAt]),
  };
}

async function getOrderResolveLifecycleRecord(recordId: string): Promise<OrderResolveLifecycleRecord> {
  const record = await getRecord(ORDERS_TABLE, recordId, "Order");
  const fields = record.fields ?? {};
  const hasPromotionResolutionRequestedField = Object.prototype.hasOwnProperty.call(
    fields,
    ORDER_FIELDS.promotionResolutionRequested,
  );

  return {
    recordId: record.id,
    status: readString(fields[ORDER_FIELDS.status]),
    // Rollout-safe: use the new field when present, otherwise fall back to Opening Requested.
    promotionResolutionRequested: hasPromotionResolutionRequestedField
      ? readFlag(fields[ORDER_FIELDS.promotionResolutionRequested])
      : readFlag(fields[ORDER_FIELDS.openingRequested]),
  };
}

async function getGrantCreditsOrderRecord(recordId: string): Promise<GrantCreditsOrderRecord> {
  const record = await getRecord(ORDERS_TABLE, recordId, "Order");
  const fields = record.fields ?? {};

  return {
    recordId: record.id,
    status: readString(fields[ORDER_FIELDS.status]),
    hasException: readFlag(fields[ORDER_FIELDS.hasException]),
    orderItemsCount: readNumber(fields[ORDER_FIELDS.orderItemsCount]) ?? 0,
    orderItemsExceptionCount: readNumber(fields[ORDER_FIELDS.orderItemsExceptionCount]) ?? 0,
    clientProfileId: readFirstLinkedId(fields[ORDER_FIELDS.clientProfile]),
    organizationId: readFirstLinkedId(fields[ORDER_FIELDS.organization]),
  };
}

async function listGrantCreditsOrderItems(orderRecordId: string): Promise<GrantCreditsOrderItemRecord[]> {
  const escapedOrderId = escapeAirtableFormulaString(orderRecordId);

  async function queryByLinkField(linkField: string): Promise<GrantCreditsOrderItemRecord[] | null> {
    const formula = `FIND('${escapedOrderId}', ARRAYJOIN({${linkField}}))`;
    let offset: string | undefined;
    const rows: GrantCreditsOrderItemRecord[] = [];

    do {
      const params = new URLSearchParams({ pageSize: "100", filterByFormula: formula });
      if (offset) params.set("offset", offset);

      const response = await airtableRequest(
        `${encodeURIComponent(ORDER_ITEMS_TABLE)}?${params.toString()}`,
        { method: "GET" },
      );

      if (!response.ok) {
        const message = await parseAirtableError(response);
        if (/Unknown field name/i.test(message) || /Unknown field names/i.test(message)) {
          return null;
        }
        console.error(`[GRANT_CREDITS] Query failed for field ${linkField}: ${message}`);
        return null; // Return null instead of throwing to allow fallback
      }

      const body = (await response.json()) as { records?: AirtableRecord[]; offset?: string };
      for (const rec of body.records ?? []) {
        const fields = rec.fields ?? {};
        rows.push({
          recordId: rec.id,
          status: readString(fields[ORDER_ITEM_FIELDS.status]),
          creditsGrantedTotal: readNumber(fields[ORDER_ITEM_FIELDS.creditsGrantedTotal]),
          creditsGrantedPerUnitSnapshot: readNumber(fields[ORDER_ITEM_FIELDS.creditsGrantedPerUnitSnapshot]),
          quantity: readNumber(fields[ORDER_ITEM_FIELDS.quantity]),
          creditLedgerEntryIds: readLinkedIds(fields[ORDER_ITEM_FIELDS.creditLedgerEntries]),
        });
      }
      offset = body.offset;
    } while (offset);

    return rows;
  }

  // Try formula-based queries
  for (const fieldName of ["Order", "Orders", "Parent Order"]) {
    console.log(`[GRANT_CREDITS] Trying formula with field: ${fieldName}`);
    const rows = await queryByLinkField(fieldName);
    if (rows && rows.length > 0) {
      console.log(`[GRANT_CREDITS] Formula matched: found ${rows.length} items`);
      return rows;
    }
  }

  // Fallback: scan ALL Order Items and match by Order field
  console.log(`[GRANT_CREDITS] Using fallback scan for Order ID: ${orderRecordId}`);
  let offset: string | undefined;
  const scannedRows: GrantCreditsOrderItemRecord[] = [];
  let totalScanned = 0;

  do {
    const params = new URLSearchParams({ pageSize: "100" });
    if (offset) params.set("offset", offset);

    const response = await airtableRequest(
      `${encodeURIComponent(ORDER_ITEMS_TABLE)}?${params.toString()}`,
      { method: "GET" },
    );

    if (!response.ok) {
      const message = await parseAirtableError(response);
      console.error(`[GRANT_CREDITS] Fallback scan failed: ${message}`);
      throw new SyncEndpointError(`Failed to scan Order Items: ${message}`, 502);
    }

    const body = (await response.json()) as { records?: AirtableRecord[]; offset?: string };
    const records = body.records ?? [];
    totalScanned += records.length;
    
    for (const rec of records) {
      const fields = rec.fields ?? {};
      
      // Try multiple possible Order field names
      let linkedOrderIds: string[] = [];
      for (const fieldName of ["Order", "Orders", "Parent Order"]) {
        const value = fields[fieldName];
        if (Array.isArray(value)) {
          linkedOrderIds = readLinkedIds(value);
          if (linkedOrderIds.length > 0) break;
        }
      }
      
      if (linkedOrderIds.includes(orderRecordId)) {
        console.log(`[GRANT_CREDITS] Fallback found match: Order Item ${rec.id}`);
        scannedRows.push({
          recordId: rec.id,
          status: readString(fields[ORDER_ITEM_FIELDS.status]),
          creditsGrantedTotal: readNumber(fields[ORDER_ITEM_FIELDS.creditsGrantedTotal]),
          creditsGrantedPerUnitSnapshot: readNumber(fields[ORDER_ITEM_FIELDS.creditsGrantedPerUnitSnapshot]),
          quantity: readNumber(fields[ORDER_ITEM_FIELDS.quantity]),
          creditLedgerEntryIds: readLinkedIds(fields[ORDER_ITEM_FIELDS.creditLedgerEntries]),
        });
      }
    }
    
    offset = body.offset;
  } while (offset);

  console.log(`[GRANT_CREDITS] Fallback complete: scanned ${totalScanned} total items, found ${scannedRows.length} matches`);
  return scannedRows;
}

async function getOrderOpenRecord(recordId: string): Promise<OrderOpenRecord> {
  const record = await getRecord(ORDERS_TABLE, recordId, "Order");
  const fields = record.fields ?? {};

  return {
    recordId: record.id,
    status: readString(fields[ORDER_FIELDS.status]),
    readyToOpen: readFlag(fields[ORDER_FIELDS.readyToOpen]),
    openingRequested: readFlag(fields[ORDER_FIELDS.openingRequested]),
  };
}

async function getInvoiceRecord(recordId: string): Promise<InvoiceRecord> {
  const record = await getRecord(INVOICES_TABLE, recordId, "Invoice");
  return toInvoiceRecord(record);
}

function toInvoiceRecord(record: AirtableRecord): InvoiceRecord {
  const fields = record.fields ?? {};
  return {
    recordId: record.id,
    orderId: readFirstLinkedId(fields.Order),
    status: readString(fields.Status),
    deliveryMethod: readString(fields["Delivery Method"]),
    saveCard: readBoolean(fields["Save Card"]) ?? readBoolean(fields["Save Card on File"]),
    paymentLink: readString(fields["Payment Link"]),
    amountDue: readNumber(fields["Amount Due"]),
    amountPaid: readNumber(fields["Amount Paid"]),
    issuedAt: readString(fields["Issued At"]),
    dueAt: readString(fields["Due At"]),
    paidAt: readString(fields["Paid At"]),
  };
}

async function findSingleInvoiceByOrder(
  orderRecordId: string,
): Promise<InvoiceRecord | null> {
  const escapedOrderId = escapeAirtableFormulaString(orderRecordId);

  async function queryByLinkField(linkField: string): Promise<InvoiceRecord[] | null> {
    const formula = `FIND('${escapedOrderId}', ARRAYJOIN({${linkField}}))`;
    const params = new URLSearchParams({
      pageSize: "5",
      filterByFormula: formula,
    });

    const response = await airtableRequest(
      `${encodeURIComponent(INVOICES_TABLE)}?${params.toString()}`,
      { method: "GET" },
    );
    if (!response.ok) {
      const message = await parseAirtableError(response);
      if (/Unknown field name/i.test(message) || /Unknown field names/i.test(message)) {
        return null;
      }
      throw new SyncEndpointError(`Failed to resolve Invoice by Order: ${message}`, 502);
    }

    const body = (await response.json()) as { records?: AirtableRecord[] };
    return (body.records ?? []).map((record) => toInvoiceRecord(record));
  }

  for (const fieldName of ["Order", "Orders", "Parent Order"]) {
    const matches = await queryByLinkField(fieldName);
    if (!matches || matches.length === 0) continue;
    if (matches.length > 1) {
      throw new SyncEndpointError(
        "Multiple Invoices are linked to this Order. Provide invoiceRecordId explicitly.",
        409,
      );
    }
    return matches[0];
  }

  // Final fallback for unusual link field names: scan and match any linked-record array.
  const response = await airtableRequest(
    `${encodeURIComponent(INVOICES_TABLE)}?${new URLSearchParams({ pageSize: "100" }).toString()}`,
    { method: "GET" },
  );
  if (!response.ok) {
    const message = await parseAirtableError(response);
    throw new SyncEndpointError(`Failed to resolve Invoice by Order: ${message}`, 502);
  }

  const body = (await response.json()) as { records?: AirtableRecord[] };
  const matches: InvoiceRecord[] = [];
  for (const record of body.records ?? []) {
    const fields = record.fields ?? {};
    const linksToOrder = Object.values(fields).some(
      (value) =>
        Array.isArray(value) &&
        value.some((item) => typeof item === "string" && item.trim() === orderRecordId),
    );
    if (!linksToOrder) continue;
    matches.push(toInvoiceRecord(record));
  }

  if (matches.length === 0) return null;
  if (matches.length > 1) {
    throw new SyncEndpointError(
      "Multiple Invoices are linked to this Order. Provide invoiceRecordId explicitly.",
      409,
    );
  }

  return matches[0];
}

async function listInvoicesByOrder(orderRecordId: string): Promise<InvoiceRecord[]> {
  const escapedOrderId = escapeAirtableFormulaString(orderRecordId);

  async function queryByLinkField(linkField: string): Promise<InvoiceRecord[] | null> {
    const formula = `FIND('${escapedOrderId}', ARRAYJOIN({${linkField}}))`;
    let offset: string | undefined;
    const rows: InvoiceRecord[] = [];

    do {
      const params = new URLSearchParams({
        pageSize: "100",
        filterByFormula: formula,
      });
      if (offset) params.set("offset", offset);

      const response = await airtableRequest(
        `${encodeURIComponent(INVOICES_TABLE)}?${params.toString()}`,
        { method: "GET" },
      );
      if (!response.ok) {
        const message = await parseAirtableError(response);
        if (/Unknown field name/i.test(message) || /Unknown field names/i.test(message)) {
          return null;
        }
        throw new SyncEndpointError(`Failed to list Invoices by Order: ${message}`, 502);
      }

      const body = (await response.json()) as {
        records?: AirtableRecord[];
        offset?: string;
      };
      for (const record of body.records ?? []) rows.push(toInvoiceRecord(record));
      offset = body.offset;
    } while (offset);

    return rows;
  }

  for (const fieldName of ["Order", "Orders", "Parent Order"]) {
    const rows = await queryByLinkField(fieldName);
    if (rows && rows.length > 0) return rows;
  }

  let offset: string | undefined;
  const scannedRows: InvoiceRecord[] = [];
  do {
    const params = new URLSearchParams({ pageSize: "100" });
    if (offset) params.set("offset", offset);

    const response = await airtableRequest(
      `${encodeURIComponent(INVOICES_TABLE)}?${params.toString()}`,
      { method: "GET" },
    );
    if (!response.ok) {
      const message = await parseAirtableError(response);
      throw new SyncEndpointError(`Failed to list Invoices by Order: ${message}`, 502);
    }

    const body = (await response.json()) as { records?: AirtableRecord[]; offset?: string };
    for (const record of body.records ?? []) {
      const fields = record.fields ?? {};
      const linksToOrder = Object.values(fields).some(
        (value) =>
          Array.isArray(value) &&
          value.some((item) => typeof item === "string" && item.trim() === orderRecordId),
      );
      if (!linksToOrder) continue;
      scannedRows.push(toInvoiceRecord(record));
    }

    offset = body.offset;
  } while (offset);

  return scannedRows;
}

type InvoiceCreateFields = {
  Order?: string[];
  Status?: string;
  "Amount Due"?: number;
  "Amount Paid"?: number;
  "Issued At"?: string;
  "Due At"?: string;
};

async function createInvoiceForOrder(fields: InvoiceCreateFields): Promise<InvoiceRecord> {
  const optionalFields = new Set(["Status", "Amount Due", "Amount Paid", "Issued At", "Due At"]);
  let fieldsToWrite: InvoiceCreateFields = { ...fields };

  while (true) {
    const response = await airtableRequest(`${encodeURIComponent(INVOICES_TABLE)}`, {
      method: "POST",
      body: JSON.stringify({ fields: fieldsToWrite }),
    });
    if (response.ok) {
      return toInvoiceRecord((await response.json()) as AirtableRecord);
    }

    const message = await parseAirtableError(response);
    const missingFieldMatch = message.match(/Unknown field name: "([^"]+)"/);
    const missingField = missingFieldMatch?.[1];

    if (missingField && optionalFields.has(missingField) && missingField in fieldsToWrite) {
      const nextFields: InvoiceCreateFields = {};
      for (const [key, value] of Object.entries(fieldsToWrite)) {
        if (key === missingField) continue;
        (nextFields as Record<string, unknown>)[key] = value;
      }
      fieldsToWrite = nextFields;
      continue;
    }

    throw new SyncEndpointError(`Failed to create Invoice: ${message}`, 502);
  }
}

async function linkOrderExternalToInvoice(
  orderExternalRecordId: string,
  invoiceRecordId: string,
): Promise<void> {
  const response = await airtableRequest(
    `${encodeURIComponent(ORDER_EXTERNALS_TABLE)}/${encodeURIComponent(orderExternalRecordId)}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        fields: {
          Invoice: [invoiceRecordId],
        },
      }),
    },
  );

  if (!response.ok) {
    const message = await parseAirtableError(response);
    if (message.includes('Unknown field name: "Invoice"') || message.includes("Unknown field names: Invoice")) {
      return;
    }
    throw new SyncEndpointError(`Failed to link Order External to Invoice: ${message}`, 502);
  }
}

async function getOrgIntegrationRecord(recordId: string): Promise<OrgIntegrationRecord> {
  const record = await getRecord(ORG_INTEGRATIONS_TABLE, recordId, "Org Integration");
  const fields = record.fields ?? {};

  return {
    recordId: record.id,
    provider: readString(fields.Provider),
    providerAccountId: readFirstLinkedId(fields["Provider Account"]),
    accessToken:
      readString(fields["Access Token"]) ??
      readString(fields["API Credential Alias"]) ??
      readString(fields["Access Token Alias"]),
    externalLocationId: readString(fields["External Location ID"]),
    status: readString(fields.Status),
  };
}

async function listOrgIntegrationsLinkedToOrganization(
  organizationRecordId: string,
): Promise<OrgIntegrationRecord[]> {
  const organization = await getRecord(ORGANIZATIONS_TABLE, organizationRecordId, "Organization");
  const fields = organization.fields ?? {};

  const preferredFieldNames = [
    "Org Integration",
    "Org Integrations",
    "Organization Integration",
    "Organization Integrations",
    "Active Org Integration",
    "Active Org Integrations",
  ];

  const candidateIds = new Set<string>();
  for (const fieldName of preferredFieldNames) {
    for (const id of readLinkedIds(fields[fieldName])) candidateIds.add(id);
  }

  if (candidateIds.size === 0) {
    for (const [key, value] of Object.entries(fields)) {
      if (!/integration/i.test(key)) continue;
      for (const id of readLinkedIds(value)) candidateIds.add(id);
    }
  }

  const rows: OrgIntegrationRecord[] = [];
  for (const recordId of candidateIds) {
    try {
      rows.push(await getOrgIntegrationRecord(recordId));
    } catch (error) {
      if (error instanceof SyncEndpointError && error.status === 404) {
        continue;
      }
      throw error;
    }
  }

  return rows;
}

async function listOrgIntegrationsByOrganization(
  organizationRecordId: string,
): Promise<OrgIntegrationRecord[]> {
  const escapedOrganizationId = escapeAirtableFormulaString(organizationRecordId);
  const formula = `FIND('${escapedOrganizationId}', ARRAYJOIN({Organization}))`;
  let offset: string | undefined;
  const rows: OrgIntegrationRecord[] = [];

  do {
    const params = new URLSearchParams({ pageSize: "100", filterByFormula: formula });
    if (offset) params.set("offset", offset);

    const response = await airtableRequest(
      `${encodeURIComponent(ORG_INTEGRATIONS_TABLE)}?${params.toString()}`,
      { method: "GET" },
    );
    if (!response.ok) {
      const message = await parseAirtableError(response);
      if (/Unknown field name/i.test(message) || /Unknown field names/i.test(message)) {
        return [];
      }
      throw new SyncEndpointError(`Failed to list Org Integrations by Organization: ${message}`, 502);
    }

    const body = (await response.json()) as { records?: AirtableRecord[]; offset?: string };
    for (const record of body.records ?? []) {
      const fields = record.fields ?? {};
      rows.push({
        recordId: record.id,
        provider: readString(fields.Provider),
        providerAccountId: readFirstLinkedId(fields["Provider Account"]),
        accessToken:
          readString(fields["Access Token"]) ??
          readString(fields["API Credential Alias"]) ??
          readString(fields["Access Token Alias"]),
        externalLocationId: readString(fields["External Location ID"]),
        status: readString(fields.Status),
      });
    }
    offset = body.offset;
  } while (offset);

  return rows;
}

async function getProviderAccountRecord(recordId: string): Promise<ProviderAccountRecord> {
  const record = await getRecord(PROVIDER_ACCOUNTS_TABLE, recordId, "Provider Account");
  const fields = record.fields ?? {};
  return {
    recordId: record.id,
    provider: readString(fields[PROVIDER_ACCOUNT_FIELDS.provider]),
    status: readString(fields[PROVIDER_ACCOUNT_FIELDS.status]),
    apiBaseUrl: readString(fields[PROVIDER_ACCOUNT_FIELDS.apiBaseUrl]),
    apiCredentialAlias:
      readString(fields[PROVIDER_ACCOUNT_FIELDS.apiCredentialAlias]) ??
      readString(fields[PROVIDER_ACCOUNT_FIELDS.accessTokenAlias]),
  };
}

async function getExternalActionRecord(recordId: string): Promise<ExternalActionRecord> {
  const record = await getRecord(EXTERNAL_ACTIONS_TABLE, recordId, "External Action");
  const fields = record.fields ?? {};
  return {
    recordId: record.id,
    provider: readString(fields[EXTERNAL_ACTION_FIELDS.provider]),
    providerEventType: readString(fields[EXTERNAL_ACTION_FIELDS.providerEventType]),
    providerEventId: readString(fields[EXTERNAL_ACTION_FIELDS.providerEventId]),
    providerReferenceId: readString(fields[EXTERNAL_ACTION_FIELDS.providerReferenceId]),
    direction: readString(fields[EXTERNAL_ACTION_FIELDS.direction]),
    actionType: readString(fields[EXTERNAL_ACTION_FIELDS.actionType]),
    status: readString(fields[EXTERNAL_ACTION_FIELDS.status]),
    writebackStatus: readString(fields[EXTERNAL_ACTION_FIELDS.writebackStatus]),
    writebackError: readString(fields[EXTERNAL_ACTION_FIELDS.writebackError]),
    rawProviderPayload: readString(fields[EXTERNAL_ACTION_FIELDS.rawProviderPayload]),
    occurredAt: readString(fields[EXTERNAL_ACTION_FIELDS.occurredAt]),
    retryable: readFlag(fields[EXTERNAL_ACTION_FIELDS.retryable]),
    attemptNumber: readNumber(fields[EXTERNAL_ACTION_FIELDS.attemptNumber]) ?? 0,
    orderExternalId: readFirstLinkedId(fields[EXTERNAL_ACTION_FIELDS.orderExternal]),
    providerAccountId: readFirstLinkedId(fields[EXTERNAL_ACTION_FIELDS.providerAccount]),
  };
}

function toExternalActionRecord(record: AirtableRecord): ExternalActionRecord {
  const fields = record.fields ?? {};
  return {
    recordId: record.id,
    provider: readString(fields[EXTERNAL_ACTION_FIELDS.provider]),
    providerEventType: readString(fields[EXTERNAL_ACTION_FIELDS.providerEventType]),
    providerEventId: readString(fields[EXTERNAL_ACTION_FIELDS.providerEventId]),
    providerReferenceId: readString(fields[EXTERNAL_ACTION_FIELDS.providerReferenceId]),
    direction: readString(fields[EXTERNAL_ACTION_FIELDS.direction]),
    actionType: readString(fields[EXTERNAL_ACTION_FIELDS.actionType]),
    status: readString(fields[EXTERNAL_ACTION_FIELDS.status]),
    writebackStatus: readString(fields[EXTERNAL_ACTION_FIELDS.writebackStatus]),
    writebackError: readString(fields[EXTERNAL_ACTION_FIELDS.writebackError]),
    rawProviderPayload: readString(fields[EXTERNAL_ACTION_FIELDS.rawProviderPayload]),
    occurredAt: readString(fields[EXTERNAL_ACTION_FIELDS.occurredAt]),
    retryable: readFlag(fields[EXTERNAL_ACTION_FIELDS.retryable]),
    attemptNumber: readNumber(fields[EXTERNAL_ACTION_FIELDS.attemptNumber]) ?? 0,
    orderExternalId: readFirstLinkedId(fields[EXTERNAL_ACTION_FIELDS.orderExternal]),
    providerAccountId: readFirstLinkedId(fields[EXTERNAL_ACTION_FIELDS.providerAccount]),
  };
}

async function findClientExternalByContext(
  clientId: string,
  providerAccountId: string,
): Promise<ClientExternalRecord | null> {
  const escapedClientId = escapeAirtableFormulaString(clientId);
  const escapedProviderAccountId = escapeAirtableFormulaString(providerAccountId);
  const formula = `AND(FIND('${escapedClientId}', ARRAYJOIN({Client})), FIND('${escapedProviderAccountId}', ARRAYJOIN({Provider Account})))`;
  const params = new URLSearchParams({
    maxRecords: "5",
    filterByFormula: formula,
  });

  const response = await airtableRequest(
    `${encodeURIComponent(CLIENT_EXTERNALS_TABLE)}?${params.toString()}`,
    { method: "GET" },
  );

  if (!response.ok) {
    const message = await parseAirtableError(response);
    throw new SyncEndpointError(`Failed to resolve Client External: ${message}`, 502);
  }

  const body = (await response.json()) as { records?: AirtableRecord[] };
  const records = (body.records ?? []).map((record) => toClientExternalRecord(record));

  return records[0] ?? null;
}

async function findLatestInboundInvoicePaymentActionByOrderExternal(
  orderExternalRecordId: string,
): Promise<ExternalActionRecord | null> {
  const escapedOrderExternalId = escapeAirtableFormulaString(orderExternalRecordId);
  const formula =
    `AND(` +
    `{${EXTERNAL_ACTION_FIELDS.direction}}='Inbound',` +
    `FIND('${escapedOrderExternalId}', ARRAYJOIN({${EXTERNAL_ACTION_FIELDS.orderExternal}})),` +
    `{${EXTERNAL_ACTION_FIELDS.providerEventType}}='invoice.payment_made'` +
    `)`;
  const params = new URLSearchParams({
    maxRecords: "1",
    filterByFormula: formula,
    "sort[0][field]": EXTERNAL_ACTION_FIELDS.createdAt,
    "sort[0][direction]": "desc",
  });

  const response = await airtableRequest(
    `${encodeURIComponent(EXTERNAL_ACTIONS_TABLE)}?${params.toString()}`,
    { method: "GET" },
  );
  if (!response.ok) {
    const message = await parseAirtableError(response);
    throw new SyncEndpointError(`Failed to load inbound payment External Action: ${message}`, 502);
  }
  const body = (await response.json()) as { records?: AirtableRecord[] };
  const first = body.records?.[0];
  return first ? toExternalActionRecord(first) : null;
}

async function findInboundExternalActionByProviderReference(
  orderExternalRecordId: string,
  providerReferenceId: string,
): Promise<ExternalActionRecord | null> {
  const escapedOrderExternalId = escapeAirtableFormulaString(orderExternalRecordId);
  const escapedReferenceId = escapeAirtableFormulaString(providerReferenceId);
  const formula =
    `AND(` +
    `{${EXTERNAL_ACTION_FIELDS.direction}}='Inbound',` +
    `FIND('${escapedOrderExternalId}', ARRAYJOIN({${EXTERNAL_ACTION_FIELDS.orderExternal}})),` +
    `{${EXTERNAL_ACTION_FIELDS.providerReferenceId}}='${escapedReferenceId}'` +
    `)`;
  const params = new URLSearchParams({
    maxRecords: "1",
    filterByFormula: formula,
    "sort[0][field]": EXTERNAL_ACTION_FIELDS.createdAt,
    "sort[0][direction]": "desc",
  });

  const response = await airtableRequest(
    `${encodeURIComponent(EXTERNAL_ACTIONS_TABLE)}?${params.toString()}`,
    { method: "GET" },
  );
  if (!response.ok) {
    const message = await parseAirtableError(response);
    throw new SyncEndpointError(`Failed to find inbound External Action by reference: ${message}`, 502);
  }
  const body = (await response.json()) as { records?: AirtableRecord[] };
  const first = body.records?.[0];
  return first ? toExternalActionRecord(first) : null;
}

async function listClientExternalsByContext(
  clientId: string,
  providerAccountId: string,
): Promise<ClientExternalRecord[]> {
  const escapedClientId = escapeAirtableFormulaString(clientId);
  const escapedProviderAccountId = escapeAirtableFormulaString(providerAccountId);
  async function queryByClientLink(linkField: string): Promise<ClientExternalRecord[] | null> {
    const formula = `AND(FIND('${escapedClientId}', ARRAYJOIN({${linkField}})), FIND('${escapedProviderAccountId}', ARRAYJOIN({${CLIENT_EXTERNAL_FIELDS.providerAccount}})))`;
    let offset: string | undefined;
    const rows: ClientExternalRecord[] = [];

    do {
      const params = new URLSearchParams({
        pageSize: "100",
        filterByFormula: formula,
      });
      if (offset) params.set("offset", offset);

      const response = await airtableRequest(
        `${encodeURIComponent(CLIENT_EXTERNALS_TABLE)}?${params.toString()}`,
        { method: "GET" },
      );
      if (!response.ok) {
        const message = await parseAirtableError(response);
        if (/Unknown field name/i.test(message) || /Unknown field names/i.test(message)) {
          return null;
        }
        throw new SyncEndpointError(`Failed to resolve Client Externals: ${message}`, 502);
      }

      const body = (await response.json()) as { records?: AirtableRecord[]; offset?: string };
      for (const record of body.records ?? []) rows.push(toClientExternalRecord(record));
      offset = body.offset;
    } while (offset);

    return rows;
  }

  for (const linkField of ["Client", "Clients", "Client Profile"]) {
    const rows = await queryByClientLink(linkField);
    if (rows && rows.length > 0) return rows;
  }

  const allRows = await listClientExternalsByClient(clientId);
  return allRows.filter((row) => row.providerAccountId === providerAccountId);
}

async function listClientExternalsByClient(
  clientId: string,
): Promise<ClientExternalRecord[]> {
  const escapedClientId = escapeAirtableFormulaString(clientId);
  async function queryByLinkField(linkField: string): Promise<ClientExternalRecord[] | null> {
    const formula = `FIND('${escapedClientId}', ARRAYJOIN({${linkField}}))`;
    let offset: string | undefined;
    const rows: ClientExternalRecord[] = [];

    do {
      const params = new URLSearchParams({
        pageSize: "100",
        filterByFormula: formula,
      });
      if (offset) params.set("offset", offset);

      const response = await airtableRequest(
        `${encodeURIComponent(CLIENT_EXTERNALS_TABLE)}?${params.toString()}`,
        { method: "GET" },
      );

      if (!response.ok) {
        const message = await parseAirtableError(response);
        if (/Unknown field name/i.test(message) || /Unknown field names/i.test(message)) {
          return null;
        }
        throw new SyncEndpointError(`Failed to resolve Client Externals by Client: ${message}`, 502);
      }

      const body = (await response.json()) as { records?: AirtableRecord[]; offset?: string };
      for (const record of body.records ?? []) rows.push(toClientExternalRecord(record));
      offset = body.offset;
    } while (offset);

    return rows;
  }

  for (const linkField of ["Client", "Clients"]) {
    const rows = await queryByLinkField(linkField);
    if (rows && rows.length > 0) return rows;
  }

  let offset: string | undefined;
  const scannedRows: ClientExternalRecord[] = [];
  do {
    const params = new URLSearchParams({ pageSize: "100" });
    if (offset) params.set("offset", offset);

    const response = await airtableRequest(
      `${encodeURIComponent(CLIENT_EXTERNALS_TABLE)}?${params.toString()}`,
      { method: "GET" },
    );
    if (!response.ok) {
      const message = await parseAirtableError(response);
      throw new SyncEndpointError(`Failed to resolve Client Externals by Client: ${message}`, 502);
    }

    const body = (await response.json()) as { records?: AirtableRecord[]; offset?: string };
    for (const record of body.records ?? []) {
      const fields = record.fields ?? {};
      const linksToClient = Object.values(fields).some(
        (value) =>
          Array.isArray(value) &&
          value.some((item) => typeof item === "string" && item.trim() === clientId),
      );
      if (!linksToClient) continue;
      scannedRows.push(toClientExternalRecord(record));
    }
    offset = body.offset;
  } while (offset);

  return scannedRows;
}

async function getClientIdFromClientProfile(clientProfileRecordId: string): Promise<string | null> {
  const record = await getRecord(CLIENT_PROFILES_TABLE, clientProfileRecordId, "Client Profile");
  const fields = record.fields ?? {};
  const clientField =
    airtableSchema.operations.fields.clientProfiles.client ??
    airtableSchema.operations.fields.clientProfiles.clientLink;
  return readFirstLinkedId(fields[clientField]) ?? readFirstLinkedId(fields.Client);
}

async function findActiveCardExternalsByClientExternal(
  clientExternalRecordId: string,
): Promise<CardExternalRecord[]> {
  const rows: CardExternalRecord[] = [];

  // Preferred path: trust direct link graph Client Externals -> Card Externals.
  const clientExternal = await getRecord(
    CLIENT_EXTERNALS_TABLE,
    clientExternalRecordId,
    "Client External",
  );
  const linkedCardExternalIds = readLinkedIds((clientExternal.fields ?? {})["Card Externals"]);

  if (linkedCardExternalIds.length > 0) {
    for (const cardExternalId of linkedCardExternalIds) {
      const record = await getRecord(CARD_EXTERNALS_TABLE, cardExternalId, "Card External");
      const fields = record.fields ?? {};
      if (!isEnabled(fields.Enabled)) continue;
      rows.push({
        recordId: record.id,
        externalCardId: readString(fields["External Card ID"]),
        modifiedAt: readString(fields["Modified At"]),
      });
    }
  } else {
    // Fallback path for legacy rows where reverse links are missing.
    const escapedClientExternalId = escapeAirtableFormulaString(clientExternalRecordId);
    const formula = `FIND('${escapedClientExternalId}', ARRAYJOIN({Client External}))`;
    let offset: string | undefined;

    do {
      const params = new URLSearchParams({
        pageSize: "100",
        filterByFormula: formula,
      });
      if (offset) params.set("offset", offset);

      const response = await airtableRequest(
        `${encodeURIComponent(CARD_EXTERNALS_TABLE)}?${params.toString()}`,
        { method: "GET" },
      );
      if (!response.ok) {
        const message = await parseAirtableError(response);
        throw new SyncEndpointError(`Failed to resolve Card Externals: ${message}`, 502);
      }

      const body = (await response.json()) as {
        records?: AirtableRecord[];
        offset?: string;
      };

      for (const record of body.records ?? []) {
        const fields = record.fields ?? {};
        if (!isEnabled(fields.Enabled)) continue;
        rows.push({
          recordId: record.id,
          externalCardId: readString(fields["External Card ID"]),
          modifiedAt: readString(fields["Modified At"]),
        });
      }

      offset = body.offset;
    } while (offset);
  }

  rows.sort((a, b) => {
    const aTs = Date.parse(a.modifiedAt ?? "");
    const bTs = Date.parse(b.modifiedAt ?? "");
    const aValid = Number.isFinite(aTs) ? aTs : -1;
    const bValid = Number.isFinite(bTs) ? bTs : -1;
    if (bValid !== aValid) return bValid - aValid;
    return b.recordId.localeCompare(a.recordId);
  });

  return rows;
}

async function listOrderItems(orderRecordId: string): Promise<OrderItem[]> {
  const escapedOrderId = escapeAirtableFormulaString(orderRecordId);

  async function queryByLinkField(linkField: string): Promise<OrderItem[] | null> {
    const formula = `FIND('${escapedOrderId}', ARRAYJOIN({${linkField}}))`;
    let offset: string | undefined;
    const rows: OrderItem[] = [];

    do {
      const params = new URLSearchParams({
        pageSize: "100",
        filterByFormula: formula,
      });
      if (offset) params.set("offset", offset);

      const response = await airtableRequest(
        `${encodeURIComponent(ORDER_ITEMS_TABLE)}?${params.toString()}`,
        { method: "GET" },
      );
      if (!response.ok) {
        const message = await parseAirtableError(response);
        if (/Unknown field name/i.test(message) || /Unknown field names/i.test(message)) {
          return null;
        }
        throw new SyncEndpointError(`Failed to load Order Items: ${message}`, 502);
      }

      const body = (await response.json()) as {
        records?: AirtableRecord[];
        offset?: string;
      };

      for (const record of body.records ?? []) {
        const fields = record.fields ?? {};
        rows.push({
          recordId: record.id,
          description: readOrderItemDescription(fields),
          netAmount: readOrderItemNetAmount(fields),
          lineSubtotal:
            readNumber(fields[ORDER_ITEM_FIELDS.lineSubtotal]) ??
            readNumber(fields["Line Subtotal"]),
          lineDiscount:
            readNumber(fields[ORDER_ITEM_FIELDS.lineDiscount]) ??
            readNumber(fields["Line Discount"]),
        });
      }

      offset = body.offset;
    } while (offset);

    return rows;
  }

  for (const fieldName of ["Order", "Orders", "Parent Order"]) {
    const rows = await queryByLinkField(fieldName);
    if (rows && rows.length > 0) return rows;
  }

  // Final fallback: scan rows and match any linked-record array containing this order record ID.
  // This protects us from unusual link field names while keeping behavior deterministic.
  let offset: string | undefined;
  const scannedRows: OrderItem[] = [];
  do {
    const params = new URLSearchParams({
      pageSize: "100",
    });
    if (offset) params.set("offset", offset);

    const response = await airtableRequest(
      `${encodeURIComponent(ORDER_ITEMS_TABLE)}?${params.toString()}`,
      { method: "GET" },
    );
    if (!response.ok) {
      const message = await parseAirtableError(response);
      throw new SyncEndpointError(`Failed to load Order Items: ${message}`, 502);
    }

    const body = (await response.json()) as {
      records?: AirtableRecord[];
      offset?: string;
    };

    for (const record of body.records ?? []) {
      const fields = record.fields ?? {};
      const linksToOrder = Object.values(fields).some(
        (value) =>
          Array.isArray(value) &&
          value.some((item) => typeof item === "string" && item.trim() === orderRecordId),
      );
      if (!linksToOrder) continue;

      scannedRows.push({
        recordId: record.id,
        description: readOrderItemDescription(fields),
        netAmount: readOrderItemNetAmount(fields),
        lineSubtotal:
          readNumber(fields[ORDER_ITEM_FIELDS.lineSubtotal]) ??
          readNumber(fields["Line Subtotal"]),
        lineDiscount:
          readNumber(fields[ORDER_ITEM_FIELDS.lineDiscount]) ??
          readNumber(fields["Line Discount"]),
      });
    }

    offset = body.offset;
  } while (offset);

  if (scannedRows.length > 0) return scannedRows;

  return [];
}

async function listOrderItemsForPromotionResolution(
  orderRecordId: string,
): Promise<OrderItemPromotionResolutionRecord[]> {
  const escapedOrderId = escapeAirtableFormulaString(orderRecordId);
  async function queryByLinkField(
    linkField: string,
  ): Promise<OrderItemPromotionResolutionRecord[] | null> {
    const formula = `FIND('${escapedOrderId}', ARRAYJOIN({${linkField}}))`;
    let offset: string | undefined;
    const rows: OrderItemPromotionResolutionRecord[] = [];

    do {
      const params = new URLSearchParams({ pageSize: "100", filterByFormula: formula });
      if (offset) params.set("offset", offset);

      const response = await airtableRequest(
        `${encodeURIComponent(ORDER_ITEMS_TABLE)}?${params.toString()}`,
        { method: "GET" },
      );
      if (!response.ok) {
        const message = await parseAirtableError(response);
        if (/Unknown field name/i.test(message) || /Unknown field names/i.test(message)) {
          return null;
        }
        throw new SyncEndpointError(`Failed to load Order Items for resolution: ${message}`, 502);
      }

      const body = (await response.json()) as { records?: AirtableRecord[]; offset?: string };
      for (const record of body.records ?? []) {
        const fields = record.fields ?? {};
        rows.push({
          recordId: record.id,
          status: readString(fields[ORDER_ITEM_FIELDS.status]),
          draftPromotionRedemptionCount: readNumber(fields[ORDER_ITEM_FIELDS.draftPromotionRedemptionCount]),
          unresolvedDraftPromotionRedemptions: readFlag(
            fields[ORDER_ITEM_FIELDS.unresolvedDraftPromotionRedemptions],
          ),
          orderLinkIds: readLinkedIds(fields[linkField]),
          promotionRedemptionIds: readLinkedIds(fields[ORDER_ITEM_FIELDS.promotionRedemptions]),
        });
      }

      offset = body.offset;
    } while (offset);

    return rows;
  }

  let rows: OrderItemPromotionResolutionRecord[] = [];
  for (const linkField of [ORDER_ITEM_FIELDS.order, "Orders", "Parent Order"]) {
    const resolved = await queryByLinkField(linkField);
    if (resolved && resolved.length > 0) {
      rows = resolved;
      break;
    }
  }

  if (rows.length === 0) {
    let offset: string | undefined;
    do {
      const params = new URLSearchParams({ pageSize: "100" });
      if (offset) params.set("offset", offset);

      const response = await airtableRequest(
        `${encodeURIComponent(ORDER_ITEMS_TABLE)}?${params.toString()}`,
        { method: "GET" },
      );
      if (!response.ok) {
        const message = await parseAirtableError(response);
        throw new SyncEndpointError(`Failed to load Order Items for resolution: ${message}`, 502);
      }

      const body = (await response.json()) as { records?: AirtableRecord[]; offset?: string };
      for (const record of body.records ?? []) {
        const fields = record.fields ?? {};
        const orderLinkIds = Object.values(fields)
          .filter((value) => Array.isArray(value))
          .flatMap((value) => readLinkedIds(value));
        if (!orderLinkIds.includes(orderRecordId)) continue;

        rows.push({
          recordId: record.id,
          status: readString(fields[ORDER_ITEM_FIELDS.status]),
          draftPromotionRedemptionCount: readNumber(fields[ORDER_ITEM_FIELDS.draftPromotionRedemptionCount]),
          unresolvedDraftPromotionRedemptions: readFlag(
            fields[ORDER_ITEM_FIELDS.unresolvedDraftPromotionRedemptions],
          ),
          orderLinkIds: [orderRecordId],
          promotionRedemptionIds: readLinkedIds(fields[ORDER_ITEM_FIELDS.promotionRedemptions]),
        });
      }

      offset = body.offset;
    } while (offset);
  }

  for (const row of rows) {
    if (row.orderLinkIds.length !== 1) {
      throw new SyncEndpointError(
        `Ambiguous Order link structure on Order Item ${row.recordId}.`,
        409,
      );
    }
    if (row.orderLinkIds[0] !== orderRecordId) {
      throw new SyncEndpointError(
        `Order Item ${row.recordId} is linked to a different Order.`,
        409,
      );
    }
  }

  return rows;
}

async function listOrderItemsForOpen(orderRecordId: string): Promise<OrderItemOpenRecord[]> {
  const escapedOrderId = escapeAirtableFormulaString(orderRecordId);
  async function queryByLinkField(linkField: string): Promise<OrderItemOpenRecord[] | null> {
    const formula = `FIND('${escapedOrderId}', ARRAYJOIN({${linkField}}))`;
    let offset: string | undefined;
    const rows: OrderItemOpenRecord[] = [];

    do {
      const params = new URLSearchParams({ pageSize: "100", filterByFormula: formula });
      if (offset) params.set("offset", offset);

      const response = await airtableRequest(
        `${encodeURIComponent(ORDER_ITEMS_TABLE)}?${params.toString()}`,
        { method: "GET" },
      );
      if (!response.ok) {
        const message = await parseAirtableError(response);
        if (/Unknown field name/i.test(message) || /Unknown field names/i.test(message)) {
          return null;
        }
        throw new SyncEndpointError(`Failed to load Order Items for open transition: ${message}`, 502);
      }

      const body = (await response.json()) as { records?: AirtableRecord[]; offset?: string };
      for (const record of body.records ?? []) {
        const fields = record.fields ?? {};
        rows.push({
          recordId: record.id,
          status: readString(fields[ORDER_ITEM_FIELDS.status]),
          readyToActivate: readFlag(fields[ORDER_ITEM_FIELDS.readyToActivate]),
          activeStateValid: readFlag(fields[ORDER_ITEM_FIELDS.activeStateValid]),
          orderLinkIds: readLinkedIds(fields[linkField]),
        });
      }

      offset = body.offset;
    } while (offset);

    return rows;
  }

  let rows: OrderItemOpenRecord[] = [];
  for (const linkField of [ORDER_ITEM_FIELDS.order, "Orders", "Parent Order"]) {
    const resolved = await queryByLinkField(linkField);
    if (resolved && resolved.length > 0) {
      rows = resolved;
      break;
    }
  }

  if (rows.length === 0) {
    let offset: string | undefined;
    do {
      const params = new URLSearchParams({ pageSize: "100" });
      if (offset) params.set("offset", offset);

      const response = await airtableRequest(
        `${encodeURIComponent(ORDER_ITEMS_TABLE)}?${params.toString()}`,
        { method: "GET" },
      );
      if (!response.ok) {
        const message = await parseAirtableError(response);
        throw new SyncEndpointError(`Failed to load Order Items for open transition: ${message}`, 502);
      }

      const body = (await response.json()) as { records?: AirtableRecord[]; offset?: string };
      for (const record of body.records ?? []) {
        const fields = record.fields ?? {};
        const orderLinkIds = Object.values(fields)
          .filter((value) => Array.isArray(value))
          .flatMap((value) => readLinkedIds(value));
        if (!orderLinkIds.includes(orderRecordId)) continue;

        rows.push({
          recordId: record.id,
          status: readString(fields[ORDER_ITEM_FIELDS.status]),
          readyToActivate: readFlag(fields[ORDER_ITEM_FIELDS.readyToActivate]),
          activeStateValid: readFlag(fields[ORDER_ITEM_FIELDS.activeStateValid]),
          orderLinkIds: [orderRecordId],
        });
      }

      offset = body.offset;
    } while (offset);
  }

  for (const row of rows) {
    if (row.orderLinkIds.length !== 1) {
      throw new SyncEndpointError(
        `Ambiguous Order link structure on Order Item ${row.recordId}.`,
        409,
      );
    }
    if (row.orderLinkIds[0] !== orderRecordId) {
      throw new SyncEndpointError(
        `Order Item ${row.recordId} is linked to a different Order.`,
        409,
      );
    }
  }

  return rows;
}

async function listPromotionRedemptionsForOrderItem(
  orderItemRecordId: string,
): Promise<PromotionRedemptionResolutionRecord[]> {
  const escapedOrderItemId = escapeAirtableFormulaString(orderItemRecordId);
  async function queryByLinkField(
    linkField: string,
  ): Promise<PromotionRedemptionResolutionRecord[] | null> {
    const formula = `FIND('${escapedOrderItemId}', ARRAYJOIN({${linkField}}))`;
    let offset: string | undefined;
    const rows: PromotionRedemptionResolutionRecord[] = [];

    do {
      const params = new URLSearchParams({ pageSize: "100", filterByFormula: formula });
      if (offset) params.set("offset", offset);

      const response = await airtableRequest(
        `${encodeURIComponent(PROMOTION_REDEMPTIONS_TABLE)}?${params.toString()}`,
        { method: "GET" },
      );
      if (!response.ok) {
        const message = await parseAirtableError(response);
        if (/Unknown field name/i.test(message) || /Unknown field names/i.test(message)) {
          return null;
        }
        throw new SyncEndpointError(`Failed to load Promotion Redemptions: ${message}`, 502);
      }

      const body = (await response.json()) as { records?: AirtableRecord[]; offset?: string };
      for (const record of body.records ?? []) {
        const fields = record.fields ?? {};
        rows.push({
          recordId: record.id,
          status: readString(fields[PROMOTION_REDEMPTION_FIELDS.status]),
          readyToApply: readFlag(fields[PROMOTION_REDEMPTION_FIELDS.readyToApply]),
          applicationRequested: readFlag(fields[PROMOTION_REDEMPTION_FIELDS.applicationRequested]),
          appliedDiscountContribution: readNumber(
            fields[PROMOTION_REDEMPTION_FIELDS.appliedDiscountContribution],
          ),
          promotionNameSnapshot: readString(
            fields[PROMOTION_REDEMPTION_FIELDS.promotionNameSnapshot],
          ),
          orderItemLinkIds: readLinkedIds(fields[linkField]),
        });
      }

      offset = body.offset;
    } while (offset);

    return rows;
  }

  let rows: PromotionRedemptionResolutionRecord[] = [];
  for (const linkField of [PROMOTION_REDEMPTION_FIELDS.orderItem, "Order Items", "Parent Order Item"]) {
    const resolved = await queryByLinkField(linkField);
    if (resolved && resolved.length > 0) {
      rows = resolved;
      break;
    }
  }

  if (rows.length === 0) {
    let offset: string | undefined;
    do {
      const params = new URLSearchParams({ pageSize: "100" });
      if (offset) params.set("offset", offset);

      const response = await airtableRequest(
        `${encodeURIComponent(PROMOTION_REDEMPTIONS_TABLE)}?${params.toString()}`,
        { method: "GET" },
      );
      if (!response.ok) {
        const message = await parseAirtableError(response);
        throw new SyncEndpointError(`Failed to load Promotion Redemptions: ${message}`, 502);
      }

      const body = (await response.json()) as { records?: AirtableRecord[]; offset?: string };
      for (const record of body.records ?? []) {
        const fields = record.fields ?? {};
        const orderItemLinkIds = Object.values(fields)
          .filter((value) => Array.isArray(value))
          .flatMap((value) => readLinkedIds(value));
        if (!orderItemLinkIds.includes(orderItemRecordId)) continue;

        rows.push({
          recordId: record.id,
          status: readString(fields[PROMOTION_REDEMPTION_FIELDS.status]),
          readyToApply: readFlag(fields[PROMOTION_REDEMPTION_FIELDS.readyToApply]),
          applicationRequested: readFlag(fields[PROMOTION_REDEMPTION_FIELDS.applicationRequested]),
          appliedDiscountContribution: readNumber(
            fields[PROMOTION_REDEMPTION_FIELDS.appliedDiscountContribution],
          ),
          promotionNameSnapshot: readString(
            fields[PROMOTION_REDEMPTION_FIELDS.promotionNameSnapshot],
          ),
          orderItemLinkIds: [orderItemRecordId],
        });
      }

      offset = body.offset;
    } while (offset);
  }

  for (const row of rows) {
    if (row.orderItemLinkIds.length !== 1) {
      throw new SyncEndpointError(
        `Ambiguous Order Item link structure on Promotion Redemption ${row.recordId}.`,
        409,
      );
    }
    if (row.orderItemLinkIds[0] !== orderItemRecordId) {
      throw new SyncEndpointError(
        `Promotion Redemption ${row.recordId} is linked to a different Order Item.`,
        409,
      );
    }
  }

  return rows;
}

async function updatePromotionRedemptionStatus(
  promotionRedemptionRecordId: string,
  status: "Applied",
): Promise<void> {
  const response = await airtableRequest(
    `${encodeURIComponent(PROMOTION_REDEMPTIONS_TABLE)}/${encodeURIComponent(promotionRedemptionRecordId)}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        fields: {
          [PROMOTION_REDEMPTION_FIELDS.status]: status,
        },
      }),
    },
  );

  if (!response.ok) {
    const message = await parseAirtableError(response);
    throw new SyncEndpointError(`Failed to update Promotion Redemption status: ${message}`, 502);
  }
}

async function updateOrderStatus(
  orderRecordId: string,
  status: "Open",
): Promise<void> {
  const response = await airtableRequest(
    `${encodeURIComponent(ORDERS_TABLE)}/${encodeURIComponent(orderRecordId)}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        fields: {
          [ORDER_FIELDS.status]: status,
        },
      }),
    },
  );

  if (!response.ok) {
    const message = await parseAirtableError(response);
    throw new SyncEndpointError(`Failed to update Order status: ${message}`, 502);
  }
}

async function updateOrderItemStatus(
  orderItemRecordId: string,
  status: "Active",
): Promise<void> {
  const response = await airtableRequest(
    `${encodeURIComponent(ORDER_ITEMS_TABLE)}/${encodeURIComponent(orderItemRecordId)}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        fields: {
          [ORDER_ITEM_FIELDS.status]: status,
        },
      }),
    },
  );

  if (!response.ok) {
    const message = await parseAirtableError(response);
    throw new SyncEndpointError(`Failed to update Order Item status: ${message}`, 502);
  }
}

function toInvoiceExternalRecord(record: AirtableRecord): InvoiceExternalRecord {
  const fields = record.fields ?? {};
  const externalProcessRawPayload = readString(fields["External Process Raw Payload"]);
  const webhookRawPayload = readString(fields["Webhook Raw Payload"]);
  return {
    recordId: record.id,
    invoiceId: readFirstLinkedId(fields.Invoice),
    orderId: readFirstLinkedId(fields.Order),
    orgIntegrationId: readFirstLinkedId(fields["Org Integration"]),
    externalInvoiceId: readString(fields["External Invoice ID"]),
    externalOrderId: readString(fields["External Order ID"]),
    externalStatus: readString(fields["External Status"]),
    amountDue: readNumber(fields["Amount Due"]),
    amountPaid: readNumber(fields["Amount Paid"]),
    amountRefunded: readNumber(fields["Amount Refunded"]),
    issuedAt: readString(fields["Issued At"]),
    dueAt: readString(fields["Due At"]),
    paidAt: readString(fields["Paid At"]),
    voidedAt: readString(fields["Voided At"]),
    hostedInvoiceUrl: readString(fields["Hosted Invoice URL"]),
    lastSyncedAt: readString(fields["Last Synced At"]),
    lastSyncActivityAt: readString(fields["Last Sync Activity At"]),
    webhookReceivedAt: readString(fields["Webhook Received At"]),
    lastWebhookEventType: readString(fields["Last Webhook Event Type"]),
    lastWebhookEventId: readString(fields["Last Webhook Event ID"]),
    externalProcessRawPayload,
    webhookRawPayload,
    deliveryMethod: readString(fields["Delivery Method"]),
    saveCard: readBoolean(fields["Save Card"]) ?? readBoolean(fields["Save Card on File"]),
    phoneSnapshot: readString(fields["Phone Snapshot"]),
    sentAt: readString(fields["Sent At"]),
    lastSendError: readString(fields["Last Send Error"]),
    sendAttemptCount: readNumber(fields["Send Attempt Count"]),
    externalProcessStatus: readString(fields["External Process Status"]),
    externalProcessAction: readString(fields["External Process Action"]),
    externalProcessAt: readString(fields["External Process At"]),
    externalProcessError: readString(fields["External Process Error"]),
    externalActionIdempotencyKey: readString(fields["External Action Idempotency Key"]),
    writebackStatus: readString(fields["Writeback Status"]),
    writebackAt: readString(fields["Writeback At"]),
    writebackError: readString(fields["Writeback Error"]),
    writebackRetryCount: readNumber(fields["Writeback Retry Count"]),
    writebackLastAttemptAt: readString(fields["Writeback Last Attempt At"]),
    reconciliationStatus: readString(fields["Reconciliation Status"]),
    lastApiResponseCode: readNumber(fields["Last API Response Code"]),
    lastApiMessage: readString(fields["Last API Message"]),
    internalNotes: readString(fields["Internal Notes"]),
    rawPayload: externalProcessRawPayload ?? webhookRawPayload ?? readString(fields["Raw Payload"]),
    syncStatus: readString(fields["Sync Status"]),
    syncError: readString(fields["Sync Error"]),
  };
}

async function findInvoiceExternalByInvoiceAndOrgIntegration(
  invoiceRecordId: string,
  orgIntegrationRecordId: string,
): Promise<InvoiceExternalRecord | null> {
  const escapedInvoiceId = escapeAirtableFormulaString(invoiceRecordId);
  const escapedOrgIntegrationId = escapeAirtableFormulaString(orgIntegrationRecordId);
  const formula = `AND(FIND('${escapedInvoiceId}', ARRAYJOIN({Invoice})), FIND('${escapedOrgIntegrationId}', ARRAYJOIN({Org Integration})))`;
  const params = new URLSearchParams({
    maxRecords: "2",
    filterByFormula: formula,
  });

  const response = await airtableRequest(
    `${encodeURIComponent(INVOICE_EXTERNALS_TABLE)}?${params.toString()}`,
    { method: "GET" },
  );

  if (!response.ok) {
    const message = await parseAirtableError(response);
    throw new SyncEndpointError(`Failed to resolve Invoice External: ${message}`, 502);
  }

  const body = (await response.json()) as { records?: AirtableRecord[] };
  const records = body.records ?? [];
  if (records.length === 0) return null;
  if (records.length > 1) {
    throw new SyncEndpointError(
      "Multiple Invoice External rows found for the same Invoice and Org Integration.",
      409,
    );
  }

  return toInvoiceExternalRecord(records[0]);
}

async function getInvoiceExternalById(
  invoiceExternalRecordId: string,
): Promise<InvoiceExternalRecord> {
  const record = await getRecord(
    INVOICE_EXTERNALS_TABLE,
    invoiceExternalRecordId,
    "Invoice External",
  );
  return toInvoiceExternalRecord(record);
}

type InvoiceExternalWriteFields = {
  Invoice?: string[];
  Order?: string[];
  "Org Integration"?: string[];
  "External Invoice ID"?: string;
  "External Order ID"?: string;
  "External Status"?: string;
  "Amount Due"?: number;
  "Amount Paid"?: number;
  "Amount Refunded"?: number;
  "Issued At"?: string;
  "Due At"?: string;
  "Paid At"?: string;
  "Voided At"?: string;
  "Hosted Invoice URL"?: string;
  "External Process Action"?: "Create Invoice" | "Send Invoice" | "Cancel Invoice" | "Mark Paid" | "Sync";
  "External Process Status"?: "Not Started" | "Pending" | "Succeeded" | "Failed";
  "External Process At"?: string;
  "External Process Error"?: string;
  "External Action Idempotency Key"?: string;
  "External Process Raw Payload"?: string;
  "Writeback Status"?: "Not Started" | "Pending" | "Succeeded" | "Failed";
  "Writeback At"?: string;
  "Writeback Error"?: string;
  "Writeback Retry Count"?: number;
  "Writeback Last Attempt At"?: string;
  "Reconciliation Status"?:
    | "Not Started"
    | "In Progress"
    | "Complete"
    | "External Failed"
    | "Writeback Failed"
    | "Writeback Failed After External Success"
    | "Needs Review";
  "Last Synced At"?: string;
  "Last Sync Activity At"?: string;
  "Webhook Received At"?: string;
  "Last Webhook Event Type"?: string;
  "Last Webhook Event ID"?: string;
  "Webhook Raw Payload"?: string;
  "Delivery Method"?: "Email" | "Sms" | "Link" | "URL";
  "Save Card"?: boolean;
  "Save Card on File"?: boolean;
  "Phone Snapshot"?: string;
  "Sent At"?: string;
  "Last Send Error"?: string;
  "Send Attempt Count"?: number;
  "Last API Response Code"?: number;
  "Last API Message"?: string;
  "Internal Notes"?: string;
  "Raw Payload"?: string;
  "Sync Status"?: "Synced" | "Failed";
  "Sync Error"?: string;
};

function isUnknownOptionalFieldError(message: string, key: string): boolean {
  return (
    message.includes(`Unknown field name: "${key}"`) ||
    message.includes(`Unknown field names: ${key}`)
  );
}

async function createInvoiceExternal(
  fields: InvoiceExternalWriteFields,
): Promise<InvoiceExternalRecord> {
  const optionalFields = new Set([
    "Hosted Invoice URL",
    "Voided At",
    "Webhook Received At",
    "Last Webhook Event Type",
    "Last Webhook Event ID",
    "Webhook Raw Payload",
    "Delivery Method",
    "Save Card",
    "Save Card on File",
    "Phone Snapshot",
    "Sent At",
    "Last Send Error",
    "Send Attempt Count",
    "Internal Notes",
    "Raw Payload",
    "Sync Status",
    "Sync Error",
  ]);
  let fieldsToWrite: InvoiceExternalWriteFields = { ...fields };

  while (true) {
    const response = await airtableRequest(`${encodeURIComponent(INVOICE_EXTERNALS_TABLE)}`, {
      method: "POST",
      body: JSON.stringify({ fields: fieldsToWrite }),
    });

    if (response.ok) {
      return toInvoiceExternalRecord((await response.json()) as AirtableRecord);
    }

    const message = await parseAirtableError(response);
    const optionalFieldToDrop = [...optionalFields].find(
      (key) => key in fieldsToWrite && isUnknownOptionalFieldError(message, key),
    );

    if (optionalFieldToDrop) {
      const nextFields: InvoiceExternalWriteFields = {};
      for (const [key, value] of Object.entries(fieldsToWrite)) {
        if (key === optionalFieldToDrop) continue;
        (nextFields as Record<string, unknown>)[key] = value;
      }
      fieldsToWrite = nextFields;
      continue;
    }

    throw new SyncEndpointError(`Failed to create Invoice External: ${message}`, 502);
  }
}

async function updateInvoiceExternal(
  invoiceExternalRecordId: string,
  fields: InvoiceExternalWriteFields,
): Promise<void> {
  const optionalFields = new Set([
    "Hosted Invoice URL",
    "Voided At",
    "Webhook Received At",
    "Last Webhook Event Type",
    "Last Webhook Event ID",
    "Webhook Raw Payload",
    "Delivery Method",
    "Save Card",
    "Save Card on File",
    "Phone Snapshot",
    "Sent At",
    "Last Send Error",
    "Send Attempt Count",
    "Internal Notes",
    "Raw Payload",
    "Sync Status",
    "Sync Error",
  ]);
  let fieldsToWrite: InvoiceExternalWriteFields = { ...fields };

  while (true) {
    const response = await airtableRequest(
      `${encodeURIComponent(INVOICE_EXTERNALS_TABLE)}/${encodeURIComponent(invoiceExternalRecordId)}`,
      {
        method: "PATCH",
        body: JSON.stringify({ fields: fieldsToWrite }),
      },
    );

    if (response.ok) return;

    const message = await parseAirtableError(response);
    const optionalFieldToDrop = [...optionalFields].find(
      (key) => key in fieldsToWrite && isUnknownOptionalFieldError(message, key),
    );

    if (optionalFieldToDrop) {
      const nextFields: InvoiceExternalWriteFields = {};
      for (const [key, value] of Object.entries(fieldsToWrite)) {
        if (key === optionalFieldToDrop) continue;
        (nextFields as Record<string, unknown>)[key] = value;
      }
      fieldsToWrite = nextFields;
      continue;
    }

    throw new SyncEndpointError(`Failed to update Invoice External: ${message}`, 502);
  }
}

async function writeInvoiceExternalFailure(
  invoiceExternalRecordId: string,
  errorMessage: string,
  rawPayload?: string,
): Promise<void> {
  await updateInvoiceExternal(invoiceExternalRecordId, {
    "External Process Status": "Failed",
    "External Process At": new Date().toISOString(),
    "External Process Error": errorMessage,
    "Writeback Status": "Failed",
    "Writeback At": new Date().toISOString(),
    "Writeback Error": errorMessage,
    "Writeback Last Attempt At": new Date().toISOString(),
    "Reconciliation Status": "Needs Review",
    "Last Synced At": new Date().toISOString(),
    "Last Sync Activity At": new Date().toISOString(),
    "Last API Message": errorMessage,
    ...(rawPayload ? { "External Process Raw Payload": rawPayload } : {}),
    ...(rawPayload ? { "Raw Payload": rawPayload } : {}),
  });
}

async function listOrderExternalsByInvoice(
  invoiceRecordId: string,
): Promise<OrderExternalRecord[]> {
  const escapedInvoiceId = escapeAirtableFormulaString(invoiceRecordId);
  const formula = `FIND('${escapedInvoiceId}', ARRAYJOIN({Invoice}))`;

  let offset: string | undefined;
  const rows: OrderExternalRecord[] = [];
  do {
    const params = new URLSearchParams({ pageSize: "100", filterByFormula: formula });
    if (offset) params.set("offset", offset);

    const response = await airtableRequest(
      `${encodeURIComponent(ORDER_EXTERNALS_TABLE)}?${params.toString()}`,
      { method: "GET" },
    );
    if (!response.ok) {
      const message = await parseAirtableError(response);
      if (message.includes('Unknown field name: "Invoice"') || message.includes("Unknown field names: Invoice")) {
        const invoice = await getInvoiceRecord(invoiceRecordId);
        if (!invoice.orderId) return [];
        return listOrderExternalsByOrder(invoice.orderId);
      }
      throw new SyncEndpointError(`Failed to list Order Externals by Invoice: ${message}`, 502);
    }

    const body = (await response.json()) as { records?: AirtableRecord[]; offset?: string };
    for (const record of body.records ?? []) rows.push(toOrderExternalRecord(record));
    offset = body.offset;
  } while (offset);

  return rows;
}

type OrderExternalWritebackFields = {
  "External Actions"?: string[];
  "Sync Status"?: "Pending" | "Synced" | "Failed" | "Ignored";
  "Sync Error"?: string;
  "Last Synced At"?: string;
  "Last Provider Activity At"?: string;
  "External Action"?: BillingAction;
  "External Process Status"?: "Not Started" | "Pending" | "Succeeded" | "Failed";
  "External Process At"?: string;
  "External Process Error"?: string;
  "External Process Action"?: string;
  "External Action Idempotency Key"?: string;
  "External Process Raw Payload"?: string;
  "Writeback Status"?: "Not Started" | "Pending" | "Succeeded" | "Failed";
  "Writeback At"?: string;
  "Writeback Error"?: string;
  "Writeback Retry Count"?: number;
  "Writeback Last Attempt At"?: string;
  "Reconciliation Status"?:
    | "Not Started"
    | "In Progress"
    | "Complete"
    | "External Failed"
    | "Writeback Failed"
    | "Writeback Failed After External Success"
    | "Needs Review";
  "Last Sync Activity At"?: string;
  "Last API Response Code"?: number;
  "Last API Message"?: string;
  "External Payment ID"?: string;
  "External Payment Status Snapshot"?: string;
  "External Order ID"?: string;
  "External Invoice ID"?: string;
  "External Invoice URL"?: string;
  "External Invoice Status Snapshot"?: string;
  "External Invoice URL Snapshot"?: string;
  "External Invoice Sent At Snapshot"?: string;
  "External Invoice Paid At Snapshot"?: string;
  "Current External Status"?: string;
  "Customer ID Snapshot"?: string;
  "Card ID Snapshot"?: string;
  "Amount Snapshot Cents"?: number;
  "Amount Snapshot"?: number;
  "Raw Payload"?: string;
  "Raw Payload Snapshot"?: string;
};

async function createOrderExternal(fields: Record<string, unknown>): Promise<OrderExternalRecord> {
  let fieldsToWrite = { ...fields };
  const optionalFields = new Set(["Global Provider Account", "Sync Status", "Writeback Status"]);

  while (true) {
    const response = await airtableRequest(encodeURIComponent(ORDER_EXTERNALS_TABLE), {
      method: "POST",
      body: JSON.stringify({ fields: fieldsToWrite }),
    });

    if (response.ok) {
      return toOrderExternalRecord((await response.json()) as AirtableRecord);
    }

    const message = await parseAirtableError(response);
    const missingFieldMatch = message.match(/Unknown field name: "([^"]+)"/);
    const missingField = missingFieldMatch?.[1];
    if (missingField && optionalFields.has(missingField) && missingField in fieldsToWrite) {
      const nextFields: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(fieldsToWrite)) {
        if (key === missingField) continue;
        nextFields[key] = value;
      }
      fieldsToWrite = nextFields;
      continue;
    }

    throw new SyncEndpointError(`Failed to create Order External: ${message}`, 502);
  }
}

async function updateOrderExternal(
  orderExternalRecordId: string,
  fields: OrderExternalWritebackFields,
): Promise<void> {
  const path = `${encodeURIComponent(ORDER_EXTERNALS_TABLE)}/${encodeURIComponent(orderExternalRecordId)}`;
  const optionalFields = new Set([
    "External Actions",
    "Sync Status",
    "Sync Error",
    "Last Synced At",
    "Last Provider Activity At",
    "External Action",
    "Raw Payload",
    "External Invoice URL",
    "External Payment Status Snapshot",
    "External Invoice Status Snapshot",
    "External Invoice URL Snapshot",
    "External Invoice Sent At Snapshot",
    "External Invoice Paid At Snapshot",
    "Current External Status",
    "Customer ID Snapshot",
    "Card ID Snapshot",
    "Amount Snapshot Cents",
    "Amount Snapshot",
    "Raw Payload Snapshot",
    "External Process Status",
    "External Process At",
    "External Process Error",
    "External Process Action",
    "External Action Idempotency Key",
    "External Process Raw Payload",
    "Writeback Status",
    "Writeback At",
    "Writeback Error",
    "Writeback Retry Count",
    "Writeback Last Attempt At",
    "Reconciliation Status",
    "Last Sync Activity At",
    "Last API Response Code",
    "Last API Message",
  ]);
  let fieldsToWrite: OrderExternalWritebackFields = { ...fields };

  while (true) {
    const response = await airtableRequest(path, {
      method: "PATCH",
      body: JSON.stringify({ fields: fieldsToWrite }),
    });
    if (response.ok) return;

    const message = await parseAirtableError(response);
    const missingFieldMatch = message.match(/Unknown field name: "([^"]+)"/);
    const missingField = missingFieldMatch?.[1];

    // Backward-compatible behavior: if optional fields aren't present in this base, retry without them.
    if (missingField && optionalFields.has(missingField) && missingField in fieldsToWrite) {
      const nextFields: OrderExternalWritebackFields = {};
      for (const [key, value] of Object.entries(fieldsToWrite)) {
        if (key === missingField) continue;
        (nextFields as Record<string, unknown>)[key] = value;
      }
      fieldsToWrite = nextFields;
      continue;
    }

    throw new SyncEndpointError(`Failed to update Order External: ${message}`, 502);
  }
}

async function updateOrderBillingStatus(
  orderRecordId: string,
  billingStatus:
    | "Not Started"
    | "Processing"
    | "Payment Pending"
    | "Paid"
    | "Failed"
    | "Partially Refunded"
    | "Refunded",
): Promise<void> {
  const response = await airtableRequest(
    `${encodeURIComponent(ORDERS_TABLE)}/${encodeURIComponent(orderRecordId)}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        fields: {
          "Billing Status": billingStatus,
        },
      }),
    },
  );

  if (!response.ok) {
    const message = await parseAirtableError(response);
    throw new SyncEndpointError(`Failed to update Order billing status: ${message}`, 502);
  }
}

async function updateOrderBillingState(
  orderRecordId: string,
  billingState:
    | "Not Started"
    | "In Progress"
    | "Awaiting Payment"
    | "Paid"
    | "Closed"
    | "Needs Review",
): Promise<void> {
  const response = await airtableRequest(
    `${encodeURIComponent(ORDERS_TABLE)}/${encodeURIComponent(orderRecordId)}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        fields: {
          [ORDER_FIELDS.billingState]: billingState,
        },
      }),
    },
  );

  if (!response.ok) {
    const message = await parseAirtableError(response);
    throw new SyncEndpointError(`Failed to update Order billing state: ${message}`, 502);
  }
}

async function updateOrderAmountPaid(
  orderRecordId: string,
  amountPaid: number,
): Promise<void> {
  const response = await airtableRequest(
    `${encodeURIComponent(ORDERS_TABLE)}/${encodeURIComponent(orderRecordId)}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        fields: {
          "Amount Paid": amountPaid,
        },
      }),
    },
  );

  if (!response.ok) {
    const message = await parseAirtableError(response);
    throw new SyncEndpointError(`Failed to update Order Amount Paid: ${message}`, 502);
  }
}

async function updateOrderCanonicalPayment(input: {
  orderRecordId: string;
  amountPaid: number;
  status?: string;
  billingState?: string;
  paidAt?: string;
}): Promise<void> {
  const fields: Record<string, unknown> = {
    [ORDER_FIELDS.amountPaid]: input.amountPaid,
  };
  if (input.status) fields[ORDER_FIELDS.status] = input.status;
  if (input.billingState) fields[ORDER_FIELDS.billingState] = input.billingState;
  if (input.paidAt) fields[ORDER_FIELDS.paidAt] = input.paidAt;

  const response = await airtableRequest(
    `${encodeURIComponent(ORDERS_TABLE)}/${encodeURIComponent(input.orderRecordId)}`,
    {
      method: "PATCH",
      body: JSON.stringify({ fields }),
    },
  );
  if (!response.ok) {
    const message = await parseAirtableError(response);
    throw new SyncEndpointError(`Failed to update canonical Order payment fields: ${message}`, 502);
  }
}

async function updateInvoicePaymentLink(
  invoiceRecordId: string,
  paymentLink: string,
): Promise<void> {
  const path = `${encodeURIComponent(INVOICES_TABLE)}/${encodeURIComponent(invoiceRecordId)}`;
  const fieldsToWrite: Record<string, unknown> = { "Payment Link": paymentLink };

  while (true) {
    const response = await airtableRequest(path, {
      method: "PATCH",
      body: JSON.stringify({ fields: fieldsToWrite }),
    });
    if (response.ok) return;

    const message = await parseAirtableError(response);
    const missingFieldMatch = message.match(/Unknown field name: "([^"]+)"/);
    const missingField = missingFieldMatch?.[1];
    if (missingField === "Payment Link" && missingField in fieldsToWrite) {
      return;
    }

    throw new SyncEndpointError(`Failed to update Invoice Payment Link: ${message}`, 502);
  }
}

async function writeOrderExternalFailure(
  orderExternalRecordId: string,
  action: BillingAction,
  errorMessage: string,
  rawPayload?: string,
): Promise<void> {
  await updateOrderExternal(orderExternalRecordId, {
    "Sync Status": "Failed",
    "Sync Error": errorMessage,
    "Last Synced At": new Date().toISOString(),
    "External Action": action,
    "External Process Status": "Failed",
    "External Process At": new Date().toISOString(),
    "External Process Error": errorMessage,
    "Writeback Status": "Failed",
    "Writeback At": new Date().toISOString(),
    "Writeback Error": errorMessage,
    "Writeback Last Attempt At": new Date().toISOString(),
    "Reconciliation Status": "Needs Review",
    "Last Sync Activity At": new Date().toISOString(),
    "Last API Message": errorMessage,
    ...(rawPayload ? { "Raw Payload": rawPayload } : {}),
    ...(rawPayload ? { "External Process Raw Payload": rawPayload } : {}),
  });
}

function validateOrdersSecret(request: Request): void {
  clientSyncRepo.validateAirtableSecret(request);
}

export const ordersRepo = {
  getOrderRecord,
  getOrderSendInvoiceRecord,
  getOrderResolveLifecycleRecord,
  getOrderOpenRecord,
  getOrderExternalRecord,
  getExternalActionRecord,
  findLatestInboundInvoicePaymentActionByOrderExternal,
  findInboundExternalActionByProviderReference,
  getProviderAccountRecord,
  getClientIdFromClientProfile,
  findOrderExternalByExternalInvoiceId,
  findOrderExternalByExternalOrderId,
  findClientExternalByContext,
  listClientExternalsByContext,
  listClientExternalsByClient,
  findActiveCardExternalsByClientExternal,
  listOrderExternalsByOrder,
  listOrderExternalsByInvoice,
  listOrderItems,
  listOrderItemsForPromotionResolution,
  listOrderItemsForOpen,
  listPromotionRedemptionsForOrderItem,
  updateOrderStatus,
  updateOrderItemStatus,
  updatePromotionRedemptionStatus,
  updateOrderBillingStatus,
  updateOrderBillingState,
  updateOrderAmountPaid,
  updateOrderCanonicalPayment,
  createOrderExternal,
  updateOrderExternal,
  writeOrderExternalFailure,
};

export const invoicesRepo = {
  getInvoiceRecord,
  getInvoiceExternalById,
  findSingleInvoiceByOrder,
  findInvoiceExternalByInvoiceAndOrgIntegration,
  listInvoicesByOrder,
  createInvoiceForOrder,
  linkOrderExternalToInvoice,
  createInvoiceExternal,
  updateInvoicePaymentLink,
  updateInvoiceExternal,
  writeInvoiceExternalFailure,
};

export const providerContextRepo = {
  getOrgIntegrationRecord,
  listOrgIntegrationsLinkedToOrganization,
  listOrgIntegrationsByOrganization,
  resolveSquareProviderContext,
};

export const providerBillingRepo = {
  cancelInvoice,
  chargeWithCardOnFile,
  createInvoiceFromOrderItems,
  createOrderFromOrderItems,
  getInvoiceDetails,
  getInvoicePublicUrl,
  publishInvoice,
  updateInvoiceSettings,
};

export const ordersWorkflowRepo = {
  validateOrdersSecret,
};
