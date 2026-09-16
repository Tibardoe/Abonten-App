import { discoveryRoute, signedIn } from "@/app/api/mobile/_lib/discoveryRoute";
import { getContentCampaignCheckoutCore } from "@abonten/services/content/campaigns/contentCampaignCore";
import { checkoutIdSchema } from "@abonten/validation/contentSchemas";

// GET /api/mobile/content/campaigns/checkout/[checkoutId] — a campaign checkout for the payment screen
export async function GET(
  req: Request,
  { params }: { params: Promise<{ checkoutId: string }> },
) {
  const { checkoutId } = await params;
  return discoveryRoute(
    req,
    {
      schema: checkoutIdSchema,
      label: "GET /content/campaigns/checkout/[checkoutId]",
      params: { checkoutId },
    },
    ({ svc, userId, data, ip }) =>
      getContentCampaignCheckoutCore(svc, signedIn(userId), data.checkoutId),
  );
}
