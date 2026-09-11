"use client";

import { setRewardEmailPreference } from "@/actions/setRewardEmailPreference";
import { useToast } from "@/hooks/useToast";
import type { RewardEmailPreference } from "@abonten/types/rewards";
import { useState, useTransition } from "react";

/**
 * "Email me when credit is ready" on the Rewards page. The same choice the
 * unsubscribe link in a reward email changes.
 */
export default function RewardEmailToggle({
  initial,
}: {
  initial: RewardEmailPreference;
}) {
  const toast = useToast();
  const [on, setOn] = useState(initial.rewardEmails);
  const [pending, start] = useTransition();

  const toggle = () =>
    start(async () => {
      const next = !on;
      const res = await setRewardEmailPreference({ enabled: next });
      if (res.status === 200 && res.data) {
        setOn(res.data.rewardEmails);
        toast.success(res.message ?? "Saved.");
      } else {
        toast.error(res.message ?? "Couldn't save that. Please try again.");
      }
    });

  return (
    <section className="flex items-start justify-between gap-4 rounded-xl border p-5">
      <div>
        <p id="reward-emails-label" className="font-medium">
          Email me when credit is ready
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {initial.email
            ? `To ${initial.email}. At most one email every 12 hours.`
            : "Your account has no email address, so you'll get these in the app only."}
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-labelledby="reward-emails-label"
        disabled={pending || !initial.email}
        onClick={toggle}
        className={`relative mt-1 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 ${
          on && initial.email ? "bg-primary" : "bg-muted"
        }`}
      >
        <span
          className={`inline-block h-5 w-5 rounded-full bg-background shadow transition-transform ${
            on && initial.email ? "translate-x-5" : "translate-x-0.5"
          }`}
        />
      </button>
    </section>
  );
}
