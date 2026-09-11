import { getCreditActivity } from "@/actions/getCreditActivity";
import { getCreditSummary } from "@/actions/getCreditSummary";
import { getLoyaltyProgress } from "@/actions/getLoyaltyProgress";
import { getReferralInvite } from "@/actions/getReferralInvite";
import { getReferralLink } from "@/actions/getReferralLink";
import { getRewardEmailPreference } from "@/actions/getRewardEmailPreference";
import { getRewardsProgram } from "@/actions/getRewardsProgram";
import {
  PageTitle,
  SectionTitle,
  SupportingText,
} from "@/components/ui/typography";
import CreditBalanceCard from "@/rewards/molecules/CreditBalanceCard";
import LoyaltyProgressCard from "@/rewards/molecules/LoyaltyProgressCard";
import ReferralCodeCard from "@/rewards/molecules/ReferralCodeCard";
import RewardEmailToggle from "@/rewards/molecules/RewardEmailToggle";
import CreditActivityList from "@/rewards/organisms/CreditActivityList";
import InvitePanel from "@/rewards/organisms/InvitePanel";
import RewardsHowItWorks from "@/rewards/organisms/RewardsHowItWorks";
import { notFound } from "next/navigation";

// Per-user, request-time data -- same force-dynamic precedent as /wallet.
export const dynamic = "force-dynamic";

export default async function RewardsPage() {
  const program = await getRewardsProgram();

  // Rewards rolls out by audience (staff → beta → everyone). Until it's on
  // for this user the page doesn't exist for them.
  if (program.status !== 200 || !program.data.enabled) {
    notFound();
  }

  const [summary, firstPage, referral, invite, loyalty, emails] =
    await Promise.all([
      getCreditSummary(),
      getCreditActivity(),
      getReferralLink(),
      getReferralInvite(),
      getLoyaltyProgress(),
      getRewardEmailPreference(),
    ]);
  const referralCode = referral.data?.code ?? null;
  const inviteData = invite.status === 200 ? invite.data : undefined;

  async function fetchPage(cursor: string | null) {
    "use server";
    return getCreditActivity({ cursor });
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <PageTitle>Rewards</PageTitle>
        <SupportingText>
          Your Abonten Credit. Earn it on Abonten, spend it on Abonten.
        </SupportingText>
      </div>

      {summary.status === 200 && summary.data ? (
        <CreditBalanceCard
          summary={summary.data}
          welcomeMinOrderMinor={
            program.data.friendReferral?.minOrderMinor ??
            inviteData?.minOrderMinor ??
            null
          }
        />
      ) : (
        <p className="text-sm text-muted-foreground">
          We couldn&apos;t load your balance right now. Try again in a moment.
        </p>
      )}

      {loyalty.status === 200 && loyalty.data ? (
        <LoyaltyProgressCard progress={loyalty.data} />
      ) : null}

      {referralCode && program.data.eventReferral ? (
        <ReferralCodeCard
          code={referralCode}
          rateBps={program.data.eventReferral.rateBps}
          windowDays={referral.data?.attributionWindowDays ?? 7}
        />
      ) : null}

      {inviteData && (inviteData.enabled || inviteData.invitedBy) ? (
        <InvitePanel invite={inviteData} />
      ) : null}

      <RewardsHowItWorks program={program.data} />

      {emails.status === 200 && emails.data ? (
        <RewardEmailToggle initial={emails.data} />
      ) : null}

      <section>
        <SectionTitle>Activity</SectionTitle>
        <div className="mt-2">
          <CreditActivityList initialPage={firstPage} fetchPage={fetchPage} />
        </div>
      </section>
    </div>
  );
}
