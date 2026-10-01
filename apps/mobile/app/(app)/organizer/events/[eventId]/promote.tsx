import { QueryUnavailable } from "@/components/app/QueryUnavailable";
import { PromotionPaymentSection } from "@/components/organizer/PromotionPaymentSection";
import {
  useEventPromotionContext,
  useInvalidateEventPromotion,
  usePromoteEvent,
} from "@/features/organizer/useEventPromotion";
import { useQueryView } from "@/lib/useQueryView";
import { formatDateWithSuffix } from "@abonten/core/dateFormatter";
import { formatMoney } from "@abonten/core/formatMoney";
import { AppText, useToast } from "@abonten/ui-native";
import { useLocale, useTranslations } from "@abonten/ui-native/i18n";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";

type Reserved = {
  checkoutId: string;
  tierLabel: string;
  amount: number;
  currency: string;
};

export default function PromoteEventScreen() {
  const { locale } = useLocale();

  const t = useTranslations("manage");

  const toast = useToast();
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const id = eventId ?? "";
  const q = useEventPromotionContext(id);
  const promote = usePromoteEvent();
  const invalidate = useInvalidateEventPromotion();

  const [selectedTierId, setSelectedTierId] = useState<number | null>(null);
  const [reserved, setReserved] = useState<Reserved | null>(null);

  const ctx = q.data?.status === 200 ? q.data.data : null;
  // The server's own answer keeps its message; loading, offline and failed
  // are told apart from it.
  const definiteFailure = q.data !== undefined && q.data.status !== 200;
  const view = useQueryView(q);

  if (!definiteFailure && view.kind !== "content" && view.kind !== "empty") {
    return (
      <View className="flex-1 bg-background">
        <QueryUnavailable
          view={view}
          subject="promotion options"
          onRetry={() => q.refetch()}
          loading={
            <View className="flex-1 items-center justify-center">
              <ActivityIndicator />
            </View>
          }
        />
      </View>
    );
  }

  if (!ctx) {
    return (
      <View className="flex-1 items-center justify-center gap-3 bg-background p-6">
        <AppText className="text-center text-muted-foreground">
          {(q.data && q.data.status !== 200 && q.data.message) ||
            t("couldnTLoadPromotionOptions")}
        </AppText>
        <Pressable
          accessibilityRole="button"
          onPress={() => q.refetch()}
          className="rounded-lg bg-primary px-4 py-2"
        >
          <AppText className="font-semibold text-primary-foreground">
            {t("retry")}
          </AppText>
        </Pressable>
      </View>
    );
  }

  const ineligibleReason =
    ctx.eligibility.eventStatus === "canceled"
      ? t("thisEventWasCancelledAndCan")
      : ctx.eligibility.eventStatus === "completed" || ctx.eligibility.ended
        ? t("thisEventHasAlreadyEndedAnd")
        : ctx.eligibility.soldOut
          ? t("thisEventIsSoldOutAnd")
          : null;

  async function onContinue() {
    if (selectedTierId == null) return;
    const res = await promote.mutateAsync({
      eventId: id,
      tierId: selectedTierId,
    });
    if (res.status !== 200) {
      toast.error(t("couldnTStart"), {
        description: res.message ?? t("pleaseTryAgain"),
      });
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
        <AppText variant="screenTitle">{t("featureThisEvent")}</AppText>
        <AppText className="mt-1 text-sm text-muted-foreground">
          {t("getAPaidRandomlyRotatedSlot")}
        </AppText>
      </View>

      {ctx.currentPromotion ? (
        <View className="gap-2 rounded-2xl border border-primary/40 bg-primary/10 p-5">
          <AppText className="font-semibold text-primary">
            {t("thisEventIsCurrentlyFeatured")}
          </AppText>
          <AppText className="text-sm text-muted-foreground">
            {ctx.currentPromotion.tierLabel
              ? t("placementActive", {
                  tierLabel: ctx.currentPromotion.tierLabel,
                })
              : t("active")}
            {t("until")}
            <AppText className="font-medium text-foreground">
              {formatDateWithSuffix(
                ctx.currentPromotion.ends_at,
                undefined,
                locale,
              )}
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
            <AppText className="text-sm text-muted-foreground">
              {t("order")}
            </AppText>
            <View className="flex-row justify-between">
              <AppText className="text-sm text-foreground">
                {t("placement", { tierLabel: reserved.tierLabel })}
              </AppText>
              <AppText className="text-sm font-semibold text-foreground">
                {formatMoney(reserved.currency, reserved.amount)}
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
              {t("noPromotionTiersAreAvailableRight")}
            </AppText>
          ) : (
            ctx.tiers.map((tier) => {
              const active = selectedTierId === tier.id;
              return (
                <Pressable
                  accessibilityRole="button"
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
                    {formatMoney(tier.currency, tier.price)}
                  </AppText>
                </Pressable>
              );
            })
          )}

          <Pressable
            accessibilityRole="button"
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
              {promote.isPending ? t("starting") : t("continueToPayment")}
            </AppText>
          </Pressable>
        </View>
      )}
    </ScrollView>
  );
}
