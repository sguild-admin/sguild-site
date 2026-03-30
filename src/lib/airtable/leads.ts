const LEADS_TABLE = "Lead Intakes";
const SOURCES_TABLE = "Lead Attributions";
const CAMPAIGNS_TABLE = "Campaigns";

function escapeAirtableFormulaString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function getLeadAirtableConfig(): { token: string; baseId: string } {
  const token = process.env.AIRTABLE_TOKEN;
  const baseId = process.env.AIRTABLE_BASE_ID;
  if (!token || !baseId) {
    throw new Error("Airtable configuration is missing.");
  }
  return { token, baseId };
}

async function createAirtableRecord(
  baseId: string,
  tableName: string,
  token: string,
  fields: Record<string, unknown>,
) {
  const url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ records: [{ fields }] }),
    cache: "no-store",
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Airtable request failed (${response.status}): ${text}`);
  }

  return (await response.json()) as { records?: Array<{ id: string }> };
}

async function findCampaignRecordId(
  baseId: string,
  token: string,
  campaignCode: string,
): Promise<string | null> {
  const escapedCode = escapeAirtableFormulaString(campaignCode);
  const params = new URLSearchParams({
    maxRecords: "1",
    filterByFormula: `{Campaign Code}='${escapedCode}'`,
  });

  const url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(CAMPAIGNS_TABLE)}?${params.toString()}`;
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Airtable campaign lookup failed (${response.status}): ${text}`);
  }

  const data = (await response.json()) as { records?: Array<{ id: string }> };
  return data.records?.[0]?.id ?? null;
}

export async function createLeadAndAttribution(input: {
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
  const { token, baseId } = getLeadAirtableConfig();

  const leadCreate = await createAirtableRecord(baseId, LEADS_TABLE, token, {
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
    throw new Error("Lead was created without a record ID.");
  }

  let campaignRecordId: string | null = null;
  if (input.campaignCode) {
    campaignRecordId = await findCampaignRecordId(baseId, token, input.campaignCode);
  }

  const attributionFields: Record<string, unknown> = {
    "Lead Intake": [leadId],
    "Landing URL": input.landingUrl,
  };

  if (campaignRecordId) {
    attributionFields.Campaign = [campaignRecordId];
  }

  await createAirtableRecord(baseId, SOURCES_TABLE, token, attributionFields);
  return { leadId };
}
