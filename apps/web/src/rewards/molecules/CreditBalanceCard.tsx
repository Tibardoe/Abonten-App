import { cn } from "@/components/lib/utils";
import { formatDateWithSuffix } from "@abonten/core/dateFormatter";
import { formatCredit } from "@abonten/core/rewards/creditAmount";
import type { CreditSummary } from "@abonten/types/rewards";
import { useLocale, useTranslations } from "next-intl";

// The one number a user should notice first -- what they can spend right
// now -- with everything else (pending, on hold, expiring) explained in
// plain words underneath rather than as competing figures.
export default function CreditBalanceCard({
  summary,
  welcomeMinOrderMinor = null,
}: {
  summary: CreditSummary;
  /** Welcome credit only pays for a first ticket order of at least this. */
  welcomeMinOrderMinor?: number | null;
}) {
  const locale = useLocale();

  const t = useTranslations("rewards");

  const frozen = summary.status === "frozen";
  const welcomeMinor = summary.bySpendScope.first_order ?? 0;

  return (
    <section
      aria-label={t("yourAbontenCredit")}
      className="rounded-xl border bg-card p-5 md:p-6"
    >
      <p className="text-sm text-muted-foreground">{t("availableToSpend")}</p>
      <p
        className={cn(
          "mt-1 text-4xl font-semibold tabular-nums tracking-tight",
          summary.inDebt && "text-destructive",
        )}
      >
        {formatCredit(summary.availableMinor, summary.currency, locale)}
      </p>

      <div className="mt-4 flex flex-col gap-1.5 text-sm">
        {summary.pendingMinor > 0 ? (
          <p>
            <span className="font-medium tabular-nums">
              {formatCredit(summary.pendingMinor, summary.currency, locale)}
            </span>{" "}
            <span className="text-muted-foreground">
              {summary.nextRelease
                ? t("pendingNextUnlocks", {
                    amount: formatCredit(
                      summary.nextRelease.amountMinor,
                      summary.currency,
                      locale,
                    ),
                    date: formatDateWithSuffix(
                      summary.nextRelease.releaseAt,
                      undefined,
                      locale,
                    ),
                  })
                : t("pending")}
            </span>
          </p>
        ) : null}
        {summary.onHoldMinor > 0 ? (
          <p className="text-muted-foreground">
            {t.rich("amountOnHoldForCheckout", {
              amount: formatCredit(
                summary.onHoldMinor,
                summary.currency,
                locale,
              ),
              strong: (chunks) => (
                <span className="font-medium tabular-nums text-foreground">
                  {chunks}
                </span>
              ),
            })}
          </p>
        ) : null}
        {welcomeMinor > 0 ? (
          <p className="text-muted-foreground">
            {t.rich(
              welcomeMinOrderMinor
                ? "welcomeCreditForFirstOrderMin"
                : "welcomeCreditForFirstOrder",
              {
                amount: formatCredit(welcomeMinor, summary.currency, locale),
                minimum: welcomeMinOrderMinor
                  ? formatCredit(welcomeMinOrderMinor, summary.currency, locale)
                  : "",
                strong: (chunks) => (
                  <span className="font-medium tabular-nums text-foreground">
                    {chunks}
                  </span>
                ),
              },
            )}
          </p>
        ) : null}
        {summary.expiringSoon ? (
          <p className="text-amber-700 dark:text-amber-400">
            {t("expiresOnUseItBeforeThen", {
              formatCredit: formatCredit(
                summary.expiringSoon.amountMinor,
                summary.currency,
                locale,
              ),
              formatDateWithSuffix: formatDateWithSuffix(
                summary.expiringSoon.expiresAt,
                undefined,
                locale,
              ),
            })}
          </p>
        ) : null}
      </div>

      {frozen ? (
        <p className="mt-4 rounded-md bg-muted p-3 text-sm">
          {t("yourCreditIsOnHoldWhile")}
        </p>
      ) : null}
      {summary.inDebt ? (
        <p className="mt-4 rounded-md bg-muted p-3 text-sm">
          {t("aRewardWasReversedAfterYou")}
        </p>
      ) : null}
    </section>
  );
}
