"use client";

import { setRewardEmailsByLink } from "@/actions/setRewardEmailsByLink";
import { Button } from "@/components/ui/button";
import { PageTitle, SupportingText } from "@/components/ui/typography";
import { useState, useTransition } from "react";

/**
 * Asks before turning Abonten Rewards emails off from an email's link, then
 * offers to turn them back on.
 */
export default function RewardEmailUnsubscribe({
  userId,
  token,
}: {
  userId: string;
  token: string;
}) {
  const [state, setState] = useState<"ask" | "off" | "on">("ask");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const change = (enabled: boolean) =>
    start(async () => {
      setError(null);
      const res = await setRewardEmailsByLink({ userId, token, enabled });
      if (res.status === 200) {
        setState(enabled ? "on" : "off");
      } else {
        setError(res.message ?? "Couldn't save that. Please try again.");
      }
    });

  return (
    <>
      <PageTitle>
        {state === "off"
          ? "You're unsubscribed"
          : state === "on"
            ? "Reward emails are back on"
            : "Stop Abonten Rewards emails?"}
      </PageTitle>
      <SupportingText>
        {state === "off"
          ? "We won't email you about your Abonten Credit any more. You'll still see it in the app and on your Rewards page, where you can turn these emails back on."
          : state === "on"
            ? "We'll email you when credit is ready to use."
            : "These are the emails we send when credit is ready for you to use. Your credit and the app's notifications aren't affected."}
      </SupportingText>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="mt-2 flex justify-center">
        {state === "off" ? (
          <Button
            variant="outline"
            disabled={pending}
            onClick={() => change(true)}
          >
            {pending ? "Saving…" : "Turn them back on"}
          </Button>
        ) : state === "ask" ? (
          <Button disabled={pending} onClick={() => change(false)}>
            {pending ? "Saving…" : "Unsubscribe"}
          </Button>
        ) : null}
      </div>
    </>
  );
}
