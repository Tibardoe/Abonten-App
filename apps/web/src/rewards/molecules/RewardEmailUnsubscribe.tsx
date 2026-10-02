"use client";

import { setRewardEmailsByLink } from "@/actions/setRewardEmailsByLink";
import { Button } from "@/components/ui/button";
import { PageTitle, SupportingText } from "@/components/ui/typography";
import { actionUnreachable } from "@/utils/actionUnreachable";
import { useTranslations } from "next-intl";
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
  const t = useTranslations("rewards");

  const [state, setState] = useState<"ask" | "off" | "on">("ask");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const change = (enabled: boolean) =>
    start(async () => {
      setError(null);
      const res = await setRewardEmailsByLink({ userId, token, enabled }).catch(
        actionUnreachable,
      );
      if (res.status === 200) {
        setState(enabled ? "on" : "off");
      } else {
        setError(res.message ?? t("couldnTSaveThatPleaseTry"));
      }
    });

  return (
    <>
      <PageTitle>
        {state === "off"
          ? t("youReUnsubscribed")
          : state === "on"
            ? t("rewardEmailsAreBackOn")
            : t("stopAbontenRewardsEmails")}
      </PageTitle>
      <SupportingText>
        {state === "off"
          ? t("weWonTEmailYouAbout")
          : state === "on"
            ? t("weLlEmailYouWhenCredit")
            : t("theseAreTheEmailsWeSend")}
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
            {pending ? t("saving") : t("turnThemBackOn")}
          </Button>
        ) : state === "ask" ? (
          <Button disabled={pending} onClick={() => change(false)}>
            {pending ? t("saving") : t("unsubscribe")}
          </Button>
        ) : null}
      </div>
    </>
  );
}
