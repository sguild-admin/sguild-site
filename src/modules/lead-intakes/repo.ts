import { SyncEndpointError } from "@/lib/errors";
import { airtableSchema } from "@/config/airtable-schema";
import { airtableRequest, parseAirtableError } from "@/lib/airtable/client";
import { resolveCampaignRecordId } from "@/modules/campaigns";
import { createLeadAttribution } from "@/modules/lead-attributions";

const LEAD_INTAKES_TABLE = airtableSchema.core.tables.leadIntakes;
const LEAD_INTAKE_FIELDS = airtableSchema.core.fields.leadIntakes;

export type CreateLeadIntakeInput = {
  firstName: string;
  lastName: string;
  formattedPhone: string;
  zipCode: string;
  lessonSetting: string;
  ageGroup: string;
  startTimeline: string;
  createdAt?: string;
};

export async function createLeadIntakeRecord(
  input: CreateLeadIntakeInput,
): Promise<{ recordId: string }> {
  const createdAtFieldCandidates = ["Imported", LEAD_INTAKE_FIELDS.createdAt, "Created", null] as const;
  let lastMessage = "Unknown Airtable error.";
  const failedAttempts: string[] = [];

  for (const createdAtFieldName of createdAtFieldCandidates) {
    const fields: Record<string, unknown> = {
      [LEAD_INTAKE_FIELDS.firstName]: input.firstName,
      [LEAD_INTAKE_FIELDS.lastName]: input.lastName,
      [LEAD_INTAKE_FIELDS.phone]: input.formattedPhone,
      [LEAD_INTAKE_FIELDS.zip]: input.zipCode,
      [LEAD_INTAKE_FIELDS.lessonSetting]: input.lessonSetting,
      [LEAD_INTAKE_FIELDS.ageGroup]: input.ageGroup,
      [LEAD_INTAKE_FIELDS.startTimeline]: input.startTimeline,
    };
    if (createdAtFieldName) {
      fields[createdAtFieldName] = input.createdAt ?? new Date().toISOString().slice(0, 10);
    }

    const response = await airtableRequest(encodeURIComponent(LEAD_INTAKES_TABLE), {
      method: "POST",
      __scope: "core",
      body: JSON.stringify({ records: [{ fields }] }),
    });

    if (!response.ok) {
      const message = await parseAirtableError(response);
      lastMessage = message;
      failedAttempts.push(
        `${LEAD_INTAKES_TABLE}${createdAtFieldName ? `(${createdAtFieldName})` : "(no-created-at)"} [${response.status}]: ${message}`,
      );
      const lower = message.toLowerCase();
      const createdAtUnknown =
        createdAtFieldName != null &&
        lower.includes("unknown field name") &&
        lower.includes(createdAtFieldName.toLowerCase());
      const createdAtComputed =
        createdAtFieldName != null &&
        lower.includes(createdAtFieldName.toLowerCase()) &&
        lower.includes("cannot accept a value") &&
        lower.includes("computed");
      if (createdAtUnknown || createdAtComputed) continue;
      throw new SyncEndpointError(`Airtable create failed for ${LEAD_INTAKES_TABLE}: ${message}`, 502);
    }

    const data = (await response.json()) as { records?: Array<{ id?: string }> };
    const recordId = data.records?.[0]?.id;
    if (!recordId) {
      throw new SyncEndpointError("Lead Intake was created without a record ID.", 502);
    }

    return { recordId };
  }

  throw new SyncEndpointError(
    `Airtable create failed for ${LEAD_INTAKES_TABLE}: ${lastMessage}. Attempts: ${failedAttempts.join(" | ")}`,
    502,
  );
}

export async function createLeadAndAttribution(input: CreateLeadIntakeInput & {
  landingUrl: string;
  campaignCode: string;
}): Promise<{ leadId: string }> {
  const lead = await createLeadIntakeRecord(input);
  const campaignRecordId = input.campaignCode
    ? await resolveCampaignRecordId(input.campaignCode)
    : null;

  await createLeadAttribution({
    leadIntakeId: lead.recordId,
    landingUrl: input.landingUrl,
    campaignId: campaignRecordId,
  });

  return { leadId: lead.recordId };
}
