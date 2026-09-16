import { discoveryRoute, signedIn } from "@/app/api/mobile/_lib/discoveryRoute";
import { listCampaignPresetsCore } from "@abonten/services/content/campaigns/contentCampaignCore";
import { z } from "zod";

// GET /api/mobile/content/campaigns/presets — promoted Spotlight presets
export async function GET(req: Request) {
  return discoveryRoute(
    req,
    {
      schema: z.object({}).passthrough(),
      label: "GET /content/campaigns/presets",
    },
    ({ svc, userId, data, ip }) => listCampaignPresetsCore(svc),
  );
}
