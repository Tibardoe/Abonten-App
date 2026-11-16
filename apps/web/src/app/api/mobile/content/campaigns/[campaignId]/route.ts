import { mobileActingFor } from "@/app/api/mobile/_lib/actor";
import { discoveryRoute, signedIn } from "@/app/api/mobile/_lib/discoveryRoute";
import { CONTENT_PROMOTION_CAPABILITIES } from "@abonten/core/teams/roles";
import {
  advertiserCampaignActionCore,
  getContentCampaignCore,
  getContentCampaignHistoryCore,
} from "@abonten/services/content/campaigns/contentCampaignCore";
import { bindLocaleFromRequest } from "@abonten/services/i18n/requestLocale";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import {
  advertiserCampaignActionSchema,
  contentCampaignIdSchema,
} from "@abonten/validation/contentSchemas";

async function getOwnCampaignWithHistory(
  svc: ServiceRoleClient,
  userId: string,
  campaignId: string,
) {
  const campaign = await getContentCampaignCore(svc, userId, campaignId);
  if (campaign.status !== 200 || !campaign.data) return campaign;
  const history = await getContentCampaignHistoryCore(svc, campaignId);
  return {
    status: 200 as const,
    data: { campaign: campaign.data, ...history },
  };
}

/** Managing as a team: its Owners promote its Spotlights; they pay. */
async function advertiser(req: Request, userId: string) {
  return mobileActingFor(req, userId, CONTENT_PROMOTION_CAPABILITIES, {
    all: true,
  });
}

// GET /api/mobile/content/campaigns/[campaignId] — one own campaign with history
export async function GET(
  req: Request,
  { params }: { params: Promise<{ campaignId: string }> },
) {
  bindLocaleFromRequest(req);
  const { campaignId } = await params;
  return discoveryRoute(
    req,
    {
      schema: contentCampaignIdSchema,
      label: "GET /content/campaigns/[campaignId]",
      params: { campaignId },
    },
    async ({ svc, userId, data }) => {
      const acting = await advertiser(req, signedIn(userId));
      if (acting.error) return acting.error;
      return getOwnCampaignWithHistory(svc, acting.accountId, data.campaignId);
    },
  );
}

// POST /api/mobile/content/campaigns/[campaignId] — pause / resume / cancel
export async function POST(
  req: Request,
  { params }: { params: Promise<{ campaignId: string }> },
) {
  bindLocaleFromRequest(req);
  const { campaignId } = await params;
  return discoveryRoute(
    req,
    {
      schema: advertiserCampaignActionSchema,
      label: "POST /content/campaigns/[campaignId]",
      params: { campaignId },
    },
    async ({ svc, userId, data }) => {
      const acting = await advertiser(req, signedIn(userId));
      if (acting.error) return acting.error;
      return advertiserCampaignActionCore(
        svc,
        acting.accountId,
        data,
        signedIn(userId),
      );
    },
  );
}
