import { parseLeadBody, normalizeLeadFields } from "./schema";
import { createLeadAndAttribution } from "./repo";

export async function submitLead(body: unknown): Promise<{ ok: true; leadId: string }> {
  const parsed = parseLeadBody(body);
  const normalized = normalizeLeadFields(parsed);

  const created = await createLeadAndAttribution(normalized);
  return { ok: true, leadId: created.leadId };
}
