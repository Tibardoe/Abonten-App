import { discoveryRoute, signedIn } from "@/app/api/mobile/_lib/discoveryRoute";
import {
  createContentCampaignCore,
  listOwnContentCampaignsCore,
} from "@abonten/services/content/campaigns/contentCampaignCore";
import { bindLocaleFromRequest } from "@abonten/services/i18n/requestLocale";
import { createContentCampaignSchema } from "@abonten/validation/contentSchemas";
import { z } from "zod";

// GET /api/mobile/content/campaigns — own campaigns
export async function GET(req: Request) {
  bindLocaleFromRequest(req);
  return discoveryRoute(
    req,
    { schema: z.object({}).passthrough(), label: "GET /content/campaigns" },
    ({ svc, userId, data, ip }) =>
      listOwnContentCampaignsCore(svc, signedIn(userId)),
  );
}

// POST /api/mobile/content/campaigns — start a campaign + checkout
export async function POST(req: Request) {
  bindLocaleFromRequest(req);
  return discoveryRoute(
    req,
    { schema: createContentCampaignSchema, label: "POST /content/campaigns" },
    ({ svc, userId, data, ip }) =>
      createContentCampaignCore(svc, signedIn(userId), data),
  );
}
