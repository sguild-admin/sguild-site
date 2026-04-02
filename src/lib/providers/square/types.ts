export type SquareAuthContext = {
  provider: "Square";
  providerAccountId: string;
  accessTokenAlias: string;
  accessToken: string;
};

export type SquareProviderContext = SquareAuthContext & {
  externalLocationId: string;
};

export type SquareSyncMode = "created" | "updated" | "verified";

export type SquareCustomerSyncInput = {
  recordReferenceId: string;
  externalCustomerId: string | null;
  canonicalFirstName: string | null;
  canonicalLastName: string | null;
  nameSnapshot: string | null;
  phoneSnapshot: string | null;
  matchPhoneNormalized: string | null;
  emailSnapshot: string | null;
};

export type SquareCustomerSyncResult = {
  externalCustomerId: string;
  mode: SquareSyncMode;
  path: "create" | "update" | "verify" | "matched";
  squarePhoneNumber: string | null;
  squareGivenName: string | null;
  squareFamilyName: string | null;
  squareNickname: string | null;
};

export type SquareOrderItemInput = {
  description: string | null;
  netAmount: number | null;
};

export type SquareCreatePaymentInput = {
  context: SquareProviderContext;
  idempotencyKeyPrefix: string;
  externalCustomerId: string;
  externalCardId: string;
  amountDue: number;
  currency: string;
  lineItems?: SquareOrderItemInput[];
};

export type SquareCreatePaymentResult = {
  externalPaymentId: string;
  externalOrderId: string | null;
  rawPayload: string;
};

export type SquareCreateOrderInput = {
  context: SquareProviderContext;
  idempotencyKey: string;
  externalCustomerId: string;
  orderItems: SquareOrderItemInput[];
  currency: string;
};

export type SquareCreateOrderResult = {
  externalOrderId: string;
  rawPayload: string;
};

export type SquareCreateInvoiceFromOrderInput = {
  context: SquareProviderContext;
  orderIdempotencyKey: string;
  invoiceIdempotencyKey: string;
  externalCustomerId: string;
  orderItems: SquareOrderItemInput[];
  currency: string;
  deliveryMethod?: string | null;
  saveCard?: boolean;
};

export type SquareCreateInvoiceFromOrderResult = {
  externalOrderId: string;
  externalInvoiceId: string;
  externalInvoiceUrl: string | null;
  rawPayload: string;
};

export type SquareListEventsInput = {
  context: SquareAuthContext;
  startAt: string;
  endAt: string;
  cursor?: string | null;
  eventTypes?: string[];
  pageSize: number;
};

export type SquareListEventsResult = {
  events: unknown[];
  cursor: string | null;
};
