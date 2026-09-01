import { PromotionPaymentSection } from "@/components/organizer/PromotionPaymentSection";
import {
  useEventPromotionContext,
  useInvalidateEventPromotion,
  usePromoteEvent,
} from "@/features/organizer/useEventPromotion";
import { formatDateWithSuffix } from "@abonten/core/dateFormatter";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
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
        <Text className="text-center text-muted-foreground">
          {(q.data && q.data.status !== 200 && q.data.message) ||
            "Couldn't load promotion options."}
        </Text>
        <Pressable
          onPress={() => q.refetch()}
          className="rounded-lg bg-primary px-4 py-2"
        >
          <Text className="font-semibold text-primary-foreground">Retry</Text>
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
        <Text className="text-xl font-bold text-foreground">
          Feature this event
        </Text>
        <Text className="mt-1 text-sm text-muted-foreground">
          Get a paid, randomly-rotated slot in the Featured Events banner for
          your event's location.
        </Text>
      </View>

      {ctx.currentPromotion ? (
        <View className="gap-2 rounded-2xl border border-primary/40 bg-primary/10 p-5">
          <Text className="font-semibold text-primary">
            This event is currently featured
          </Text>
          <Text className="text-sm text-muted-foreground">
            {ctx.currentPromotion.tierLabel
              ? `${ctx.currentPromotion.tierLabel} placement, active`
              : "Active"}{" "}
            until{" "}
            <Text className="font-medium text-foreground">
              {formatDateWithSuffix(ctx.currentPromotion.ends_at)}
            </Text>
            .
          </Text>
        </View>
      ) : ineligibleReason ? (
        <View className="rounded-xl border border-border p-4">
          <Text className="text-sm text-muted-foreground">
            {ineligibleReason}
          </Text>
        </View>
      ) : reserved ? (
        <View className="gap-4">
          <View className="gap-1 rounded-xl border border-border bg-card p-4">
            <Text className="text-sm text-muted-foreground">Order</Text>
            <View className="flex-row justify-between">
              <Text className="text-sm text-foreground">
                {reserved.tierLabel} placement
              </Text>
              <Text className="text-sm font-semibold text-foreground">
                {reserved.currency} {reserved.amount.toFixed(2)}
              </Text>
            </View>
          </View>
          <PromotionPaymentSection
            checkoutId={reserved.checkoutId}
            currency={reserved.currency}
            amount={reserved.amount}
            onFeatured={() => invalidate(id)}
          />
        </View>
      ) : (
        <View className="gap-3">
          {ctx.tiers.length === 0 ? (
            <Text className="text-sm text-muted-foreground">
              No promotion tiers are available right now.
            </Text>
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
                  <Text className="font-medium text-foreground">
                    {tier.duration_label}
                  </Text>
                  <Text className="text-sm text-muted-foreground">
                    {tier.currency} {tier.price.toFixed(2)}
                  </Text>
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
            <Text
              className={`text-sm font-semibold ${
                selectedTierId == null
                  ? "text-muted-foreground"
                  : "text-primary-foreground"
              }`}
            >
              {promote.isPending ? "Starting…" : "Continue to payment"}
            </Text>
          </Pressable>
        </View>
      )}
    </ScrollView>
  );
}
