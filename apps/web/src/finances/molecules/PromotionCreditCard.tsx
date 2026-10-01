"use client";

import { getPromotionCredit } from "@/actions/getPromotionCredit";
import { buttonVariants } from "@/components/ui/button";
import { formatCredit } from "@abonten/core/rewards/creditAmount";
import type { PromotionCredit } from "@abonten/types/rewards";
import { useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";

const monthOf = (period: string, locale: string) =>
  new Date(`${period}T00:00:00Z`).toLocaleDateString(locale, {
    month: "long",
    timeZone: "UTC",
  });

function earnLines(
  t: ReturnType<typeof useTranslations>,
  credit: PromotionCredit,
  locale: string,
): string[] {
  const lines: string[] = [];
  const { organizerShareBps, venueShareBps, milestone, visits } = credit.rates;
  if (organizerShareBps) {
    lines.push(
      t("eachMonthYouGetOfWhat", {
        value: organizerShareBps / 100,
      }),
    );
  }
  if (venueShareBps) {
    lines.push(
      t("ownAVerifiedPlaceYouGet", {
        value: venueShareBps / 100,
      }),
    );
  }
  if (visits) {
    lines.push(
      t("ownAVerifiedPlaceEveryDifferent", {
        formatCredit: formatCredit(
          visits.perVisitorMinor,
          credit.currency,
          locale,
        ),
        maxVisitors: visits.maxVisitors,
      }),
    );
  }
  if (milestone) {
    lines.push(
      t("theFirstTimeOneOfYour", {
        uniqueBuyers: milestone.uniqueBuyers,
        formatCredit: formatCredit(
          milestone.amountMinor,
          credit.currency,
          locale,
        ),
      }),
    );
  }
  return lines;
}

/**
 * Promotion credit on the organizer's Finances page (Rewards Phase 6):
 * what the monthly rebates earned and a way to spend it on featuring.
 * It's separate from the withdrawable balance above it -- credit is never
 * paid out as money.
 */
export default function PromotionCreditCard() {
  const t = useTranslations("finances");
  const locale = useLocale();

  const { data, isError } = useQuery({
    queryKey: ["promotion-credit"],
    queryFn: getPromotionCredit,
    staleTime: 60_000,
  });

  const credit = data?.status === 200 ? data.data : undefined;
  if (isError || !credit || !credit.enabled) return null;

  const lines = earnLines(t, credit, locale);
  const hasActivity =
    credit.promotionOnlyMinor > 0 ||
    credit.pendingMinor > 0 ||
    credit.earnedMinor > 0;
  if (lines.length === 0 && !hasActivity) return null;

  return (
    <section className="rounded-2xl border border-border bg-card text-card-foreground p-5 md:p-6 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">
            {t("promotionCredit")}
          </p>
          <p className="font-bold text-2xl md:text-3xl tabular-nums">
            {formatCredit(credit.promotionOnlyMinor, credit.currency, locale)}
          </p>
          {credit.pendingMinor > 0 ? (
            <p className="text-sm text-muted-foreground mt-1">
              {t("pending", {
                formatCredit: formatCredit(
                  credit.pendingMinor,
                  credit.currency,
                  locale,
                ),
              })}
            </p>
          ) : null}
          {credit.last ? (
            <p className="text-sm text-muted-foreground mt-1">
              {t("forEventsThatEndedIn", {
                formatCredit: formatCredit(
                  credit.last.amountMinor,
                  credit.currency,
                  locale,
                ),
                monthOf: monthOf(credit.last.periodStart, locale),
              })}
            </p>
          ) : null}
        </div>
        {credit.canRedeem && credit.spendableMinor > 0 ? (
          <Link
            href="/manage/events"
            className={buttonVariants({ className: "font-semibold" })}
          >
            {t("featureAnEvent")}
          </Link>
        ) : null}
      </div>

      {credit.canRedeem && credit.spendableMinor > credit.promotionOnlyMinor ? (
        <p className="text-sm">
          {t("youCanPutTowardsFeaturingAn", {
            formatCredit: formatCredit(
              credit.spendableMinor,
              credit.currency,
              locale,
            ),
          })}
        </p>
      ) : null}
      {!credit.canRedeem && credit.promotionOnlyMinor > 0 ? (
        <p className="text-sm">{t("soonYouLlBeAbleTo")}</p>
      ) : null}

      {lines.length > 0 ? (
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          {lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : null}

      <p className="text-xs text-muted-foreground border-t border-border pt-3">
        {credit.rates.expiryDays
          ? t("promotionCreditExplainedWithExpiry", {
              expiryDays: credit.rates.expiryDays,
            })
          : t("promotionCreditExplained")}
      </p>
    </section>
  );
}
