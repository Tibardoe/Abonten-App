import { discoveryRoute, signedIn } from "@/app/api/mobile/_lib/discoveryRoute";
import {
  advertiserCampaignActionCore,
  getContentCampaignCore,
  getContentCampaignHistoryCore,
} from "@abonten/services/content/campaigns/contentCampaignCore";
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

// GET /api/mobile/content/campaigns/[campaignId] — one own campaign with history
export async function GET(
  req: Request,
  { params }: { params: Promise<{ campaignId: string }> },
) {
  const { campaignId } = await params;
  return discoveryRoute(
    req,
    {
      schema: contentCampaignIdSchema,
      label: "GET /content/campaigns/[campaignId]",
      params: { campaignId },
    },
    ({ svc, userId, data, ip }) =>
      getOwnCampaignWithHistory(svc, signedIn(userId), data.campaignId),
  );
}

// POST /api/mobile/content/campaigns/[campaignId] — pause / resume / cancel
export async function POST(
  req: Request,
  { params }: { params: Promise<{ campaignId: string }> },
) {
  const { campaignId } = await params;
  return discoveryRoute(
    req,
    {
      schema: advertiserCampaignActionSchema,
      label: "POST /content/campaigns/[campaignId]",
      params: { campaignId },
    },
    ({ svc, userId, data, ip }) =>
      advertiserCampaignActionCore(svc, signedIn(userId), data),
  );
}
