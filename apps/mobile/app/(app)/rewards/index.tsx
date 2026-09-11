import { AppHeader } from "@/components/app/AppHeader";
import { useReferralCode } from "@/features/rewards/useReferralCode";
import {
  flattenCreditActivity,
  useCreditActivity,
  useCreditSummary,
  useRewardsProgram,
} from "@/features/rewards/useRewards";
import { formatDateWithSuffix } from "@abonten/core/dateFormatter";
import {
  formatCredit,
  formatCreditDelta,
} from "@abonten/core/rewards/creditAmount";
import type {
  CreditActivityItem,
  CreditActivityState,
  CreditSummary,
  RewardsProgram,
} from "@abonten/types/rewards";
import {
  AppText,
  Badge,
  type BadgeTone,
  Card,
  EmptyState,
  ListFooter,
  Refresher,
  Skeleton,
} from "@abonten/ui-native";
import { useCallback } from "react";
import { FlatList, View } from "react-native";

// Native echo of web /rewards: balance first, plain-language explanations
// underneath, then the activity feed. Same services and wording as web (the
// activity titles come from @abonten/core/rewards/creditActivityCopy on the
// server), so the two platforms can't disagree.

const STATE_BADGE: Partial<
  Record<CreditActivityState, { label: string; tone: BadgeTone }>
> = {
  pending: { label: "Pending", tone: "warning" },
  available: { label: "Available", tone: "success" },
  used: { label: "Used", tone: "muted" },
  expired: { label: "Expired", tone: "muted" },
  reversed: { label: "Reversed", tone: "destructive" },
};

function BalanceCard({ summary }: { summary: CreditSummary }) {
  return (
    <Card elevated className="gap-1">
      <AppText variant="meta">Available to spend</AppText>
      <AppText
        variant="hero"
        tone={summary.inDebt ? "error" : "primary"}
        className="tabular-nums"
      >
        {formatCredit(summary.availableMinor)}
      </AppText>
      {summary.pendingMinor > 0 ? (
        <AppText variant="small" className="mt-2">
          {formatCredit(summary.pendingMinor)} pending
          {summary.nextRelease
            ? ` · next ${formatCredit(summary.nextRelease.amountMinor)} unlocks ${formatDateWithSuffix(summary.nextRelease.releaseAt)}`
            : ""}
        </AppText>
      ) : null}
      {summary.onHoldMinor > 0 ? (
        <AppText variant="meta">
          {formatCredit(summary.onHoldMinor)} on hold for a checkout in progress
        </AppText>
      ) : null}
      {summary.expiringSoon ? (
        <AppText variant="small" tone="warning" className="mt-1">
          {formatCredit(summary.expiringSoon.amountMinor)} expires on{" "}
          {formatDateWithSuffix(summary.expiringSoon.expiresAt)}. Use it before
          then.
        </AppText>
      ) : null}
      {summary.status === "frozen" ? (
        <View className="mt-3 rounded-xl bg-muted p-3">
          <AppText variant="small">
            Your credit is on hold while we review recent activity. You can
            still earn, but you can&apos;t spend credit until the review is
            finished.
          </AppText>
        </View>
      ) : null}
      {summary.inDebt ? (
        <View className="mt-3 rounded-xl bg-muted p-3">
          <AppText variant="small">
            A reward was reversed after you had already used it. New credit you
            earn goes towards this first.
          </AppText>
        </View>
      ) : null}
    </Card>
  );
}

// The user's code. Event share links already carry it, so there's nothing
// to copy -- this only explains what it does (same words as web).
function ReferralCodeCard({
  code,
  rateBps,
}: { code: string; rateBps: number }) {
  return (
    <Card className="gap-1">
      <AppText variant="cardTitle">Your referral code</AppText>
      <AppText variant="hero" className="tracking-widest">
        {code}
      </AppText>
      <AppText variant="small">
        When you share an event, the link carries this code. If someone buys a
        ticket through it, you earn {(rateBps / 100).toFixed(0)}% of the ticket
        price in credit once the event is over. Your own tickets and events you
        organize don&apos;t count.
      </AppText>
    </Card>
  );
}

function HowItWorks({ program }: { program: RewardsProgram }) {
  const earn: string[] = [];
  if (program.eventReferral) {
    earn.push(
      `Share an event. When someone buys with your link, you earn ${(program.eventReferral.rateBps / 100).toFixed(0)}% of the ticket price after the event.`,
    );
  }
  if (program.friendReferral?.referrerMinor) {
    earn.push(
      `Invite a friend. When they buy their first ticket, you get ${formatCredit(program.friendReferral.referrerMinor)}.`,
    );
  }
  if (program.organizerRebate) {
    earn.push("Organize events. As tickets sell, you earn promotion credit.");
  }
  const use: string[] = [];
  if (program.redemption.promotions)
    use.push("Feature your events and places.");
  if (program.redemption.tickets) use.push("Pay for tickets at checkout.");

  return (
    <Card className="gap-3">
      <View className="gap-1">
        <AppText variant="cardTitle">How to earn</AppText>
        {earn.length > 0 ? (
          earn.map((line) => (
            <AppText key={line} variant="small">
              • {line}
            </AppText>
          ))
        ) : (
          <AppText variant="muted">
            Ways to earn credit by sharing events and inviting friends are
            coming soon.
          </AppText>
        )}
      </View>
      <View className="gap-1">
        <AppText variant="cardTitle">How to use credit</AppText>
        {use.length > 0 ? (
          use.map((line) => (
            <AppText key={line} variant="small">
              • {line}
            </AppText>
          ))
        ) : (
          <AppText variant="muted">
            Soon you&apos;ll be able to use credit to feature your events and
            places, and to pay for tickets.
          </AppText>
        )}
      </View>
      <AppText variant="caption">
        Abonten Credit can only be used on Abonten. It can&apos;t be transferred
        or exchanged for cash.
      </AppText>
    </Card>
  );
}

function ActivityRow({ item }: { item: CreditActivityItem }) {
  const badge = STATE_BADGE[item.state];
  const detail =
    item.state === "pending" && item.releaseAt
      ? `Unlocks ${formatDateWithSuffix(item.releaseAt)}`
      : item.state === "available" && item.expiresAt
        ? `Expires ${formatDateWithSuffix(item.expiresAt)}`
        : null;
  // A voided/expired grant never became spendable credit, so its amount is
  // struck through rather than shown as income (same rule as web).
  const struck =
    item.amountMinor > 0 &&
    (item.state === "reversed" || item.state === "expired");
  return (
    <View className="flex-row items-start justify-between gap-3 border-b border-border py-3">
      <View className="flex-1 gap-0.5">
        <AppText variant="bodyStrong">{item.title}</AppText>
        {item.subtitle ? (
          <AppText variant="meta" numberOfLines={1}>
            {item.subtitle}
          </AppText>
        ) : null}
        <AppText variant="caption">
          {formatDateWithSuffix(item.createdAt)}
          {detail ? ` · ${detail}` : ""}
        </AppText>
      </View>
      <View className="items-end gap-1">
        <AppText
          variant="metaStrong"
          tone={item.amountMinor < 0 || struck ? "muted" : "primary"}
          className={struck ? "tabular-nums line-through" : "tabular-nums"}
        >
          {formatCreditDelta(item.amountMinor)}
        </AppText>
        {badge ? (
          <Badge label={badge.label} tone={badge.tone} uppercase={false} />
        ) : null}
      </View>
    </View>
  );
}

export default function Rewards() {
  const program = useRewardsProgram();
  const enabled = program.data?.enabled === true;
  const summary = useCreditSummary({ enabled });
  const activity = useCreditActivity({ enabled });
  const referralCode = useReferralCode();
  const items = flattenCreditActivity(activity.data?.pages);

  const onEndReached = useCallback(() => {
    if (activity.hasNextPage && !activity.isFetchingNextPage) {
      activity.fetchNextPage();
    }
  }, [activity]);

  const refresh = useCallback(() => {
    program.refetch();
    summary.refetch();
    activity.refetch();
  }, [program, summary, activity]);

  if (program.isLoading) {
    return (
      <View className="flex-1 bg-background">
        <AppHeader
          variant="title"
          title="Rewards"
          backFallback="/(app)/account"
        />
        <View className="gap-4 p-4">
          <Skeleton height={144} radius={16} />
          <Skeleton height={160} radius={16} />
        </View>
      </View>
    );
  }

  if (!enabled || !program.data) {
    return (
      <View className="flex-1 bg-background">
        <AppHeader
          variant="title"
          title="Rewards"
          backFallback="/(app)/account"
        />
        <EmptyState
          icon="gift-outline"
          title="Rewards are coming soon"
          description="Earn Abonten Credit by sharing events and inviting friends. We'll let you know when it's ready."
        />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <AppHeader
        variant="title"
        title="Rewards"
        backFallback="/(app)/account"
      />
      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        contentContainerClassName="px-4 pb-16"
        ListHeaderComponent={
          <View className="gap-4 pb-2 pt-4">
            {summary.data ? (
              <BalanceCard summary={summary.data} />
            ) : summary.isError ? (
              <Card>
                <AppText variant="small">
                  We couldn&apos;t load your balance. Pull down to try again.
                </AppText>
              </Card>
            ) : (
              <Skeleton height={144} radius={16} />
            )}
            {referralCode && program.data.eventReferral ? (
              <ReferralCodeCard
                code={referralCode}
                rateBps={program.data.eventReferral.rateBps}
              />
            ) : null}
            <HowItWorks program={program.data} />
            <AppText variant="overline" className="pt-2">
              Activity
            </AppText>
          </View>
        }
        renderItem={({ item }) => <ActivityRow item={item} />}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.5}
        refreshControl={
          <Refresher
            refreshing={
              (summary.isRefetching || activity.isRefetching) &&
              !activity.isFetchingNextPage
            }
            onRefresh={refresh}
          />
        }
        ListEmptyComponent={
          activity.isLoading ? null : (
            <AppText variant="muted" className="py-8 text-center">
              No credit activity yet. Credit you earn or receive will show up
              here.
            </AppText>
          )
        }
        ListFooterComponent={
          <ListFooter
            count={items.length}
            isFetchingNextPage={activity.isFetchingNextPage}
            hasNextPage={!!activity.hasNextPage}
          />
        }
      />
    </View>
  );
}
