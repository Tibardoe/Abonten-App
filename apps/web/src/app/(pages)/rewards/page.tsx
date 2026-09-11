import { getCreditActivity } from "@/actions/getCreditActivity";
import { getCreditSummary } from "@/actions/getCreditSummary";
import { getReferralLink } from "@/actions/getReferralLink";
import { getRewardsProgram } from "@/actions/getRewardsProgram";
import {
  PageTitle,
  SectionTitle,
  SupportingText,
} from "@/components/ui/typography";
import CreditBalanceCard from "@/rewards/molecules/CreditBalanceCard";
import ReferralCodeCard from "@/rewards/molecules/ReferralCodeCard";
import CreditActivityList from "@/rewards/organisms/CreditActivityList";
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

  const [summary, firstPage, referral] = await Promise.all([
    getCreditSummary(),
    getCreditActivity(),
    getReferralLink(),
  ]);
  const referralCode = referral.data?.code ?? null;

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
        <CreditBalanceCard summary={summary.data} />
      ) : (
        <p className="text-sm text-muted-foreground">
          We couldn&apos;t load your balance right now. Try again in a moment.
        </p>
      )}

      {referralCode && program.data.eventReferral ? (
        <ReferralCodeCard
          code={referralCode}
          rateBps={program.data.eventReferral.rateBps}
          windowDays={referral.data?.attributionWindowDays ?? 7}
        />
      ) : null}

      <RewardsHowItWorks program={program.data} />

      <section>
        <SectionTitle>Activity</SectionTitle>
        <div className="mt-2">
          <CreditActivityList initialPage={firstPage} fetchPage={fetchPage} />
        </div>
      </section>
    </div>
  );
}
