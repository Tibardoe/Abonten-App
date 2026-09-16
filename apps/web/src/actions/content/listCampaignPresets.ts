"use server";

import { requireContentUser } from "@/utils/contentAction";
import { listCampaignPresetsCore } from "@abonten/services/content/campaigns/contentCampaignCore";

/** Promoted Spotlight presets. */
export async function listCampaignPresets() {
  const caller = await requireContentUser();
  if (caller.error) return caller.error;
  return listCampaignPresetsCore(caller.svc);
}
