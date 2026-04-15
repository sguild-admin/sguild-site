import { findCampaignByCode } from "./repo";

export async function resolveCampaignRecordId(campaignCode: string): Promise<string | null> {
  const campaign = await findCampaignByCode(campaignCode);
  return campaign?.recordId ?? null;
}
