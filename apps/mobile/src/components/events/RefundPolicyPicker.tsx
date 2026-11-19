import {
  REFUND_POLICY_CHOICES,
  type RefundPolicy,
  isStricterRefundPolicy,
  refundCutoffDays,
  refundPolicyChoice,
} from "@abonten/core/refundPolicy";
import { AppText, Chip } from "@abonten/ui-native";
import { useTranslations } from "@abonten/ui-native/i18n";
import { View } from "react-native";

// The organizer's refund policy picker (@abonten/core/refundPolicy), on the
// wizard's ticket step and the edit screen. Once people hold tickets only
// a policy at least as generous is offered (the server refuses the rest).

export function RefundPolicyPicker({
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
  const choices = lockedAt
    ? REFUND_POLICY_CHOICES.filter(
        (policy) => !isStricterRefundPolicy(policy, lockedAt),
      )
    : REFUND_POLICY_CHOICES;

  return (
    <View className="gap-2">
      <AppText variant="bodyStrong">{t("refundPolicy.label")}</AppText>
      <View className="flex-row flex-wrap gap-2">
        {choices.map((policy) => {
          const choice = refundPolicyChoice(policy);
          return (
            <Chip
              key={choice}
              label={
                policy.kind === "until_cutoff"
                  ? t("refundPolicy.untilCutoff", {
                      days: refundCutoffDays(policy.cutoffHours),
                    })
                  : policy.kind === "none"
                    ? t("refundPolicy.none")
                    : t("refundPolicy.untilStart")
              }
              selected={value === choice}
              onPress={() => onChange(choice)}
            />
          );
        })}
      </View>
      <AppText variant="meta">
        {lockedAt ? t("refundPolicy.lockedNote") : t("refundPolicy.help")}
      </AppText>
    </View>
  );
}
