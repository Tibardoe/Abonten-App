import { mobileActingFor } from "@/app/api/mobile/_lib/actor";
import { discoveryRoute, signedIn } from "@/app/api/mobile/_lib/discoveryRoute";
import { CONTENT_PROMOTION_CAPABILITIES } from "@abonten/core/teams/roles";
import {
  createContentCampaignCore,
  listOwnContentCampaignsCore,
} from "@abonten/services/content/campaigns/contentCampaignCore";
import { bindLocaleFromRequest } from "@abonten/services/i18n/requestLocale";
import { createContentCampaignSchema } from "@abonten/validation/contentSchemas";
import { z } from "zod";

/** Managing as a team: its Owners promote its Spotlights; they pay. */
async function advertiser(req: Request, userId: string) {
  return mobileActingFor(req, userId, CONTENT_PROMOTION_CAPABILITIES, {
    all: true,
  });
}

// GET /api/mobile/content/campaigns — own campaigns (or the team's)
export async function GET(req: Request) {
  bindLocaleFromRequest(req);
  return discoveryRoute(
    req,
    { schema: z.object({}).passthrough(), label: "GET /content/campaigns" },
    async ({ svc, userId }) => {
      const acting = await advertiser(req, signedIn(userId));
      if (acting.error) return acting.error;
      return listOwnContentCampaignsCore(svc, acting.accountId);
    },
  );
}

// POST /api/mobile/content/campaigns — start a campaign + checkout
export async function POST(req: Request) {
  bindLocaleFromRequest(req);
  return discoveryRoute(
    req,
    { schema: createContentCampaignSchema, label: "POST /content/campaigns" },
    async ({ svc, userId, data }) => {
      const acting = await advertiser(req, signedIn(userId));
      if (acting.error) return acting.error;
      return createContentCampaignCore(
        svc,
        acting.accountId,
        data,
        signedIn(userId),
      );
    },
  );
}
