import { PageTitle, SupportingText } from "@/components/ui/typography";
import RewardEmailUnsubscribe from "@/rewards/molecules/RewardEmailUnsubscribe";
import { isRewardEmailLinkValid } from "@abonten/services/notifications/rewardEmailPreferenceCore";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Abonten Rewards emails",
  robots: { index: false },
};

// The footer link in every Abonten Rewards email. Public (no sign-in): the
// link carries the person's id and a signed token. Nothing changes until
// they press the button, so a mail scanner opening the link does nothing.
export default async function RewardEmailUnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ u?: string; t?: string }>;
}) {
  const { u, t } = await searchParams;

  if (!isRewardEmailLinkValid(u, t)) {
    return (
      <section className="mx-auto flex max-w-md flex-col gap-3 py-10 text-center">
        <PageTitle>This link isn&apos;t valid</PageTitle>
        <SupportingText>
          Open the unsubscribe link from your latest Abonten Rewards email, or
          sign in and turn reward emails off on your Rewards page.
        </SupportingText>
      </section>
    );
  }

  return (
    <section className="mx-auto flex max-w-md flex-col gap-3 py-10 text-center">
      <RewardEmailUnsubscribe userId={u as string} token={t as string} />
    </section>
  );
}
