import { AppHeader } from "@/components/app/AppHeader";
import { useActivePromotions } from "@/features/promotions/useActivePromotions";
import { useIsOrganizer } from "@/features/roles/useRoles";
import { useIsOnline } from "@/lib/network";
import { useQueryView } from "@/lib/useQueryView";
import { formatDateWithSuffix } from "@abonten/core/dateFormatter";
import {
  promotionKindLabel,
  promotionStateLabel,
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
import { useLocale, useTranslations } from "@abonten/ui-native/i18n";
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
  const { locale } = useLocale();

  const t = useTranslations("settings");
  const tc = useTranslations("core");

  const router = useRouter();
  const upcoming = promotion.state === "scheduled";
  const when = formatDateWithSuffix(
    upcoming ? promotion.startsAt : promotion.endsAt,
    undefined,
    locale,
  );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${promotionKindLabel(tc, promotion.resourceType)}: ${promotion.resourceName}, ${promotionStateLabel(tc, promotion.state)}`}
      onPress={() => router.push(promotionHref(promotion))}
      className="min-h-[64px] flex-row items-center gap-3 py-3 active:opacity-70"
    >
      <View className="flex-1 gap-1">
        <AppText variant="caption" tone="muted">
          {promotionKindLabel(tc, promotion.resourceType)}
        </AppText>
        <AppText variant="bodyStrong" numberOfLines={1}>
          {promotion.resourceName}
        </AppText>
        <View className="flex-row flex-wrap items-center gap-2">
          <StatusPill
            status={STATUS_KEY[promotion.state]}
            options={{ label: promotionStateLabel(tc, promotion.state) }}
            size="sm"
            hideIcon
          />
          <AppText variant="meta" numberOfLines={1}>
            {promotion.tierLabel ? `${promotion.tierLabel} · ` : ""}
            {upcoming ? t("starts") : t("ends")} {when}
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
  const t = useTranslations("settings");
  const tc = useTranslations("core");

  const router = useRouter();
  const online = useIsOnline();
  const isOrganizer = useIsOrganizer();
  const promotions = useActivePromotions();
  const items = promotions.data ?? [];
  // "No active promotions" is only ever said for an answer the server gave;
  // loading, offline and failed are told apart.
  const view = useQueryView(promotions, (list) => list.length === 0);

  let body: React.ReactNode;
  if (view.kind === "loading") {
    body = (
      <View className="gap-4 py-2" accessibilityLabel={t("loadingPromotions")}>
        {["a", "b"].map((k) => (
          <View key={k} className="gap-2">
            <Skeleton width="30%" height={10} />
            <Skeleton width="70%" height={14} />
            <Skeleton width="45%" height={10} />
          </View>
        ))}
      </View>
    );
  } else if (view.kind === "content") {
    body = items.map((p, i) => (
      <Fragment key={`${p.resourceType}-${p.campaignId ?? p.resourceId}`}>
        {i > 0 ? <Divider /> : null}
        <PromotionRow promotion={p} />
      </Fragment>
    ));
  } else if (view.kind === "offline" || view.kind === "error") {
    body = (
      <View className="items-start gap-2 py-2">
        <AppText variant="body">
          {view.kind === "error"
            ? t("couldnTLoadYourPromotions")
            : t("youReOfflineYourPromotionsWill")}
        </AppText>
        {view.kind === "error" ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => promotions.refetch()}
            hitSlop={8}
          >
            <AppText tone="brand" className="font-semibold">
              {t("tryAgain")}
            </AppText>
          </Pressable>
        ) : null}
      </View>
    );
  } else {
    body = (
      <View className="gap-1 py-2">
        <AppText variant="bodyStrong">{t("noActivePromotions")}</AppText>
        <AppText variant="muted">{t("featureAnEventAPlaceOr")}</AppText>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <AppHeader
        variant="title"
        title={t("overview")}
        backFallback="/(app)/settings"
      />
      <ScrollView
        className="flex-1 bg-background"
        contentContainerClassName="gap-3 p-4 pb-10"
        refreshControl={<Refresher onRefresh={() => promotions.refetch()} />}
      >
        <Overline>{t("promotions")}</Overline>
        <Card padded>
          {body}
          {view.kind === "empty" && isOrganizer ? (
            <>
              <Divider />
              <LinkRow
                label={t("manageEvents2")}
                onPress={() => router.push("/(app)/organizer/events")}
              />
              <Divider />
              <LinkRow
                label={t("managePlaces2")}
                onPress={() => router.push("/(app)/organizer/places")}
              />
            </>
          ) : null}
        </Card>
        {view.kind === "content" && view.refreshFailed ? (
          <AppText variant="caption" tone="muted">
            {online
              ? t("couldnTRefreshShowingWhatWas")
              : t("youReOfflineShowingWhatWas")}
          </AppText>
        ) : null}

        <Overline className="mt-3">{t("quickLinks2")}</Overline>
        <Card padded>
          <LinkRow
            label={t("managePaymentMethods")}
            onPress={() => router.push("/(app)/wallet")}
          />
          <Divider />
          <LinkRow
            label={t("viewTransactionHistory")}
            onPress={() => router.push("/(app)/transactions")}
          />
        </Card>
      </ScrollView>
    </View>
  );
}
