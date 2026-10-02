import { PageTitle, SupportingText } from "@/components/ui/typography";
import RewardEmailUnsubscribe from "@/rewards/molecules/RewardEmailUnsubscribe";
import { isRewardEmailLinkValid } from "@abonten/services/notifications/rewardEmailPreferenceCore";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("notifications");
  return {
    title: t("abontenRewardsEmails"),
    robots: { index: false },
  };
}

// The footer link in every Abonten Rewards email. Public (no sign-in): the
// link carries the person's id and a signed token. Nothing changes until
// they press the button, so a mail scanner opening the link does nothing.
export default async function RewardEmailUnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ u?: string; t?: string }>;
}) {
  const t = await getTranslations("notifications");

  const { u, t: token } = await searchParams;

  if (!isRewardEmailLinkValid(u, token)) {
    return (
      <section className="mx-auto flex max-w-md flex-col gap-3 py-10 text-center">
        <PageTitle>{t("thisLinkIsnTValid")}</PageTitle>
        <SupportingText>{t("openTheUnsubscribeLinkFromYour2")}</SupportingText>
      </section>
    );
  }

  return (
    <section className="mx-auto flex max-w-md flex-col gap-3 py-10 text-center">
      <RewardEmailUnsubscribe userId={u as string} token={token as string} />
    </section>
  );
}
