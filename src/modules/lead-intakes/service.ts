import type { CreateLeadIntakeInput } from "./repo";
import type { LeadSubmissionResponse } from "./dto";
import { normalizeLeadFields, parseLeadBody } from "./schema";
import { createLeadAndAttribution, createLeadIntakeRecord } from "./repo";

export async function createLeadIntake(input: CreateLeadIntakeInput): Promise<{ recordId: string }> {
  return createLeadIntakeRecord(input);
}

export async function submitLead(body: unknown): Promise<LeadSubmissionResponse> {
  const parsed = parseLeadBody(body);
  const normalized = normalizeLeadFields(parsed);

  const created = await createLeadAndAttribution(normalized);
  return { ok: true, leadId: created.leadId };
}
