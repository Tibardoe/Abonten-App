"use client";

import { setRecommendationEmailsByLink } from "@/actions/discovery/setRecommendationEmailsByLink";
import { Button } from "@/components/ui/button";
import { PageTitle, SupportingText } from "@/components/ui/typography";
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
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const unsubscribe = () =>
    start(async () => {
      setError(null);
      const res = await setRecommendationEmailsByLink({ userId, token });
      if (res.status === 200) setDone(true);
      else setError(res.message ?? "Couldn't save that. Please try again.");
    });

  return (
    <>
      <PageTitle>
        {done ? "You're unsubscribed" : "Stop emails about picks and alerts?"}
      </PageTitle>
      <SupportingText>
        {done
          ? "We won't email you picks or alerts any more. Push notifications and your For you page aren't affected."
          : "These are the emails with new events and places picked from what you follow. Tickets, payments and account emails aren't affected."}
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
            Notification settings
          </Link>
        ) : (
          <Button disabled={pending} onClick={unsubscribe}>
            {pending ? "Saving…" : "Unsubscribe"}
          </Button>
        )}
      </div>
    </>
  );
}
