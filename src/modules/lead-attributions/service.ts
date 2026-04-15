import type { CreateLeadAttributionInput } from "./repo";
import { createLeadAttributionRecord } from "./repo";

export async function createLeadAttribution(
  input: CreateLeadAttributionInput,
): Promise<{ recordId: string }> {
  return createLeadAttributionRecord(input);
}
