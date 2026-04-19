import { airtableSchema } from "@/config/airtable-schema";
import { SyncEndpointError } from "@/lib/errors";
import {
  airtableRequest,
  escapeAirtableFormulaString,
  parseAirtableError,
} from "@/lib/airtable/client";
import { resolveSquareProviderContext } from "@/lib/providers/square/provider-context";
import type { BillingAction } from "@/lib/types/billing";
import { clientSyncRepo } from "@/modules/clients";
import type { RetryClassification } from "@/modules/external-actions";

const EXTERNAL_ACTIONS_TABLE = airtableSchema.operations.tables.externalActions;
const ORG_INTEGRATIONS_TABLE = airtableSchema.operations.tables.organizationIntegrations;

type AirtableRecord = {
  id: string;
  fields?: Record<string, unknown>;
};

export type ExternalActionType =
  | "Create"
  | "Charge"
  | "Send"
  | "Refresh"
  | "Void"
  | "Refund"
  | "Webhook"
  | "Reconcile"
  | "Retry";

export type ExternalActionDirection = "Outbound" | "Inbound";
export type ExternalActionStatus = "Pending" | "Succeeded" | "Failed" | "Ignored";
export type ExternalActionWritebackStatus = "Not Started" | "Pending" | "Succeeded" | "Failed";
export type ExternalActionEntityType = "Client" | "Card" | "Order" | "Invoice" | "Refund";

export type ExternalActionRecord = {
  recordId: string;
  provider: string | null;
  providerEventId: string | null;
  direction: ExternalActionDirection | null;
  orderExternalId: string | null;
  invoiceExternalId: string | null;
  actionType: ExternalActionType | null;
  status: ExternalActionStatus | null;
  attemptNumber: number | null;
};

export type OrgIntegrationRecord = {
  recordId: string;
  provider: string | null;
  providerAccountId: string | null;
  accessToken: string | null;
  externalLocationId: string | null;
};

export type CreateExternalActionInput = {
  orgIntegrationRecordId?: string;
  providerAccountRecordId?: string;
  externalEntityType: ExternalActionEntityType;
  actionType: ExternalActionType;
  direction: ExternalActionDirection;
  triggerSource?: "Manual" | "Automation" | "Webhook" | "Script" | "Backfill";
  occurredAt?: string;
  status?: ExternalActionStatus;
  attemptNumber?: number;
  retryable?: boolean;
  retryClassification?: RetryClassification;
  provider?: string;
  providerEventType?: string;
  providerReferenceId?: string;
  providerEventId?: string;
  httpStatusCode?: number;
  errorSummary?: string;
  requestPayload?: string;
  responsePayload?: string;
  rawProviderPayload?: string;
  writebackStatus?: ExternalActionWritebackStatus;
  writebackSucceededAt?: string;
  writebackError?: string;
  writebackRetryCount?: number;
  writebackLastAttemptAt?: string;
  orderExternalRecordId?: string;
  invoiceExternalRecordId?: string;
  refundExternalRecordId?: string;
};

type UpdateExternalActionInput = Partial<CreateExternalActionInput>;

function readString(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
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
  const first = value[0];
  return typeof first === "string" && first.trim().length > 0 ? first.trim() : null;
}

function readNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function asDirection(value: unknown): ExternalActionDirection | null {
  const parsed = readString(value);
  if (parsed === "Inbound" || parsed === "Outbound") return parsed;
  return null;
}

function asStatus(value: unknown): ExternalActionStatus | null {
  const parsed = readString(value);
  if (parsed === "Pending" || parsed === "Succeeded" || parsed === "Failed" || parsed === "Ignored") {
    return parsed;
  }
  return null;
}

function asActionType(value: unknown): ExternalActionType | null {
  const parsed = readString(value);
  if (
    parsed === "Create" ||
    parsed === "Charge" ||
    parsed === "Send" ||
    parsed === "Refresh" ||
    parsed === "Void" ||
    parsed === "Refund" ||
    parsed === "Webhook" ||
    parsed === "Reconcile" ||
    parsed === "Retry"
  ) {
    return parsed;
  }
  return null;
}

function toFields(input: CreateExternalActionInput | UpdateExternalActionInput): Record<string, unknown> {
  const fields: Record<string, unknown> = {};

  if ("externalEntityType" in input && input.externalEntityType) fields["External Entity Type"] = input.externalEntityType;
  if ("actionType" in input && input.actionType) fields["Action Type"] = input.actionType;
  if ("direction" in input && input.direction) fields.Direction = input.direction;
  if (input.triggerSource) fields["Trigger Source"] = input.triggerSource;
  if (input.occurredAt) fields["Occurred At"] = input.occurredAt;
  if (input.status) fields.Status = input.status;
  if (input.attemptNumber != null) fields["Attempt Number"] = input.attemptNumber;
  if (typeof input.retryable === "boolean") fields.Retryable = input.retryable;
  if (input.retryClassification != null) fields["Retry Classification"] = input.retryClassification;
  // Provider is a computed lookup in this base and must not be written directly.
  if (input.providerEventType) fields["Provider Event Type"] = input.providerEventType;
  if (input.providerReferenceId) fields["Provider Reference ID"] = input.providerReferenceId;
  if (input.providerEventId) fields["Provider Event ID"] = input.providerEventId;
  if (input.httpStatusCode != null) fields["HTTP Status Code"] = input.httpStatusCode;
  if (input.errorSummary != null) fields["Error Summary"] = input.errorSummary;
  if (input.requestPayload != null) fields["Request Payload"] = input.requestPayload;
  if (input.responsePayload != null) fields["Response Payload"] = input.responsePayload;
  if (input.rawProviderPayload != null) fields["Raw Provider Payload"] = input.rawProviderPayload;
  if (input.writebackStatus) fields["Writeback Status"] = input.writebackStatus;
  if (input.writebackSucceededAt) fields["Writeback Succeeded At"] = input.writebackSucceededAt;
  if (input.writebackError != null) fields["Writeback Error"] = input.writebackError;
  if (input.writebackRetryCount != null) fields["Writeback Retry Count"] = input.writebackRetryCount;
  if (input.writebackLastAttemptAt) fields["Writeback Last Attempt At"] = input.writebackLastAttemptAt;
  if (input.orgIntegrationRecordId) fields["Organization Integration"] = [input.orgIntegrationRecordId];
  if (input.providerAccountRecordId) fields["Provider Account"] = [input.providerAccountRecordId];
  if (input.orderExternalRecordId) fields["Order External"] = [input.orderExternalRecordId];
  if (input.invoiceExternalRecordId) fields["Invoice External"] = [input.invoiceExternalRecordId];
  if (input.refundExternalRecordId) fields["Refund External"] = [input.refundExternalRecordId];

  return fields;
}

function getRemovableFieldFromAirtableError(message: string): string | null {
  const unknownMatch = message.match(/Unknown field name: "([^"]+)"/);
  if (unknownMatch?.[1]) return unknownMatch[1];

  const computedMatch = message.match(/Field "([^"]+)" cannot accept a value because the field is computed/i);
  if (computedMatch?.[1]) return computedMatch[1];

  return null;
}

export async function createExternalAction(input: CreateExternalActionInput): Promise<string> {
  const fields = toFields(input);
  const optionalFields = new Set(Object.keys(fields));
  let nextFields = { ...fields };

  while (true) {
    const response = await airtableRequest(encodeURIComponent(EXTERNAL_ACTIONS_TABLE), {
      method: "POST",
      body: JSON.stringify({ fields: nextFields }),
    });
    if (response.ok) {
      const body = (await response.json()) as AirtableRecord;
      return body.id;
    }

    const message = await parseAirtableError(response);
    const removableField = getRemovableFieldFromAirtableError(message);
    if (removableField && optionalFields.has(removableField) && removableField in nextFields) {
      const reduced: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(nextFields)) {
        if (key === removableField) continue;
        reduced[key] = value;
      }
      nextFields = reduced;
      continue;
    }

    throw new SyncEndpointError(`Failed to create External Action: ${message}`, 502);
  }
}

export async function updateExternalAction(
  externalActionRecordId: string,
  input: UpdateExternalActionInput,
): Promise<void> {
  const fields = toFields(input);
  if (Object.keys(fields).length === 0) return;

  const path = `${encodeURIComponent(EXTERNAL_ACTIONS_TABLE)}/${encodeURIComponent(externalActionRecordId)}`;
  const optionalFields = new Set(Object.keys(fields));
  let nextFields = { ...fields };

  while (true) {
    const response = await airtableRequest(path, {
      method: "PATCH",
      body: JSON.stringify({ fields: nextFields }),
    });
    if (response.ok) return;

    const message = await parseAirtableError(response);
    const removableField = getRemovableFieldFromAirtableError(message);
    if (removableField && optionalFields.has(removableField) && removableField in nextFields) {
      const reduced: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(nextFields)) {
        if (key === removableField) continue;
        reduced[key] = value;
      }
      nextFields = reduced;
      if (Object.keys(nextFields).length === 0) return;
      continue;
    }

    throw new SyncEndpointError(`Failed to update External Action: ${message}`, 502);
  }
}

export async function countExternalActionsByOrderExternal(orderExternalRecordId: string): Promise<number> {
  const escaped = escapeAirtableFormulaString(orderExternalRecordId);
  const formula = `AND(FIND('${escaped}', ARRAYJOIN({Order External})), {Direction}='Outbound')`;
  let offset: string | undefined;
  let count = 0;

  do {
    const params = new URLSearchParams({ pageSize: "100", filterByFormula: formula });
    if (offset) params.set("offset", offset);

    const response = await airtableRequest(
      `${encodeURIComponent(EXTERNAL_ACTIONS_TABLE)}?${params.toString()}`,
      { method: "GET" },
    );
    if (!response.ok) {
      const message = await parseAirtableError(response);
      throw new SyncEndpointError(`Failed to count External Actions: ${message}`, 502);
    }

    const body = (await response.json()) as { records?: AirtableRecord[]; offset?: string };
    count += body.records?.length ?? 0;
    offset = body.offset;
  } while (offset);

  return count;
}

export async function countExternalActionsByInvoiceExternal(invoiceExternalRecordId: string): Promise<number> {
  const escaped = escapeAirtableFormulaString(invoiceExternalRecordId);
  const formula = `AND(FIND('${escaped}', ARRAYJOIN({Invoice External})), {Direction}='Outbound')`;
  let offset: string | undefined;
  let count = 0;

  do {
    const params = new URLSearchParams({ pageSize: "100", filterByFormula: formula });
    if (offset) params.set("offset", offset);

    const response = await airtableRequest(
      `${encodeURIComponent(EXTERNAL_ACTIONS_TABLE)}?${params.toString()}`,
      { method: "GET" },
    );
    if (!response.ok) {
      const message = await parseAirtableError(response);
      throw new SyncEndpointError(`Failed to count External Actions: ${message}`, 502);
    }

    const body = (await response.json()) as { records?: AirtableRecord[]; offset?: string };
    count += body.records?.length ?? 0;
    offset = body.offset;
  } while (offset);

  return count;
}

export async function findInboundExternalActionByIdentity(input: {
  provider: string;
  providerEventId: string;
  providerAccountRecordId?: string | null;
}): Promise<ExternalActionRecord | null> {
  const escapedProvider = escapeAirtableFormulaString(input.provider);
  const escapedEventId = escapeAirtableFormulaString(input.providerEventId);
  const accountClause = input.providerAccountRecordId
    ? `, FIND('${escapeAirtableFormulaString(input.providerAccountRecordId)}', ARRAYJOIN({Provider Account}))`
    : "";
  const tryFormula = async (formula: string): Promise<ExternalActionRecord | null> => {
    const params = new URLSearchParams({ pageSize: "1", filterByFormula: formula });
    const response = await airtableRequest(
      `${encodeURIComponent(EXTERNAL_ACTIONS_TABLE)}?${params.toString()}`,
      { method: "GET" },
    );
    if (!response.ok) {
      const message = await parseAirtableError(response);
      throw new SyncEndpointError(`Failed to find inbound External Action: ${message}`, 502);
    }

    const body = (await response.json()) as { records?: AirtableRecord[] };
    const first = body.records?.[0];
    if (!first) return null;
    const fields = first.fields ?? {};

    return {
      recordId: first.id,
      provider: readString(fields.Provider),
      providerEventId: readString(fields["Provider Event ID"]),
      direction: asDirection(fields.Direction),
      orderExternalId: readFirstLinkedId(fields["Order External"]),
      invoiceExternalId: readFirstLinkedId(fields["Invoice External"]),
      actionType: asActionType(fields["Action Type"]),
      status: asStatus(fields.Status),
      attemptNumber: readNumber(fields["Attempt Number"]),
    };
  };

  const primaryFormula = `AND({Direction}='Inbound', {Provider}='${escapedProvider}', {Provider Event ID}='${escapedEventId}'${accountClause})`;

  try {
    return await tryFormula(primaryFormula);
  } catch (error) {
    if (!(error instanceof SyncEndpointError)) throw error;
    const message = error.message.toLowerCase();
    const providerEventIdMissing =
      message.includes("unknown field name: \"provider event id\"") ||
      message.includes("unknown field names: provider event id");
    if (!providerEventIdMissing) throw error;
  }

  // Backward-compatible fallback for bases that have not added Provider Event ID yet.
  const rawPayloadFormula = `AND({Direction}='Inbound', {Provider}='${escapedProvider}', FIND('${escapedEventId}', {Raw Provider Payload})${accountClause})`;
  try {
    return await tryFormula(rawPayloadFormula);
  } catch (error) {
    if (!(error instanceof SyncEndpointError)) throw error;
    const message = error.message.toLowerCase();
    const rawPayloadMissing =
      message.includes("unknown field name: \"raw provider payload\"") ||
      message.includes("unknown field names: raw provider payload");
    if (rawPayloadMissing) return null;
    throw error;
  }
}

export async function getOrgIntegrationRecord(recordId: string): Promise<OrgIntegrationRecord> {
  const response = await airtableRequest(
    `${encodeURIComponent(ORG_INTEGRATIONS_TABLE)}/${encodeURIComponent(recordId)}`,
    { method: "GET" },
  );

  if (response.status === 404) {
    throw new SyncEndpointError("Org Integration not found.", 404);
  }
  if (!response.ok) {
    const message = await parseAirtableError(response);
    throw new SyncEndpointError(`Failed to load Org Integration: ${message}`, 502);
  }

  const record = (await response.json()) as AirtableRecord;
  const fields = record.fields ?? {};
  return {
    recordId: record.id,
    provider: readString(fields.Provider),
    providerAccountId:
      readFirstLinkedId(fields["Provider Account"]) ??
      readString(fields["Provider Account"]) ??
      readString(fields["Provider Account ID"]),
    accessToken:
      readString(fields["Access Token"]) ??
      readString(fields["API Credential Alias"]) ??
      readString(fields["Access Token Alias"]),
    externalLocationId: readString(fields["External Location ID"]),
  };
}

export async function getIntegrationRecord(orgIntegrationRecordId: string) {
  return getOrgIntegrationRecord(orgIntegrationRecordId);
}

export function resolveIntegrationProviderContext(
  orgIntegration: OrgIntegrationRecord,
  action: BillingAction,
) {
  return resolveSquareProviderContext(orgIntegration, action);
}

export function validateIntegrationSecret(request: Request): void {
  clientSyncRepo.validateAirtableSecret(request);
}
