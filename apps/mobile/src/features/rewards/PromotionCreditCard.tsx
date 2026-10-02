import { formatDate } from "@abonten/core/i18n/format";
import { formatCredit } from "@abonten/core/rewards/creditAmount";
import type { PromotionCredit } from "@abonten/types/rewards";
import { AppText, Button, Overline } from "@abonten/ui-native";
import {
  getCurrentLocale,
  useLocale,
  useTranslations,
} from "@abonten/ui-native/i18n";
import { useRouter } from "expo-router";
import { View } from "react-native";

const monthOf = (period: string) =>
  formatDate(`${period}T00:00:00Z`, getCurrentLocale(), {
    month: "long",
    timeZone: "UTC",
  });

// Promotion credit on the organizer finance screen (Rewards Phase 6), the
// native echo of the web Finances card: what the monthly rebates earned and
// a way to spend it on featuring. Separate from the withdrawable balance --
// credit is never paid out as money.
export function PromotionCreditCard({ credit }: { credit: PromotionCredit }) {
  const { locale } = useLocale();
  const t = useTranslations("rewards");

  const router = useRouter();
  const { organizerShareBps, venueShareBps, milestone, visits, expiryDays } =
    credit.rates;

  const lines: string[] = [];
  if (organizerShareBps) {
    lines.push(t("eachMonthYouGetOfWhat", { value: organizerShareBps / 100 }));
  }
  if (venueShareBps) {
    lines.push(t("ownAVerifiedPlaceYouGet", { value: venueShareBps / 100 }));
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

  return (
    <View className="gap-3 rounded-2xl border border-border bg-card p-4">
      <View className="gap-1">
        <Overline>{t("promotionCredit")}</Overline>
        <AppText variant="hero" className="tabular-nums">
          {formatCredit(credit.promotionOnlyMinor, credit.currency, locale)}
        </AppText>
        {credit.pendingMinor > 0 ? (
          <AppText variant="small" tone="muted">
            {t("pending3", {
              formatCredit: formatCredit(
                credit.pendingMinor,
                credit.currency,
                locale,
              ),
            })}
          </AppText>
        ) : null}
        {credit.last ? (
          <AppText variant="small" tone="muted">
            {t("forEventsThatEndedIn", {
              formatCredit: formatCredit(
                credit.last.amountMinor,
                credit.currency,
                locale,
              ),
              monthOf: monthOf(credit.last.periodStart),
            })}
          </AppText>
        ) : null}
      </View>

      {credit.canRedeem && credit.spendableMinor > credit.promotionOnlyMinor ? (
        <AppText variant="small">
          {t("youCanPutTowardsFeaturingAn", {
            formatCredit: formatCredit(
              credit.spendableMinor,
              credit.currency,
              locale,
            ),
          })}
        </AppText>
      ) : null}
      {!credit.canRedeem && credit.promotionOnlyMinor > 0 ? (
        <AppText variant="small">{t("soonYouLlBeAbleTo3")}</AppText>
      ) : null}

      {credit.canRedeem && credit.spendableMinor > 0 ? (
        <Button
          title={t("featureAnEvent")}
          leftIcon="megaphone-outline"
          fullWidth
          onPress={() => router.push("/(app)/organizer/events")}
        />
      ) : null}

      {lines.length > 0 ? (
        <View className="gap-1 border-t border-border pt-3">
          {lines.map((line) => (
            <AppText key={line} variant="small" tone="muted">
              • {line}
            </AppText>
          ))}
        </View>
      ) : null}

      <AppText variant="caption">
        {t("promotionCreditRules", { days: expiryDays ?? 0 })}
      </AppText>
    </View>
  );
}

/** Whether the card has anything to say (the program is on for them and a rebate is live or they have some). */
export function showPromotionCredit(
  credit: PromotionCredit | undefined,
): credit is PromotionCredit {
  if (!credit?.enabled) return false;
  const r = credit.rates;
  return (
    !!r.organizerShareBps ||
    !!r.venueShareBps ||
    !!r.milestone ||
    !!r.visits ||
    credit.promotionOnlyMinor > 0 ||
    credit.pendingMinor > 0 ||
    credit.earnedMinor > 0
  );
}
