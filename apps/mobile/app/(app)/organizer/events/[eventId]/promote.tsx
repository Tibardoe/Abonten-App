import { PromotionPaymentSection } from "@/components/organizer/PromotionPaymentSection";
import {
  useEventPromotionContext,
  useInvalidateEventPromotion,
  usePromoteEvent,
} from "@/features/organizer/useEventPromotion";
import { formatDateWithSuffix } from "@abonten/core/dateFormatter";
import { AppText } from "@abonten/ui-native";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  View,
} from "react-native";

type Reserved = {
  checkoutId: string;
  tierLabel: string;
  amount: number;
  currency: string;
};

export default function PromoteEventScreen() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const id = eventId ?? "";
  const q = useEventPromotionContext(id);
  const promote = usePromoteEvent();
  const invalidate = useInvalidateEventPromotion();

  const [selectedTierId, setSelectedTierId] = useState<number | null>(null);
  const [reserved, setReserved] = useState<Reserved | null>(null);

  const ctx = q.data?.status === 200 ? q.data.data : null;

  if (q.isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator />
      </View>
    );
  }

  if (!ctx) {
    return (
      <View className="flex-1 items-center justify-center gap-3 bg-background p-6">
        <AppText className="text-center text-muted-foreground">
          {(q.data && q.data.status !== 200 && q.data.message) ||
            "Couldn't load promotion options."}
        </AppText>
        <Pressable
          onPress={() => q.refetch()}
          className="rounded-lg bg-primary px-4 py-2"
        >
          <AppText className="font-semibold text-primary-foreground">
            Retry
          </AppText>
        </Pressable>
      </View>
    );
  }

  const ineligibleReason =
    ctx.eligibility.eventStatus === "canceled"
      ? "This event was cancelled and can't be promoted."
      : ctx.eligibility.eventStatus === "completed" || ctx.eligibility.ended
        ? "This event has already ended and can't be promoted."
        : ctx.eligibility.soldOut
          ? "This event is sold out and can't be promoted."
          : null;

  async function onContinue() {
    if (selectedTierId == null) return;
    const res = await promote.mutateAsync({
      eventId: id,
      tierId: selectedTierId,
    });
    if (res.status !== 200) {
      Alert.alert("Couldn't start", res.message ?? "Please try again.");
      return;
    }
    setReserved(res.data);
  }

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="gap-5 p-4 pb-16"
    >
      <View>
        <AppText variant="screenTitle">Feature this event</AppText>
        <AppText className="mt-1 text-sm text-muted-foreground">
          Get a paid, randomly-rotated slot in the Featured Events banner for
          your event's location.
        </AppText>
      </View>

      {ctx.currentPromotion ? (
        <View className="gap-2 rounded-2xl border border-primary/40 bg-primary/10 p-5">
          <AppText className="font-semibold text-primary">
            This event is currently featured
          </AppText>
          <AppText className="text-sm text-muted-foreground">
            {ctx.currentPromotion.tierLabel
              ? `${ctx.currentPromotion.tierLabel} placement, active`
              : "Active"}{" "}
            until{" "}
            <AppText className="font-medium text-foreground">
              {formatDateWithSuffix(ctx.currentPromotion.ends_at)}
            </AppText>
            .
          </AppText>
        </View>
      ) : ineligibleReason ? (
        <View className="rounded-xl border border-border p-4">
          <AppText className="text-sm text-muted-foreground">
            {ineligibleReason}
          </AppText>
        </View>
      ) : reserved ? (
        <View className="gap-4">
          <View className="gap-1 rounded-xl border border-border bg-card p-4">
            <AppText className="text-sm text-muted-foreground">Order</AppText>
            <View className="flex-row justify-between">
              <AppText className="text-sm text-foreground">
                {reserved.tierLabel} placement
              </AppText>
              <AppText className="text-sm font-semibold text-foreground">
                {reserved.currency} {reserved.amount.toFixed(2)}
              </AppText>
            </View>
          </View>
          <PromotionPaymentSection
            checkoutId={reserved.checkoutId}
            entityId={id}
            currency={reserved.currency}
            amount={reserved.amount}
            onFeatured={() => invalidate(id)}
          />
        </View>
      ) : (
        <View className="gap-3">
          {ctx.tiers.length === 0 ? (
            <AppText className="text-sm text-muted-foreground">
              No promotion tiers are available right now.
            </AppText>
          ) : (
            ctx.tiers.map((tier) => {
              const active = selectedTierId === tier.id;
              return (
                <Pressable
                  key={tier.id}
                  onPress={() => setSelectedTierId(tier.id)}
                  className={`flex-row items-center justify-between rounded-xl border p-4 ${
                    active ? "border-primary bg-primary/10" : "border-border"
                  }`}
                >
                  <AppText className="font-medium text-foreground">
                    {tier.duration_label}
                  </AppText>
                  <AppText className="text-sm text-muted-foreground">
                    {tier.currency} {tier.price.toFixed(2)}
                  </AppText>
                </Pressable>
              );
            })
          )}

          <Pressable
            disabled={
              selectedTierId == null ||
              promote.isPending ||
              ctx.tiers.length === 0
            }
            onPress={onContinue}
            className={`items-center rounded-xl px-4 py-3 ${
              selectedTierId == null || promote.isPending
                ? "bg-muted"
                : "bg-primary"
            }`}
          >
            <AppText
              className={`text-sm font-semibold ${
                selectedTierId == null
                  ? "text-muted-foreground"
                  : "text-primary-foreground"
              }`}
            >
              {promote.isPending ? "Starting…" : "Continue to payment"}
            </AppText>
          </Pressable>
        </View>
      )}
    </ScrollView>
  );
}
