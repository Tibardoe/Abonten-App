import { AppHeader } from "@/components/app/AppHeader";
import { useActivePromotions } from "@/features/promotions/useActivePromotions";
import { useIsOrganizer } from "@/features/roles/useRoles";
import { useIsOnline } from "@/lib/network";
import { formatDateWithSuffix } from "@abonten/core/dateFormatter";
import {
  PROMOTION_KIND_LABEL,
  PROMOTION_STATE_LABEL,
} from "@abonten/core/promotionSummary";
import type { ActivePromotionSummary } from "@abonten/types/promotionSummaryType";
import {
  AppText,
  Card,
  Divider,
  Icon,
  Overline,
  Refresher,
  Skeleton,
  StatusPill,
} from "@abonten/ui-native";
import { type Href, useRouter } from "expo-router";
import { Fragment } from "react";
import { Pressable, ScrollView, View } from "react-native";

// Settings › Overview: what you are promoting right now, then quick links.
// Promotions come from the same service as the web Settings card
// (listActivePromotionsCore): featured events and places and promoted
// Spotlights that are running, starting soon, in review or paused. The list
// is cached (and kept for offline use); a failed refresh keeps showing it.

const STATUS_KEY: Record<ActivePromotionSummary["state"], string> = {
  active: "active",
  scheduled: "scheduled",
  in_review: "pending_review",
  paused: "paused",
};

function promotionHref(p: ActivePromotionSummary): Href {
  if (p.resourceType === "event") {
    return `/(app)/organizer/events/${p.resourceId}/promote` as Href;
  }
  if (p.resourceType === "place") {
    return `/(app)/organizer/places/${p.resourceId}/promote` as Href;
  }
  return p.campaignId
    ? (`/(app)/spotlight/campaign/${p.campaignId}` as Href)
    : ("/(app)/spotlight/manage?tab=campaigns" as Href);
}

function PromotionRow({ promotion }: { promotion: ActivePromotionSummary }) {
  const router = useRouter();
  const upcoming = promotion.state === "scheduled";
  const when = formatDateWithSuffix(
    upcoming ? promotion.startsAt : promotion.endsAt,
  );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${PROMOTION_KIND_LABEL[promotion.resourceType]}: ${promotion.resourceName}, ${PROMOTION_STATE_LABEL[promotion.state]}`}
      onPress={() => router.push(promotionHref(promotion))}
      className="min-h-[64px] flex-row items-center gap-3 py-3 active:opacity-70"
    >
      <View className="flex-1 gap-1">
        <AppText variant="caption" tone="muted">
          {PROMOTION_KIND_LABEL[promotion.resourceType]}
        </AppText>
        <AppText variant="bodyStrong" numberOfLines={1}>
          {promotion.resourceName}
        </AppText>
        <View className="flex-row flex-wrap items-center gap-2">
          <StatusPill
            status={STATUS_KEY[promotion.state]}
            options={{ label: PROMOTION_STATE_LABEL[promotion.state] }}
            size="sm"
            hideIcon
          />
          <AppText variant="meta" numberOfLines={1}>
            {promotion.tierLabel ? `${promotion.tierLabel} · ` : ""}
            {upcoming ? "Starts" : "Ends"} {when}
          </AppText>
        </View>
      </View>
      <Icon name="chevron-forward" size={18} tone="muted" />
    </Pressable>
  );
}

function LinkRow({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className="min-h-[48px] flex-row items-center justify-between py-3 active:opacity-70"
    >
      <AppText variant="body">{label}</AppText>
      <Icon name="chevron-forward" size={18} tone="muted" />
    </Pressable>
  );
}

export default function SettingsOverview() {
  const router = useRouter();
  const online = useIsOnline();
  const isOrganizer = useIsOrganizer();
  const promotions = useActivePromotions();
  const items = promotions.data ?? [];

  let body: React.ReactNode;
  if (promotions.isLoading) {
    body = (
      <View className="gap-4 py-2" accessibilityLabel="Loading promotions">
        {["a", "b"].map((k) => (
          <View key={k} className="gap-2">
            <Skeleton width="30%" height={10} />
            <Skeleton width="70%" height={14} />
            <Skeleton width="45%" height={10} />
          </View>
        ))}
      </View>
    );
  } else if (items.length > 0) {
    body = items.map((p, i) => (
      <Fragment key={`${p.resourceType}-${p.campaignId ?? p.resourceId}`}>
        {i > 0 ? <Divider /> : null}
        <PromotionRow promotion={p} />
      </Fragment>
    ));
  } else if (promotions.isError && !promotions.data) {
    body = (
      <View className="items-start gap-2 py-2">
        <AppText variant="body">
          {online
            ? "Couldn't load your promotions."
            : "You're offline. Your promotions will load when you reconnect."}
        </AppText>
        {online ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => promotions.refetch()}
            hitSlop={8}
          >
            <AppText tone="brand" className="font-semibold">
              Try again
            </AppText>
          </Pressable>
        ) : null}
      </View>
    );
  } else {
    body = (
      <View className="gap-1 py-2">
        <AppText variant="bodyStrong">No active promotions</AppText>
        <AppText variant="muted">
          Feature an event, a place or a Spotlight to reach more people.
        </AppText>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <AppHeader
        variant="title"
        title="Overview"
        backFallback="/(app)/settings"
      />
      <ScrollView
        className="flex-1 bg-background"
        contentContainerClassName="gap-3 p-4 pb-10"
        refreshControl={<Refresher onRefresh={() => promotions.refetch()} />}
      >
        <Overline>Promotions</Overline>
        <Card padded>
          {body}
          {items.length === 0 && !promotions.isLoading && isOrganizer ? (
            <>
              <Divider />
              <LinkRow
                label="Manage events"
                onPress={() => router.push("/(app)/organizer/events")}
              />
              <Divider />
              <LinkRow
                label="Manage places"
                onPress={() => router.push("/(app)/organizer/places")}
              />
            </>
          ) : null}
        </Card>
        {items.length > 0 && promotions.isError ? (
          <AppText variant="caption" tone="muted">
            {online
              ? "Couldn't refresh. Showing what was last loaded."
              : "You're offline. Showing what was last loaded."}
          </AppText>
        ) : null}

        <Overline className="mt-3">Quick links</Overline>
        <Card padded>
          <LinkRow
            label="Manage payment methods"
            onPress={() => router.push("/(app)/wallet")}
          />
          <Divider />
          <LinkRow
            label="View transaction history"
            onPress={() => router.push("/(app)/transactions")}
          />
        </Card>
      </ScrollView>
    </View>
  );
}
