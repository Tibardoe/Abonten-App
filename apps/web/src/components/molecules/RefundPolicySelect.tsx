"use client";

import { Select } from "@/components/ui/select";
import {
  REFUND_POLICY_CHOICES,
  type RefundPolicy,
  isStricterRefundPolicy,
  refundCutoffDays,
  refundPolicyChoice,
} from "@abonten/core/refundPolicy";
import { useTranslations } from "next-intl";
import { useId } from "react";

// The organizer's refund policy picker (@abonten/core/refundPolicy), on the
// create and the edit form. Once people hold tickets the policy may only
// become more generous: the stricter choices are shown but can't be picked
// (the server refuses them too).

export default function RefundPolicySelect({
  value,
  onChange,
  lockedAt,
}: {
  /** The choice, as refundPolicyChoice writes it ("until_cutoff:48"). */
  value: string;
  onChange: (choice: string) => void;
  /** The event's policy when people already hold tickets. */
  lockedAt?: RefundPolicy | null;
}) {
  const t = useTranslations("events");
  const id = useId();
  const helpId = `${id}-help`;

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {t("refundPolicy.label")}
      </label>
      <Select
        id={id}
        value={value}
        aria-describedby={helpId}
        onChange={(event) => onChange(event.target.value)}
      >
        {REFUND_POLICY_CHOICES.map((policy) => {
          const choice = refundPolicyChoice(policy);
          return (
            <option
              key={choice}
              value={choice}
              disabled={!!lockedAt && isStricterRefundPolicy(policy, lockedAt)}
            >
              {policy.kind === "until_cutoff"
                ? t("refundPolicy.untilCutoff", {
                    days: refundCutoffDays(policy.cutoffHours),
                  })
                : policy.kind === "none"
                  ? t("refundPolicy.none")
                  : t("refundPolicy.untilStart")}
            </option>
          );
        })}
      </Select>
      <p id={helpId} className="text-xs text-muted-foreground">
        {lockedAt ? t("refundPolicy.lockedNote") : t("refundPolicy.help")}
      </p>
    </div>
  );
}
