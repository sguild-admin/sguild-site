import { SyncEndpointError } from "@/lib/errors";
import { airtableSchema } from "@/config/airtable-schema";
import {
  airtableRequest,
  escapeAirtableFormulaString,
  parseAirtableError,
} from "@/lib/airtable/client";
import { createCreditLedgerEntry } from "@/modules/credit-ledger-entries/repo";
import type { GrantCreditsRequest, GrantCreditsResponse, GrantCreditsItemResult, GrantCreditsSummary } from "./dto";

const ORDERS_TABLE = airtableSchema.operations.tables.orders;
const ORDER_ITEMS_TABLE = airtableSchema.operations.tables.orderItems;
const CREDIT_ACCOUNTS_TABLE = airtableSchema.operations.tables.creditAccounts;
const CREDIT_LEDGER_ENTRIES_TABLE = airtableSchema.operations.tables.creditLedgerEntries;
const CLIENT_PROFILES_TABLE = airtableSchema.operations.tables.clientProfiles;

const ORDER_FIELDS = airtableSchema.operations.fields.orders;
const ORDER_ITEM_FIELDS = airtableSchema.operations.fields.orderItems;
const CREDIT_ACCOUNT_FIELDS = airtableSchema.operations.fields.creditAccounts;
const CREDIT_LEDGER_ENTRY_FIELDS = airtableSchema.operations.fields.creditLedgerEntries;

type AirtableRecord = {
  id: string;
  fields?: Record<string, unknown>;
};

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

async function getRecord(
  tableName: string,
  recordId: string,
  label: string,
): Promise<AirtableRecord> {
  const response = await airtableRequest(
    `${encodeURIComponent(tableName)}/${encodeURIComponent(recordId)}`,
    { method: "GET" },
  );

  if (response.status === 404) {
    throw new SyncEndpointError(`${label} not found.`, 404);
  }
  if (!response.ok) {
    const message = await parseAirtableError(response);
    throw new SyncEndpointError(`Failed to load ${label}: ${message}`, 502);
  }

  return (await response.json()) as AirtableRecord;
}

export interface GrantCreditsOrderRecord {
  recordId: string;
  status: string | null;
  hasException: boolean;
  exceptionReason: string | null;
  clientProfileId: string | null;
}

export interface GrantCreditsOrderItemRecord {
  recordId: string;
  status: string | null;
  creditsGrantedTotal: number | null;
  creditLedgerEntryIds: string[];
}

export interface GrantCreditsCreditAccountRecord {
  recordId: string;
  status: string | null;
}

export interface GrantCreditsCreditLedgerEntryRecord {
  recordId: string;
  orderItemId: string | null;
  deltaCredits: number | null;
  entryType: string | null;
}

async function getGrantCreditsOrderRecord(recordId: string): Promise<GrantCreditsOrderRecord> {
  const record = await getRecord(ORDERS_TABLE, recordId, "Order");
  const fields = record.fields ?? {};

  return {
    recordId: record.id,
    status: readString(fields[ORDER_FIELDS.status]),
    hasException: readFlag(fields[ORDER_FIELDS.hasException]),
    exceptionReason: readString(fields[ORDER_FIELDS.exceptionReason]),
    clientProfileId: readFirstLinkedId(fields[ORDER_FIELDS.clientProfile]),
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
          creditLedgerEntryIds: readLinkedIds(fields[ORDER_ITEM_FIELDS.creditLedgerEntries]),
        });
      }
    }
    
    offset = body.offset;
  } while (offset);

  console.log(`[GRANT_CREDITS] Fallback complete: scanned ${totalScanned} total items, found ${scannedRows.length} matches`);
  return scannedRows;
}

async function findCreditAccountByClientProfile(clientProfileId: string): Promise<GrantCreditsCreditAccountRecord | null> {
  console.log(`[GRANT_CREDITS] Looking for Credit Account for Client Profile: ${clientProfileId}`);
  
  // Try multiple field names with formula
  for (const fieldName of ["Client Profile", "Client Profiles", "Profile"]) {
    console.log(`[GRANT_CREDITS] Trying formula with field: ${fieldName}`);
    const escapedClientProfileId = escapeAirtableFormulaString(clientProfileId);
    const formula = `FIND('${escapedClientProfileId}', ARRAYJOIN({${fieldName}}))`;
    
    const params = new URLSearchParams({ pageSize: "10", filterByFormula: formula });

    const response = await airtableRequest(
      `${encodeURIComponent(CREDIT_ACCOUNTS_TABLE)}?${params.toString()}`,
      { method: "GET" },
    );

    if (!response.ok) {
      const message = await parseAirtableError(response);
      if (/Unknown field name/i.test(message) || /Unknown field names/i.test(message)) {
        console.log(`[GRANT_CREDITS] Field ${fieldName} not found, trying next...`);
        continue;
      }
      console.error(`[GRANT_CREDITS] Query failed for field ${fieldName}: ${message}`);
      // Don't throw, try fallback
      continue;
    }

    const body = (await response.json()) as { records?: AirtableRecord[] };
    const records = body.records ?? [];
    
    if (records.length > 0) {
      console.log(`[GRANT_CREDITS] Formula found ${records.length} Credit Account(s)`);
      
      if (records.length > 1) {
        throw new SyncEndpointError("Multiple Credit Accounts found for this Client Profile", 409);
      }

      const fields = records[0].fields ?? {};
      return {
        recordId: records[0].id,
        status: readString(fields[CREDIT_ACCOUNT_FIELDS.status]),
      };
    }
  }

  // Fallback: scan all Credit Accounts
  console.log(`[GRANT_CREDITS] Using fallback scan for Credit Accounts`);
  let offset: string | undefined;
  let totalScanned = 0;

  do {
    const params = new URLSearchParams({ pageSize: "100" });
    if (offset) params.set("offset", offset);

    const response = await airtableRequest(
      `${encodeURIComponent(CREDIT_ACCOUNTS_TABLE)}?${params.toString()}`,
      { method: "GET" },
    );

    if (!response.ok) {
      const message = await parseAirtableError(response);
      console.error(`[GRANT_CREDITS] Fallback scan failed: ${message}`);
      throw new SyncEndpointError(`Failed to find Credit Account: ${message}`, 502);
    }

    const body = (await response.json()) as { records?: AirtableRecord[]; offset?: string };
    const records = body.records ?? [];
    totalScanned += records.length;
    
    for (const rec of records) {
      const fields = rec.fields ?? {};
      
      // Try multiple possible Client Profile field names
      let linkedClientProfileIds: string[] = [];
      for (const fieldName of ["Client Profile", "Client Profiles", "Profile"]) {
        const value = fields[fieldName];
        if (Array.isArray(value)) {
          linkedClientProfileIds = readLinkedIds(value);
          if (linkedClientProfileIds.length > 0) break;
        }
      }
      
      if (linkedClientProfileIds.includes(clientProfileId)) {
        console.log(`[GRANT_CREDITS] Fallback found Credit Account: ${rec.id}`);
        
        // Count how many match (should be exactly 1)
        let matchCount = 0;
        for (const profileId of linkedClientProfileIds) {
          if (profileId === clientProfileId) matchCount++;
        }
        
        if (matchCount > 1) {
          console.warn(`[GRANT_CREDITS] Warning: Multiple Client Profile links in single Credit Account`);
        }
        
        const accountStatus = readString(fields[CREDIT_ACCOUNT_FIELDS.status]);
        console.log(`[GRANT_CREDITS] Credit Account status: ${accountStatus}`);
        
        return {
          recordId: rec.id,
          status: accountStatus,
        };
      }
    }
    
    offset = body.offset;
  } while (offset);

  console.log(`[GRANT_CREDITS] No Credit Account found. Scanned ${totalScanned} total accounts`);
  return null;
}

async function listPurchaseCreditEntriesForOrderItems(
  creditAccountId: string,
  orderItemIds: string[],
): Promise<GrantCreditsCreditLedgerEntryRecord[]> {
  if (orderItemIds.length === 0) return [];

  const escapedCreditAccountId = escapeAirtableFormulaString(creditAccountId);
  const orderItemFilters = orderItemIds.map((id) => `'${escapeAirtableFormulaString(id)}'`).join(",");
  const formula = `AND(FIND('${escapedCreditAccountId}', ARRAYJOIN({Credit Account})), {Entry Type}="Purchase Credit", OR(${orderItemIds.map(() => `FIND('{Order Item}', '${escapeAirtableFormulaString("")}')`).join(", ")}))`;
  
  // Simpler approach: get all purchase credit entries for this account and filter client-side
  let offset: string | undefined;
  const rows: GrantCreditsCreditLedgerEntryRecord[] = [];

  do {
    const params = new URLSearchParams({ pageSize: "100", filterByFormula: `AND({Credit Account}='${escapedCreditAccountId}', {Entry Type}="Purchase Credit")` });
    if (offset) params.set("offset", offset);

    const response = await airtableRequest(
      `${encodeURIComponent(CREDIT_LEDGER_ENTRIES_TABLE)}?${params.toString()}`,
      { method: "GET" },
    );

    if (!response.ok) {
      const message = await parseAirtableError(response);
      throw new SyncEndpointError(`Failed to list Credit Ledger Entries: ${message}`, 502);
    }

    const body = (await response.json()) as { records?: AirtableRecord[]; offset?: string };
    for (const rec of body.records ?? []) {
      const fields = rec.fields ?? {};
      const orderItemId = readFirstLinkedId(fields[CREDIT_LEDGER_ENTRY_FIELDS.orderItem]);
      if (orderItemIds.includes(orderItemId || "")) {
        rows.push({
          recordId: rec.id,
          orderItemId,
          deltaCredits: readNumber(fields[CREDIT_LEDGER_ENTRY_FIELDS.deltaCredits]),
          entryType: readString(fields[CREDIT_LEDGER_ENTRY_FIELDS.entryType]),
        });
      }
    }
    offset = body.offset;
  } while (offset);

  return rows;
}

export async function runGrantCredits(input: GrantCreditsRequest): Promise<GrantCreditsResponse> {
  try {
    // 5.1 Record exists
    let orderRecord: GrantCreditsOrderRecord;
    try {
      orderRecord = await getGrantCreditsOrderRecord(input.recordId);
    } catch (error) {
      if (error instanceof SyncEndpointError && error.status === 404) {
        return {
          ok: false,
          endpoint: "/orders/grant-credits",
          recordId: input.recordId,
          stage: "validation",
          error: "Order not found",
        };
      }
      throw error;
    }

    // 5.2 Order Status is Paid
    if (orderRecord.status !== "Paid") {
      return {
        ok: false,
        endpoint: "/orders/grant-credits",
        recordId: input.recordId,
        stage: "validation",
        error: "Order is not Paid",
      };
    }

    // 5.3 Order Has No Exception
    if (orderRecord.hasException) {
      return {
        ok: false,
        endpoint: "/orders/grant-credits",
        recordId: input.recordId,
        stage: "validation",
        error: `Order has exception: ${orderRecord.exceptionReason || "Unknown"}`,
      };
    }

    // 5.4 Order Items Exist
    const orderItems = await listGrantCreditsOrderItems(input.recordId);
    if (orderItems.length === 0) {
      const debug = {
        orderId: input.recordId,
        orderStatus: orderRecord.status,
        clientProfileId: orderRecord.clientProfileId,
        exceptionReason: orderRecord.exceptionReason,
      };
      console.error(`[GRANT_CREDITS] No Order Items found. Debug: ${JSON.stringify(debug)}`);
      return {
        ok: false,
        endpoint: "/orders/grant-credits",
        recordId: input.recordId,
        stage: "validation",
        error: "Order has no Order Items",
        debug,
      } as any;
    }

    // 5.5 Credit Account Resolution
    if (!orderRecord.clientProfileId) {
      return {
        ok: false,
        endpoint: "/orders/grant-credits",
        recordId: input.recordId,
        stage: "validation",
        error: "Order has no Client Profile",
      };
    }

    const creditAccount = await findCreditAccountByClientProfile(orderRecord.clientProfileId);
    if (!creditAccount) {
      const debug = {
        orderId: input.recordId,
        clientProfileId: orderRecord.clientProfileId,
      };
      console.error(`[GRANT_CREDITS] No Credit Account found. Debug: ${JSON.stringify(debug)}`);
      return {
        ok: false,
        endpoint: "/orders/grant-credits",
        recordId: input.recordId,
        stage: "validation",
        error: "No Credit Account for Client Profile",
        debug,
      } as any;
    }

    if (creditAccount.status !== "Active") {
      return {
        ok: false,
        endpoint: "/orders/grant-credits",
        recordId: input.recordId,
        stage: "validation",
        error: "Credit Account is not Active",
      };
    }

    // Get existing purchase credit entries
    const existingEntries = await listPurchaseCreditEntriesForOrderItems(
      creditAccount.recordId,
      orderItems.map((oi) => oi.recordId),
    );
    const existingByOrderItem = new Map(existingEntries.map((e) => [e.orderItemId, e]));

    // 5.6 Order Item Eligibility + 6.1 Grant Operation
    const items: GrantCreditsItemResult[] = [];
    let granted = 0;
    let alreadyGranted = 0;
    let skippedZeroCredits = 0;
    let totalCreditsGranted = 0;

    for (const orderItem of orderItems) {
      // Check status
      if (orderItem.status !== "Active") {
        return {
          ok: false,
          endpoint: "/orders/grant-credits",
          recordId: input.recordId,
          stage: "validation",
          error: `Order Item ${orderItem.recordId} is not Active`,
        };
      }

      const creditsGrantedTotal = orderItem.creditsGrantedTotal ?? 0;

      // Skip zero-credit items
      if (creditsGrantedTotal === 0) {
        skippedZeroCredits += 1;
        items.push({
          orderItemId: orderItem.recordId,
          result: "skipped_zero_credits",
        });
        continue;
      }

      // Check for existing entry
      const existingEntry = existingByOrderItem.get(orderItem.recordId);
      if (existingEntry) {
        alreadyGranted += 1;
        items.push({
          orderItemId: orderItem.recordId,
          result: "already_granted",
          existingLedgerEntryId: existingEntry.recordId,
        });
        continue;
      }

      // Check for multiple existing entries (data integrity issue)
      const allEntriesForItem = orderItem.creditLedgerEntryIds.filter((id) => {
        const entry = existingEntries.find((e) => e.recordId === id);
        return entry?.entryType === "Purchase Credit";
      });

      if (allEntriesForItem.length > 1) {
        return {
          ok: false,
          endpoint: "/orders/grant-credits",
          recordId: input.recordId,
          stage: "validation",
          error: `Duplicate Purchase Credit entries for Order Item ${orderItem.recordId}`,
        };
      }

      // Create ledger entry
      try {
        const ledgerEntry = await createCreditLedgerEntry({
          creditAccountRecordId: creditAccount.recordId,
          orderItemRecordId: orderItem.recordId,
          entryType: "Purchase Credit",
          deltaCredits: creditsGrantedTotal,
          occurredAt: new Date().toISOString(),
          createdVia: "Payment Job",
        });

        granted += 1;
        totalCreditsGranted += ledgerEntry.deltaCredits ?? 0;
        items.push({
          orderItemId: orderItem.recordId,
          result: "granted",
          ledgerEntryId: ledgerEntry.recordId,
          deltaCredits: ledgerEntry.deltaCredits ?? undefined,
        });
      } catch (error) {
        return {
          ok: false,
          endpoint: "/orders/grant-credits",
          recordId: input.recordId,
          stage: "execution",
          error: `Failed to create ledger entry for Order Item ${orderItem.recordId}: ${error instanceof Error ? error.message : "Unknown error"}`,
        };
      }
    }

    // Determine result
    const result = granted === 0 && alreadyGranted === orderItems.length - skippedZeroCredits ? "noop" : 
                   granted > 0 && (alreadyGranted > 0 || skippedZeroCredits > 0) ? "partial" :
                   granted > 0 ? "succeeded" : "noop";

    return {
      ok: true,
      endpoint: "/orders/grant-credits",
      recordId: input.recordId,
      result,
      creditAccountId: creditAccount.recordId,
      summary: {
        eligible: orderItems.length - skippedZeroCredits,
        granted,
        alreadyGranted,
        skippedZeroCredits,
        totalCreditsGranted,
      },
      items,
    };
  } catch (error) {
    if (error instanceof SyncEndpointError) throw error;
    throw new SyncEndpointError(`Unexpected error: ${error instanceof Error ? error.message : "Unknown"}`, 500);
  }
}
