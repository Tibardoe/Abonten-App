import { createClient } from "@/config/supabase/server";
import ManageCampaign from "@/spotlight/organisms/ManageCampaign";
import { getSignInUrl } from "@abonten/core/getSignInUrl";
import { redirect } from "next/navigation";

// One of the advertiser's own Spotlight promotions. Per-user.
export const dynamic = "force-dynamic";

export default async function ManageSpotlightCampaignPage({
  params,
}: {
  params: Promise<{ campaignId: string }>;
}) {
  const { campaignId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(getSignInUrl(`/manage/spotlight/campaigns/${campaignId}`));
  }
  return <ManageCampaign campaignId={campaignId} />;
}
