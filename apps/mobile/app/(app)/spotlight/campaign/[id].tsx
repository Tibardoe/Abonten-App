import { AppHeader } from "@/components/app/AppHeader";
import { QueryUnavailable } from "@/components/app/QueryUnavailable";
import { PromotionPaymentSection } from "@/components/organizer/PromotionPaymentSection";
import {
  useCampaign,
  useInvalidateContent,
} from "@/features/content/useContent";
import { api } from "@/lib/api";
import { useQueryView } from "@/lib/useQueryView";
import { formatMinor } from "@abonten/core/content/campaignMoney";
import { canTransitionCampaign } from "@abonten/core/content/campaignStateMachine";
import {
  PROMOTION_CASH_NOTE_KEY,
  PROMOTION_ESTIMATE_NOTE_KEY,
  campaignObjectiveLabel,
  campaignStatusLabel,
  isCampaignStatus,
  promotionEndReasonLabel,
} from "@abonten/core/content/copy";
import { formatReachRange } from "@abonten/core/content/promotionEstimate";
import { currencyMinorFactor } from "@abonten/core/money/currencies";
import {
  AppText,
  Button,
  Refresher,
  ScreenError,
  Spinner,
  useToast,
} from "@abonten/ui-native";
import { useTranslations } from "@abonten/ui-native/i18n";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Alert, ScrollView, View } from "react-native";

// One of your Spotlight promotions: status, spend, delivery and history,
// with pause, resume and cancel.
export default function CampaignScreen() {
  const t = useTranslations("spotlight");
  const tc = useTranslations("core");

  const { id } = useLocalSearchParams<{ id: string }>();
  const toast = useToast();
  const invalidate = useInvalidateContent();
  const q = useCampaign(id);
  // Loading, offline and failed are told apart from "no such promotion".
  const view = useQueryView(q);
  const [busy, setBusy] = useState<string | null>(null);
  const header = (
    <AppHeader
      variant="detail"
      title={t("promotion")}
      backFallback="/(app)/spotlight/manage?tab=campaigns"
    />
  );

  if (view.kind !== "content" && view.kind !== "empty") {
    return (
      <View className="flex-1 bg-background">
        {header}
        <QueryUnavailable
          view={view}
          subject={t("thisPromotion")}
          onRetry={() => q.refetch()}
          loading={<Spinner />}
        />
      </View>
    );
  }
  if (!q.data) {
    return (
      <View className="flex-1 bg-background">
        {header}
        <ScreenError
          message={t("thisPromotionIsnTAvailable")}
          onRetry={() => q.refetch()}
        />
      </View>
    );
  }

  const { campaign: c, events } = q.data;

  const act = async (action: "pause" | "resume" | "cancel") => {
    setBusy(action);
    try {
      const res = await api.content.campaignAction(c.id, action);
      if (res.status !== 200) {
        toast.error(res.message ?? t("couldnTUpdateThisPromotion"));
        return;
      }
      toast.success(
        action === "pause"
          ? t("paused")
          : action === "resume"
            ? t("resumed")
            : t("cancelled"),
      );
      invalidate();
    } finally {
      setBusy(null);
    }
  };

  const canPause = canTransitionCampaign(c.status, "paused", "advertiser");
  const canResume =
    canTransitionCampaign(c.status, "active", "advertiser") &&
    c.pauseSource === "advertiser";
  const canCancel = canTransitionCampaign(c.status, "cancelled", "advertiser");

  const m = c.metrics;
  const n = (v: number | undefined) => (v ?? 0).toLocaleString("en-GB");
  const unused = Math.max(0, c.paidMinor - c.spentMinor - c.refundedMinor);
  const rows: [string, string][] = [
    [t("status"), campaignStatusLabel(tc, c.status)],
    [t("goal"), campaignObjectiveLabel(tc, c.objective)],
    [t("budget"), formatMinor(c.budgetMinor, c.currency)],
    [
      t("runsForUpTo"),
      tc("promotionSummary.duration.days", { count: c.durationDays }),
    ],
    [t("usedSoFar"), formatMinor(c.spentMinor, c.currency)],
    [t("unused"), formatMinor(unused, c.currency)],
    [t("refunded"), formatMinor(c.refundedMinor, c.currency)],
  ];
  // Reach is people; impressions are times shown.
  const delivery: [string, string][] = [
    [
      t("estimatedReach"),
      formatReachRange(tc, {
        reachLow: c.estimatedReachLow,
        reachHigh: c.estimatedReachHigh,
      }),
    ],
    [t("peopleReached"), n(m?.reach ?? c.reach)],
    [
      t("sponsoredImpressions"),
      `${n(m?.impressions ?? c.impressions)} of ${n(c.impressionGoal)}`,
    ],
    [t("meaningfulViews"), n(m?.meaningfulViews ?? c.views)],
    [t("completedViews"), n(m?.completions ?? c.completions)],
    [t("profileVisits"), n(m?.clicks.profile)],
    [t("eventPlaceTaps"), `${n(m?.clicks.event)} / ${n(m?.clicks.place)}`],
    [t("newFollowers"), n(m?.follows)],
    [
      "Tickets / reservations",
      `${n(m?.conversions.ticketPurchases)} / ${n(m?.conversions.reservations)}`,
    ],
  ];

  return (
    <View className="flex-1 bg-background">
      {header}
      <ScrollView
        contentContainerClassName="gap-5 p-4 pb-16"
        refreshControl={<Refresher onRefresh={() => q.refetch()} />}
      >
        <AppText numberOfLines={2} variant="bodyStrong">
          {c.post?.caption?.trim() || t("spotlight")}
        </AppText>

        {c.status === "pending_payment" && c.checkoutId ? (
          // Leaving the promote screen before paying must not strand the
          // order: it can be paid (or cancelled) from here.
          <View className="gap-2">
            <AppText variant="muted">
              {t("waitingForPayment2", {
                cashNote: tc(PROMOTION_CASH_NOTE_KEY),
              })}
            </AppText>
            <PromotionPaymentSection
              kind="spotlight"
              checkoutId={c.checkoutId}
              entityId={c.id}
              currency={c.currency}
              amount={c.budgetMinor / currencyMinorFactor(c.currency)}
              onFeatured={() => {
                invalidate();
                q.refetch();
              }}
            />
          </View>
        ) : null}
        {c.status === "pending_review" ? (
          <AppText variant="muted">
            {t("paymentReceivedOurTeamReviewsEvery")}
          </AppText>
        ) : null}
        {c.status === "rejected" && c.reviewReason ? (
          <AppText tone="error">
            {t("notApproved", { reviewReason: c.reviewReason })}
          </AppText>
        ) : null}
        {c.status === "paused" && c.pauseSource !== "advertiser" ? (
          <AppText tone="warning">
            {t("pausedByAbonten")}
            {c.pauseReason ? `: ${c.pauseReason}` : "."}
          </AppText>
        ) : null}

        {c.status === "completed" && c.endReason ? (
          <AppText variant="muted">
            {promotionEndReasonLabel(tc, c.endReason)}.
            {unused > 0
              ? t("ofTheBudgetWasnTUsed2", {
                  formatMinor: formatMinor(unused, c.currency),
                })
              : ""}
          </AppText>
        ) : null}

        {[
          { title: t("budget"), list: rows },
          { title: t("delivery"), list: delivery },
        ].map((group) => (
          <View key={group.title} className="gap-2">
            <AppText variant="label">{group.title}</AppText>
            <View className="rounded-xl border border-border bg-card">
              {group.list.map(([label, value], i) => (
                <View
                  key={label}
                  className={[
                    "flex-row justify-between gap-3 px-4 py-3",
                    i > 0 ? "border-t border-border" : "",
                  ].join(" ")}
                >
                  <AppText variant="meta">{label}</AppText>
                  <AppText variant="metaStrong" className="shrink text-right">
                    {value}
                  </AppText>
                </View>
              ))}
            </View>
          </View>
        ))}
        <AppText variant="caption" tone="muted">
          {tc(PROMOTION_ESTIMATE_NOTE_KEY)}
        </AppText>

        <View className="gap-2">
          {canPause ? (
            <Button
              title={t("pause")}
              variant="outline"
              loading={busy === "pause"}
              disabled={!!busy}
              onPress={() => act("pause")}
            />
          ) : null}
          {canResume ? (
            <Button
              title={t("resume")}
              loading={busy === "resume"}
              disabled={!!busy}
              onPress={() => act("resume")}
            />
          ) : null}
          {canCancel ? (
            <Button
              title={t("cancelPromotion")}
              variant="destructive"
              loading={busy === "cancel"}
              disabled={!!busy}
              onPress={() =>
                Alert.alert(
                  t("cancelThisPromotion"),
                  t("itStopsStraightAwayAnyUnused"),
                  [
                    { text: t("keepIt"), style: "cancel" },
                    {
                      text: t("cancelPromotion"),
                      style: "destructive",
                      onPress: () => act("cancel"),
                    },
                  ],
                )
              }
            />
          ) : null}
        </View>

        <View className="gap-2">
          <AppText variant="sectionHeading">{t("history")}</AppText>
          {events.map((e) => (
            <View key={e.id} className="gap-0.5">
              <AppText variant="small" className="font-semibold">
                {isCampaignStatus(e.toStatus)
                  ? campaignStatusLabel(tc, e.toStatus)
                  : e.toStatus}
              </AppText>
              <AppText variant="caption" tone="muted">
                {new Date(e.createdAt).toLocaleString()}
                {e.reason ? ` · ${e.reason}` : ""}
              </AppText>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}
