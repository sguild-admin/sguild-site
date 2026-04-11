export type SquareWebhookPayload = {
  merchant_id?: string;
  type?: string;
  event_id?: string;
  created_at?: string;
  data?: unknown;
};

export type MetaWebhookPayload = {
  entry?: Array<{
    id?: string;
    changes?: Array<{
      field?: string;
      value?: { leadgen_id?: string; page_id?: string };
    }>;
  }>;
};

export type BackfillSquareWebhooksRequestDto = {
  accessTokenAlias: string;
  dryRun: boolean;
  startAt: string;
  endAt: string;
  eventTypes: string[];
  maxEvents: number;
  pageSize: number;
};

export type BackfillSquareWebhooksFailure = {
  providerEventId: string;
  eventType: string;
  error: string;
};

export type BackfillSquareWebhooksResponseDto = {
  ok: true;
  dryRun: boolean;
  accessTokenAlias: string;
  startAt: string;
  endAt: string;
  eventTypes: string[];
  fetchedEvents: number;
  scannedEvents: number;
  createdEvents: number;
  existingEvents: number;
  processedEvents: number;
  alreadyProcessedEvents: number;
  failedEvents: number;
  failures: BackfillSquareWebhooksFailure[];
};

export type BackfillExternalActionsFromWebhookEventsRequestDto = {
  dryRun: boolean;
  pageSize: number;
  maxEvents: number;
  onlySupportedEvents: boolean;
};

export type BackfillExternalActionsFromWebhookEventsFailure = {
  eventRecordId: string;
  providerEventId: string | null;
  eventType: string | null;
  error: string;
};

export type BackfillExternalActionsFromWebhookEventsResponseDto = {
  ok: true;
  dryRun: boolean;
  scannedEvents: number;
  eligibleEvents: number;
  createdOrUpdatedExternalActions: number;
  skippedUnsupportedEvents: number;
  failedEvents: number;
  failures: BackfillExternalActionsFromWebhookEventsFailure[];
};
