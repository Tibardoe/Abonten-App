import { CardTitle } from "@/components/ui/typography";
import { formatCredit } from "@abonten/core/rewards/creditAmount";
import { loyaltyProgressCopy } from "@abonten/core/rewards/earnCopy";
import type { LoyaltyProgress } from "@abonten/types/rewards";
import { useLocale, useTranslations } from "next-intl";

// The loyalty fee rebate (Rewards Phase 8): one dot per different event the
// caller has bought tickets to in the current count, and what the next
// reward is. The count and the reward come from the server.
export default function LoyaltyProgressCard({
  progress,
}: {
  progress: LoyaltyProgress;
}) {
  const locale = useLocale();
  const t = useTranslations("rewards");
  const tc = useTranslations("core");

  const copy = loyaltyProgressCopy(tc, progress);
  return (
    <section className="rounded-xl border p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <CardTitle>{t("serviceFeeBack")}</CardTitle>
        <span className="text-sm font-medium tabular-nums">
          {copy.headline}
        </span>
      </div>
      <ol
        className="mt-3 flex gap-2"
        aria-label={t("ofEvents", {
          ordersCounted: progress.ordersCounted,
          ordersRequired: progress.ordersRequired,
        })}
      >
        {Array.from({ length: progress.ordersRequired }, (_, i) => (
          <li
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length progress dots
            key={i}
            className={`h-2.5 flex-1 rounded-full ${
              i < progress.ordersCounted ? "bg-primary" : "bg-muted"
            }`}
          />
        ))}
      </ol>
      <p className="mt-3 text-sm text-muted-foreground">{copy.detail}</p>
      {progress.pendingMinor > 0 ? (
        <p className="mt-2 text-sm">
          {t("ofServiceFeesIsOnIts", {
            formatCredit: formatCredit(
              progress.pendingMinor,
              progress.currency,
              locale,
            ),
          })}
        </p>
      ) : null}
      {progress.earnedMinor > 0 ? (
        <p className="mt-1 text-xs text-muted-foreground">
          {t("givenBackSoFar", {
            formatCredit: formatCredit(
              progress.earnedMinor,
              progress.currency,
              locale,
            ),
          })}
        </p>
      ) : null}
    </section>
  );
}
