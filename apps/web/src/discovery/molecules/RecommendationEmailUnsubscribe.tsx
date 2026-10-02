"use client";

import { setRecommendationEmailsByLink } from "@/actions/discovery/setRecommendationEmailsByLink";
import { Button } from "@/components/ui/button";
import { PageTitle, SupportingText } from "@/components/ui/typography";
import { actionUnreachable } from "@/utils/actionUnreachable";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useState, useTransition } from "react";

/**
 * Asks before turning recommendation emails off from an email's link. Turning
 * them back on happens in Settings › Notifications, signed in.
 */
export default function RecommendationEmailUnsubscribe({
  userId,
  token,
}: {
  userId: string;
  token: string;
}) {
  const t = useTranslations("discovery");

  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const unsubscribe = () =>
    start(async () => {
      setError(null);
      const res = await setRecommendationEmailsByLink({ userId, token }).catch(
        actionUnreachable,
      );
      if (res.status === 200) setDone(true);
      else setError(res.message ?? t("couldnTSaveThatPleaseTry"));
    });

  return (
    <>
      <PageTitle>
        {done ? t("youReUnsubscribed") : t("stopEmailsAboutPicksAndAlerts")}
      </PageTitle>
      <SupportingText>
        {done ? t("weWonTEmailYouPicks") : t("theseAreTheEmailsWithNew")}
      </SupportingText>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="mt-2 flex justify-center">
        {done ? (
          <Link
            href="/settings/notifications"
            className="text-sm font-medium text-primary hover:underline"
          >
            {t("notificationSettings")}
          </Link>
        ) : (
          <Button disabled={pending} onClick={unsubscribe}>
            {pending ? t("saving") : t("unsubscribe")}
          </Button>
        )}
      </div>
    </>
  );
}
