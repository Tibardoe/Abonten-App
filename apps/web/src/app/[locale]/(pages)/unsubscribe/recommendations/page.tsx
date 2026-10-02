import { PageTitle, SupportingText } from "@/components/ui/typography";
import RecommendationEmailUnsubscribe from "@/discovery/molecules/RecommendationEmailUnsubscribe";
import { isRecommendationEmailLinkValid } from "@abonten/services/notifications/recommendationEmailPreferenceCore";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("notifications");
  return {
    title: t("emailsAboutPicksAndAlerts"),
    robots: { index: false },
  };
}

// The footer link in every recommendation digest email. Public (no
// sign-in): the link carries the person's id and a signed token. Nothing
// changes until they press the button, so a mail scanner opening the link
// does nothing.
export default async function RecommendationEmailUnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ u?: string; t?: string }>;
}) {
  const t = await getTranslations("notifications");

  const { u, t: token } = await searchParams;

  if (!isRecommendationEmailLinkValid(u, token)) {
    return (
      <section className="mx-auto flex max-w-md flex-col gap-3 py-10 text-center">
        <PageTitle>{t("thisLinkIsnTValid")}</PageTitle>
        <SupportingText>{t("openTheUnsubscribeLinkFromYour")}</SupportingText>
      </section>
    );
  }

  return (
    <section className="mx-auto flex max-w-md flex-col gap-3 py-10 text-center">
      <RecommendationEmailUnsubscribe
        userId={u as string}
        token={token as string}
      />
    </section>
  );
}
