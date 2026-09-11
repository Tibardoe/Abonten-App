import { formatCredit } from "@abonten/core/rewards/creditAmount";
import type { PromotionCredit } from "@abonten/types/rewards";
import { AppText, Button, Overline } from "@abonten/ui-native";
import { useRouter } from "expo-router";
import { View } from "react-native";

const monthOf = (period: string) =>
  new Date(`${period}T00:00:00Z`).toLocaleDateString(undefined, {
    month: "long",
    timeZone: "UTC",
  });

// Promotion credit on the organizer finance screen (Rewards Phase 6), the
// native echo of the web Finances card: what the monthly rebates earned and
// a way to spend it on featuring. Separate from the withdrawable balance --
// credit is never paid out as money.
export function PromotionCreditCard({ credit }: { credit: PromotionCredit }) {
  const router = useRouter();
  const { organizerShareBps, venueShareBps, milestone, visits, expiryDays } =
    credit.rates;

  const lines: string[] = [];
  if (organizerShareBps) {
    lines.push(
      `Each month you get ${organizerShareBps / 100}% of what Abonten earned on your events that ended the month before.`,
    );
  }
  if (venueShareBps) {
    lines.push(
      `Own a verified place? You get ${venueShareBps / 100}% when other organizers hold ticketed events there.`,
    );
  }
  if (visits) {
    lines.push(
      `Own a verified place? Every different person who checks in with your place's code in a month earns you ${formatCredit(visits.perVisitorMinor)} (up to ${visits.maxVisitors} a month).`,
    );
  }
  if (milestone) {
    lines.push(
      `The first time one of your events sells to ${milestone.uniqueBuyers} different people, you get ${formatCredit(milestone.amountMinor)}.`,
    );
  }

  return (
    <View className="gap-3 rounded-2xl border border-border bg-card p-4">
      <View className="gap-1">
        <Overline>Promotion credit</Overline>
        <AppText variant="hero" className="tabular-nums">
          {formatCredit(credit.promotionOnlyMinor)}
        </AppText>
        {credit.pendingMinor > 0 ? (
          <AppText variant="small" tone="muted">
            {formatCredit(credit.pendingMinor)} pending
          </AppText>
        ) : null}
        {credit.last ? (
          <AppText variant="small" tone="muted">
            +{formatCredit(credit.last.amountMinor)} for events that ended in{" "}
            {monthOf(credit.last.periodStart)}
          </AppText>
        ) : null}
      </View>

      {credit.canRedeem && credit.spendableMinor > credit.promotionOnlyMinor ? (
        <AppText variant="small">
          You can put {formatCredit(credit.spendableMinor)} towards featuring an
          event or place, including your other Abonten Credit.
        </AppText>
      ) : null}
      {!credit.canRedeem && credit.promotionOnlyMinor > 0 ? (
        <AppText variant="small">
          Soon you&apos;ll be able to use it to feature your events and places.
        </AppText>
      ) : null}

      {credit.canRedeem && credit.spendableMinor > 0 ? (
        <Button
          title="Feature an event"
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
        Promotion credit only pays for featuring events and places
        {expiryDays
          ? `, and lasts ${expiryDays} days from when you get it`
          : ""}
        . It can&apos;t be withdrawn.
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
