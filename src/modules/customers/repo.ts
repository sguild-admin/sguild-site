import { SyncEndpointError } from "@/lib/errors";
import { airtableSchema } from "@/config/airtable-schema";
import {
  airtableRequest,
  escapeAirtableFormulaString,
  parseAirtableError,
} from "@/lib/airtable/client";

const LEADS_TABLE = airtableSchema.core.tables.leadIntakes;
const SOURCES_TABLE = airtableSchema.core.tables.leadAttributions;
const CAMPAIGNS_TABLE = airtableSchema.core.tables.campaigns;

async function createAirtableRecord(
  tableName: string,
  fields: Record<string, unknown>,
) {
  const response = await airtableRequest(encodeURIComponent(tableName), {
    method: "POST",
    body: JSON.stringify({ records: [{ fields }] }),
    __scope: "core",
  });

  if (!response.ok) {
    const message = await parseAirtableError(response);
    throw new SyncEndpointError(`Airtable create failed for ${tableName}: ${message}`, 502);
  }

  return (await response.json()) as { records?: Array<{ id: string }> };
}

async function findCampaignRecordId(campaignCode: string): Promise<string | null> {
  const escapedCode = escapeAirtableFormulaString(campaignCode);
  const params = new URLSearchParams({
    maxRecords: "1",
    filterByFormula: `{Campaign Code}='${escapedCode}'`,
  });

  const response = await airtableRequest(
    `${encodeURIComponent(CAMPAIGNS_TABLE)}?${params.toString()}`,
    { method: "GET", __scope: "core" },
  );

  if (!response.ok) {
    const message = await parseAirtableError(response);
    throw new SyncEndpointError(`Airtable campaign lookup failed: ${message}`, 502);
  }

  const data = (await response.json()) as { records?: Array<{ id: string }> };
  return data.records?.[0]?.id ?? null;
}

async function createLeadAndAttribution(input: {
  firstName: string;
  lastName: string;
  formattedPhone: string;
  zipCode: string;
  lessonSetting: string;
  ageGroup: string;
  startTimeline: string;
  landingUrl: string;
  campaignCode: string;
}) {
  const leadCreate = await createAirtableRecord(LEADS_TABLE, {
    First: input.firstName,
    Last: input.lastName,
    Phone: input.formattedPhone,
    Zip: input.zipCode,
    "Created At": new Date().toISOString().slice(0, 10),
    "Lesson Setting": input.lessonSetting,
    "Age Group": input.ageGroup,
    "Start Timeline": input.startTimeline,
  });

  const leadId = leadCreate.records?.[0]?.id;
  if (!leadId) {
    throw new SyncEndpointError("Lead was created without a record ID.", 502);
  }

  let campaignRecordId: string | null = null;
  if (input.campaignCode) {
    campaignRecordId = await findCampaignRecordId(input.campaignCode);
  }

  const attributionFields: Record<string, unknown> = {
    "Lead Intake": [leadId],
    "Landing URL": input.landingUrl,
  };
  if (campaignRecordId) {
    attributionFields.Campaign = [campaignRecordId];
  }

  await createAirtableRecord(SOURCES_TABLE, attributionFields);
  return { leadId };
}

export const customersRepo = {
  createLeadAndAttribution,
};
