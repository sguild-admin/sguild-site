import { parseLeadBody, normalizeLeadFields } from "./schema";
import { customersRepo } from "./repo";
import type { LeadSubmissionResponse } from "./dto";

export async function submitLead(body: unknown): Promise<LeadSubmissionResponse> {
  const parsed = parseLeadBody(body);
  const normalized = normalizeLeadFields(parsed);

  const created = await customersRepo.createLeadAndAttribution(normalized);
  return { ok: true, leadId: created.leadId };
}
