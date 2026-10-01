import type { LoyaltyProgress, RewardsProgram } from "@abonten/types/rewards";
import { intlLocale } from "../i18n/coreStrings";
import type { CoreI18n, CoreTranslator } from "../i18n/translator";
import { formatCredit } from "./creditAmount";

// The "How to earn" wording for the Rewards pages, built only from the LIVE
// program terms so a page can never promise something the reward engine
// doesn't pay. Shared by web and mobile so the two say the same thing. The
// words live under `earn.*` and `loyalty.*` of the core namespace.

function percent(bps: number, locale?: string | null): string {
  return new Intl.NumberFormat(intlLocale(locale), {
    style: "percent",
    maximumFractionDigits: 2,
  }).format(bps / 10000);
}

export function rewardsEarnLines(
  { t, locale }: CoreI18n,
  program: RewardsProgram,
): string[] {
  const lines: string[] = [];
  if (program.eventReferral) {
    lines.push(
      t("earn.eventReferral", {
        percent: percent(program.eventReferral.rateBps, locale),
      }),
    );
  }
  if (program.promoterCommission) {
    lines.push(t("earn.promoterCommission"));
  }
  if (program.friendReferral?.referrerMinor) {
    const amount = formatCredit(
      program.friendReferral.referrerMinor,
      program.currency,
    );
    lines.push(
      program.friendReferral.refereeMinor
        ? t("earn.friendReferralBoth", {
            amount,
            friendAmount: formatCredit(
              program.friendReferral.refereeMinor,
              program.currency,
            ),
          })
        : t("earn.friendReferral", { amount }),
    );
  }
  if (program.loyaltyFeeRebate) {
    const l = program.loyaltyFeeRebate;
    lines.push(
      t("earn.loyalty", {
        orders: l.ordersRequired,
        days: l.windowDays,
        cap: formatCredit(l.maxMinor, program.currency),
      }),
    );
  }
  if (program.organizerRebate) {
    lines.push(
      t("earn.organizerRebate", {
        percent: percent(program.organizerRebate.netShareBps, locale),
      }),
    );
  }
  if (program.venueRebate) {
    lines.push(
      t("earn.venueRebate", {
        percent: percent(program.venueRebate.netShareBps, locale),
      }),
    );
  }
  if (program.placeVisits) {
    lines.push(
      t("earn.placeVisits", {
        amount: formatCredit(
          program.placeVisits.perVisitorMinor,
          program.currency,
        ),
        max: program.placeVisits.maxVisitors,
      }),
    );
  }
  if (program.organizerMilestone) {
    lines.push(
      t("earn.organizerMilestone", {
        buyers: program.organizerMilestone.uniqueBuyers,
        amount: formatCredit(
          program.organizerMilestone.amountMinor,
          program.currency,
        ),
      }),
    );
  }
  return lines;
}

/** The loyalty card: how far along the caller is. */
export function loyaltyProgressCopy(
  t: CoreTranslator,
  p: LoyaltyProgress,
): {
  headline: string;
  detail: string;
} {
  const left = Math.max(p.ordersRequired - p.ordersCounted, 0);
  const cap = formatCredit(p.maxPerRewardMinor, p.currency);
  const min =
    p.minOrderMinor > 0 ? formatCredit(p.minOrderMinor, p.currency) : null;
  const headline = t("loyalty.headline", {
    counted: p.ordersCounted,
    required: p.ordersRequired,
  });
  if (left === 0) {
    return { headline, detail: t("loyalty.done", { cap }) };
  }
  if (left === 1) {
    return {
      headline,
      detail: min
        ? t("loyalty.oneMoreMin", { min, days: p.windowDays, cap })
        : t("loyalty.oneMore", { days: p.windowDays, cap }),
    };
  }
  return {
    headline,
    detail: min
      ? t("loyalty.moreMin", { left, min, days: p.windowDays, cap })
      : t("loyalty.more", { left, days: p.windowDays, cap }),
  };
}
