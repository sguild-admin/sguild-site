import { SyncEndpointError } from "@/lib/errors";
import { airtableSchema } from "@/config/airtable-schema";
import {
  airtableRequest,
  escapeAirtableFormulaString,
  parseAirtableError,
} from "@/lib/airtable/client";

const CAMPAIGNS_TABLE = airtableSchema.core.tables.campaigns;
const CAMPAIGN_FIELDS = airtableSchema.core.fields.campaigns;

export type CampaignRecord = {
  recordId: string;
  campaignCode: string | null;
};

export async function findCampaignByCode(campaignCode: string): Promise<CampaignRecord | null> {
  const normalizedCode = campaignCode.trim().toLowerCase();
  if (!normalizedCode) return null;

  const response = await airtableRequest(
    `${encodeURIComponent(CAMPAIGNS_TABLE)}?${new URLSearchParams({
      maxRecords: "1",
      filterByFormula: `LOWER({${CAMPAIGN_FIELDS.campaignCode}})='${escapeAirtableFormulaString(normalizedCode)}'`,
    }).toString()}`,
    { method: "GET", __scope: "core" },
  );

  if (!response.ok) {
    const message = await parseAirtableError(response);
    throw new SyncEndpointError(`Airtable campaign lookup failed: ${message}`, 502);
  }

  const data = (await response.json()) as {
    records?: Array<{ id: string; fields?: Record<string, unknown> }>;
  };
  const record = data.records?.[0];
  if (!record) return null;

  const rawCode = record.fields?.[CAMPAIGN_FIELDS.campaignCode];
  return {
    recordId: record.id,
    campaignCode: typeof rawCode === "string" && rawCode.trim().length > 0 ? rawCode.trim() : null,
  };
}
