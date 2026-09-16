import { AppHeader } from "@/components/app/AppHeader";
import { PromotionPaymentSection } from "@/components/organizer/PromotionPaymentSection";
import {
  useCampaignPresets,
  useContentPost,
  useInvalidateContent,
} from "@/features/content/useContent";
import { useContentProgram } from "@/features/content/useContentProgram";
import { api } from "@/lib/api";
import { formatMinor } from "@abonten/core/content/campaignMoney";
import {
  CAMPAIGN_OBJECTIVES,
  CAMPAIGN_OBJECTIVE_LABEL,
  SPONSORED_LABEL,
} from "@abonten/core/content/copy";
import type { ContentCampaignObjective } from "@abonten/types/contentType";
import {
  AppText,
  Button,
  Chip,
  EmptyState,
  Spinner,
  useToast,
} from "@abonten/ui-native";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";

type Reserved = {
  campaignId: string;
  checkoutId: string;
  amount: number;
  currency: string;
};

// Promote a live Spotlight: choose a fixed plan and a goal, then pay. The
// price comes from the server; nothing runs until payment is confirmed and
// the promotion passes review.
export default function PromoteSpotlightScreen() {
  const { postId } = useLocalSearchParams<{ postId: string }>();
  const toast = useToast();
  const invalidate = useInvalidateContent();
  const { program } = useContentProgram();
  const post = useContentPost(postId);
  const presets = useCampaignPresets(program.spotlightPromotions);
  const [presetId, setPresetId] = useState<number | null>(null);
  const [objective, setObjective] = useState<ContentCampaignObjective>("views");
  const [starting, setStarting] = useState(false);
  const [reserved, setReserved] = useState<Reserved | null>(null);

  const doc =
    post.data &&
    post.data.status === 200 &&
    post.data.data &&
    "post" in post.data.data
      ? post.data.data.post
      : null;
  const header = (
    <AppHeader
      variant="detail"
      title="Promote"
      backFallback="/(app)/spotlight/manage"
    />
  );

  if (!program.spotlightPromotions) {
    return (
      <View className="flex-1 bg-background">
        {header}
        <EmptyState
          icon="megaphone-outline"
          title="Promotions aren't available yet"
          description="Check back soon."
        />
      </View>
    );
  }
  if (post.isLoading || presets.isLoading) {
    return (
      <View className="flex-1 bg-background">
        {header}
        <Spinner />
      </View>
    );
  }

  const objectives = CAMPAIGN_OBJECTIVES.filter((o) => {
    if (o === "event_views" || o === "ticket_sales") return !!doc?.event;
    if (o === "place_views" || o === "reservations")
      return !!doc?.place || doc?.publisher.kind === "place";
    return true;
  });
  const list = presets.data ?? [];
  const selected = list.find((p) => p.id === presetId) ?? list[0] ?? null;

  const start = async () => {
    if (!selected || !postId || starting) return;
    setStarting(true);
    try {
      const res = await api.content.createCampaign({
        postId,
        presetId: selected.id,
        objective,
        // Starts as soon as it is approved.
        startsAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
        targeting: { categories: [] },
      });
      if (res.status !== 200 || !res.data) {
        toast.error("Couldn't start", {
          description: res.message ?? "Please try again.",
        });
        return;
      }
      setReserved({
        campaignId: res.data.campaign.id,
        checkoutId: res.data.checkout.id,
        amount: res.data.checkout.totalPrice,
        currency: res.data.checkout.currency,
      });
    } catch {
      toast.error("Couldn't start", { description: "Check your connection." });
    } finally {
      setStarting(false);
    }
  };

  return (
    <View className="flex-1 bg-background">
      {header}
      <ScrollView contentContainerClassName="gap-5 p-4 pb-16">
        <AppText variant="muted">
          Promoted Spotlights appear in more feeds with a “{SPONSORED_LABEL}”
          label. Every promotion is reviewed before it runs; if it isn't
          approved, you're refunded in full. We don't promise a number of views.
        </AppText>

        {reserved ? (
          <View className="gap-3">
            <View className="rounded-xl border border-border bg-card p-4">
              <AppText variant="bodyStrong">{selected?.label}</AppText>
              <AppText variant="meta">
                {CAMPAIGN_OBJECTIVE_LABEL[objective]} ·{" "}
                {formatMinor(
                  Math.round(reserved.amount * 100),
                  reserved.currency,
                )}
              </AppText>
            </View>
            <AppText variant="caption" tone="muted">
              Paid by card or mobile money. Abonten Credit can't be used for
              promotions.
            </AppText>
            <PromotionPaymentSection
              kind="spotlight"
              checkoutId={reserved.checkoutId}
              entityId={reserved.campaignId}
              currency={reserved.currency}
              amount={reserved.amount}
              onFeatured={invalidate}
            />
          </View>
        ) : list.length === 0 ? (
          <AppText variant="muted">
            Promotion plans aren't available right now.
          </AppText>
        ) : (
          <>
            <View className="gap-2">
              <AppText variant="label">Plan</AppText>
              {list.map((p) => {
                const on = selected?.id === p.id;
                return (
                  <Pressable
                    key={p.id}
                    onPress={() => setPresetId(p.id)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                    className={[
                      "flex-row items-center justify-between rounded-xl border p-4",
                      on ? "border-primary bg-accent" : "border-border bg-card",
                    ].join(" ")}
                  >
                    <View>
                      <AppText variant="bodyStrong">{p.label}</AppText>
                      <AppText variant="meta">
                        Runs for {p.durationDays} days
                      </AppText>
                    </View>
                    <AppText variant="bodyStrong">
                      {formatMinor(p.budgetMinor, p.currency)}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>
            <View className="gap-2">
              <AppText variant="label">Goal</AppText>
              <View className="flex-row flex-wrap gap-2">
                {objectives.map((o) => (
                  <Chip
                    key={o}
                    label={CAMPAIGN_OBJECTIVE_LABEL[o]}
                    selected={objective === o}
                    onPress={() => setObjective(o)}
                  />
                ))}
              </View>
            </View>
            <Button
              title="Continue to payment"
              loading={starting}
              disabled={!selected}
              onPress={start}
            />
          </>
        )}
      </ScrollView>
    </View>
  );
}
