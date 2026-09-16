import { AppHeader } from "@/components/app/AppHeader";
import {
  useCampaign,
  useInvalidateContent,
} from "@/features/content/useContent";
import { api } from "@/lib/api";
import { formatMinor } from "@abonten/core/content/campaignMoney";
import { canTransitionCampaign } from "@abonten/core/content/campaignStateMachine";
import {
  CAMPAIGN_OBJECTIVE_LABEL,
  CAMPAIGN_STATUS_LABEL,
} from "@abonten/core/content/copy";
import {
  AppText,
  Button,
  Refresher,
  ScreenError,
  Spinner,
  useToast,
} from "@abonten/ui-native";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Alert, ScrollView, View } from "react-native";

// One of your Spotlight promotions: status, spend, delivery and history,
// with pause, resume and cancel.
export default function CampaignScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const toast = useToast();
  const invalidate = useInvalidateContent();
  const q = useCampaign(id);
  const [busy, setBusy] = useState<string | null>(null);
  const header = (
    <AppHeader
      variant="detail"
      title="Promotion"
      backFallback="/(app)/spotlight/manage?tab=campaigns"
    />
  );

  if (q.isLoading) {
    return (
      <View className="flex-1 bg-background">
        {header}
        <Spinner />
      </View>
    );
  }
  if (!q.data) {
    return (
      <View className="flex-1 bg-background">
        {header}
        <ScreenError
          message="This promotion isn't available."
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
        toast.error(res.message ?? "Couldn't update this promotion.");
        return;
      }
      toast.success(
        action === "pause"
          ? "Paused"
          : action === "resume"
            ? "Resumed"
            : "Cancelled",
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

  const rows: [string, string][] = [
    ["Status", CAMPAIGN_STATUS_LABEL[c.status]],
    ["Goal", CAMPAIGN_OBJECTIVE_LABEL[c.objective]],
    [
      "Plan",
      `${formatMinor(c.budgetMinor, c.currency)} · ${c.durationDays} days`,
    ],
    ["Paid", formatMinor(c.paidMinor, c.currency)],
    ["Used so far", formatMinor(c.spentMinor, c.currency)],
    ["Refunded", formatMinor(c.refundedMinor, c.currency)],
    ["Impressions", c.impressions.toLocaleString()],
    ["Views", c.views.toLocaleString()],
    ["Taps", c.clicks.toLocaleString()],
  ];

  return (
    <View className="flex-1 bg-background">
      {header}
      <ScrollView
        contentContainerClassName="gap-5 p-4 pb-16"
        refreshControl={<Refresher onRefresh={() => q.refetch()} />}
      >
        <AppText numberOfLines={2} variant="bodyStrong">
          {c.post?.caption?.trim() || "Spotlight"}
        </AppText>

        {c.status === "pending_review" ? (
          <AppText variant="muted">
            Payment received. Our team reviews every promotion before it runs.
            If it isn't approved, you're refunded in full.
          </AppText>
        ) : null}
        {c.status === "rejected" && c.reviewReason ? (
          <AppText tone="error">Not approved: {c.reviewReason}</AppText>
        ) : null}
        {c.status === "paused" && c.pauseSource !== "advertiser" ? (
          <AppText tone="warning">
            Paused by Abonten{c.pauseReason ? `: ${c.pauseReason}` : "."}
          </AppText>
        ) : null}

        <View className="rounded-xl border border-border bg-card">
          {rows.map(([label, value], i) => (
            <View
              key={label}
              className={[
                "flex-row justify-between px-4 py-3",
                i > 0 ? "border-t border-border" : "",
              ].join(" ")}
            >
              <AppText variant="meta">{label}</AppText>
              <AppText variant="metaStrong">{value}</AppText>
            </View>
          ))}
        </View>

        <View className="gap-2">
          {canPause ? (
            <Button
              title="Pause"
              variant="outline"
              loading={busy === "pause"}
              disabled={!!busy}
              onPress={() => act("pause")}
            />
          ) : null}
          {canResume ? (
            <Button
              title="Resume"
              loading={busy === "resume"}
              disabled={!!busy}
              onPress={() => act("resume")}
            />
          ) : null}
          {canCancel ? (
            <Button
              title="Cancel promotion"
              variant="destructive"
              loading={busy === "cancel"}
              disabled={!!busy}
              onPress={() =>
                Alert.alert(
                  "Cancel this promotion?",
                  "It stops straight away. Any unused budget is reviewed for a refund by our team.",
                  [
                    { text: "Keep it", style: "cancel" },
                    {
                      text: "Cancel promotion",
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
          <AppText variant="sectionHeading">History</AppText>
          {events.map((e) => (
            <View key={e.id} className="gap-0.5">
              <AppText variant="small" className="font-semibold">
                {CAMPAIGN_STATUS_LABEL[
                  e.toStatus as keyof typeof CAMPAIGN_STATUS_LABEL
                ] ?? e.toStatus}
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
