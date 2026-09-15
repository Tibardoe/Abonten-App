import { PageTitle, SupportingText } from "@/components/ui/typography";
import RecommendationEmailUnsubscribe from "@/discovery/molecules/RecommendationEmailUnsubscribe";
import { isRecommendationEmailLinkValid } from "@abonten/services/notifications/recommendationEmailPreferenceCore";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Emails about picks and alerts",
  robots: { index: false },
};

// The footer link in every recommendation digest email. Public (no
// sign-in): the link carries the person's id and a signed token. Nothing
// changes until they press the button, so a mail scanner opening the link
// does nothing.
export default async function RecommendationEmailUnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ u?: string; t?: string }>;
}) {
  const { u, t } = await searchParams;

  if (!isRecommendationEmailLinkValid(u, t)) {
    return (
      <section className="mx-auto flex max-w-md flex-col gap-3 py-10 text-center">
        <PageTitle>This link isn&apos;t valid</PageTitle>
        <SupportingText>
          Open the unsubscribe link from your latest email, or sign in and turn
          these emails off in Settings › Notifications.
        </SupportingText>
      </section>
    );
  }

  return (
    <section className="mx-auto flex max-w-md flex-col gap-3 py-10 text-center">
      <RecommendationEmailUnsubscribe
        userId={u as string}
        token={t as string}
      />
    </section>
  );
}
