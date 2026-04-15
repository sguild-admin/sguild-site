import { SyncEndpointError } from "@/lib/errors";
import { airtableSchema } from "@/config/airtable-schema";
import { airtableRequest, parseAirtableError } from "@/lib/airtable/client";

const LEAD_ATTRIBUTIONS_TABLE = airtableSchema.core.tables.leadAttributions;
const LEAD_ATTRIBUTION_FIELDS = airtableSchema.core.fields.leadAttributions;

export type CreateLeadAttributionInput = {
  leadIntakeId: string;
  landingUrl: string;
  campaignId?: string | null;
};

export async function createLeadAttributionRecord(
  input: CreateLeadAttributionInput,
): Promise<{ recordId: string }> {
  const createCommonFields = (includeCapturedAt: boolean): Record<string, unknown> => {
    const fields: Record<string, unknown> = {
      [LEAD_ATTRIBUTION_FIELDS.landingUrl]: input.landingUrl,
    };
    if (includeCapturedAt) {
      fields[LEAD_ATTRIBUTION_FIELDS.capturedAt] = new Date().toISOString();
    }
    if (input.campaignId) fields[LEAD_ATTRIBUTION_FIELDS.campaign] = [input.campaignId];
    return fields;
  };

  const createLinkAttempts = (includeCapturedAt: boolean): Array<Record<string, unknown>> => {
    const commonFields = createCommonFields(includeCapturedAt);
    return [
      {
        ...commonFields,
        [LEAD_ATTRIBUTION_FIELDS.leadIntake]: [input.leadIntakeId],
        [LEAD_ATTRIBUTION_FIELDS.lead]: [input.leadIntakeId],
      },
      {
        ...commonFields,
        [LEAD_ATTRIBUTION_FIELDS.leadIntake]: [input.leadIntakeId],
      },
      {
        ...commonFields,
        [LEAD_ATTRIBUTION_FIELDS.lead]: [input.leadIntakeId],
      },
    ];
  };

  async function runAttempts(attempts: Array<Record<string, unknown>>): Promise<{ recordId: string } | { computedCapturedAt: true } | null> {
    let sawComputedCapturedAtError = false;
    let lastMessage = "Unknown Airtable error";

    for (const fields of attempts) {
      const response = await airtableRequest(encodeURIComponent(LEAD_ATTRIBUTIONS_TABLE), {
        method: "POST",
        __scope: "core",
        body: JSON.stringify({ records: [{ fields }] }),
      });
      if (response.ok) {
        const data = (await response.json()) as { records?: Array<{ id?: string }> };
        const recordId = data.records?.[0]?.id;
        if (!recordId) {
          throw new SyncEndpointError("Lead Attribution was created without a record ID.", 502);
        }
        return { recordId };
      }

      const message = await parseAirtableError(response);
      lastMessage = message;
      const lower = message.toLowerCase();
      const capturedAtComputed =
        lower.includes("captured at") &&
        lower.includes("computed");
      if (capturedAtComputed) {
        sawComputedCapturedAtError = true;
        continue;
      }
      const looksLikeLinkShapeIssue =
        lower.includes("linked") ||
        lower.includes("cannot accept value") ||
        lower.includes("record id");
      if (!looksLikeLinkShapeIssue) {
        throw new SyncEndpointError(`Airtable create failed for ${LEAD_ATTRIBUTIONS_TABLE}: ${message}`, 502);
      }
    }

    if (sawComputedCapturedAtError) return { computedCapturedAt: true };
    if (lastMessage !== "Unknown Airtable error") {
      throw new SyncEndpointError(`Airtable create failed for ${LEAD_ATTRIBUTIONS_TABLE}: ${lastMessage}`, 502);
    }
    return null;
  }

  const firstPass = await runAttempts(createLinkAttempts(true));
  if (firstPass && "recordId" in firstPass) return firstPass;
  if (firstPass && "computedCapturedAt" in firstPass) {
    const secondPass = await runAttempts(createLinkAttempts(false));
    if (secondPass && "recordId" in secondPass) return secondPass;
  }

  throw new SyncEndpointError(`Airtable create failed for ${LEAD_ATTRIBUTIONS_TABLE}: Unknown Airtable error`, 502);
}
