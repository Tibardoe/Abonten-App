import { formatDateTime } from "@abonten/core/i18n/format";
import type { BuyerCancelDecision } from "@abonten/core/refundPolicy";
import { AppText } from "@abonten/ui-native";
import { useLocale, useTranslations } from "@abonten/ui-native/i18n";

// Why a live ticket offers no Cancel: the event takes no refunds, or its
// refunds closed at the organizer's cut-off (@abonten/core/refundPolicy).
// A show that has started needs no sentence: the ticket is for now.

export function RefundClosedNote({
  decision,
  timeZone,
  className,
}: {
  decision: BuyerCancelDecision;
  /** The event's zone: the cut-off reads on the venue's clock. */
  timeZone?: string | null;
  className?: string;
}) {
  const t = useTranslations("events");
  const { locale } = useLocale();

  if (decision.allowed) return null;
  if (decision.reason === "no_refunds") {
    return (
      <AppText variant="meta" className={className}>
        {t("refundClosed.noRefunds")}
      </AppText>
    );
  }
  if (decision.reason === "cutoff_passed") {
    return (
      <AppText variant="meta" className={className}>
        {t("refundClosed.cutoffPassed", {
          when: formatDateTime(decision.deadline, locale, {
            dateStyle: "medium",
            timeStyle: "short",
            timeZone: timeZone ?? undefined,
          }),
        })}
      </AppText>
    );
  }
  return null;
}
