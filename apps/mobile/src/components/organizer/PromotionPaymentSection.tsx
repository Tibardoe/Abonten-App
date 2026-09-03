import { useCreatePromotionAttempt } from "@/features/organizer/useEventPromotion";
import { useCreatePlacePromotionAttempt } from "@/features/organizer/usePlacePromotion";
import { usePaymentMethods } from "@/features/wallet/usePaymentMethods";
import type { PaymentMethodRow } from "@abonten/api-client";
import { AppText } from "@abonten/ui-native";
import { useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";

// Method picker + "Pay" for a promotion checkout. Like the ticket
// PaymentSection, it starts the attempt then hands off to
// <PaymentVerificationScreen>; it never renders payment status itself.

function methodLabel(m: PaymentMethodRow): string {
  const d = m.details as Record<string, string>;
  return m.method_type === "momo"
    ? `${d.networkName ?? "Mobile money"} · ${d.phone ?? ""}`
    : `${d.brand ?? "Card"} ···· ${d.last4 ?? ""}`;
}

export function PromotionPaymentSection({
  checkoutId,
  entityId,
  currency,
  amount,
  onFeatured,
  kind = "event",
}: {
  checkoutId: string;
  /** The event / place id — used to route back on success. */
  entityId: string;
  currency: string;
  amount: number;
  onFeatured: () => void;
  kind?: "event" | "place";
}) {
  const router = useRouter();
  const { data: methodsRes } = usePaymentMethods();
  const methods = methodsRes?.status === 200 ? (methodsRes.data ?? []) : [];

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const createEventAttempt = useCreatePromotionAttempt();
  const createPlaceAttempt = useCreatePlacePromotionAttempt();
  const creatingAttempt =
    createEventAttempt.isPending || createPlaceAttempt.isPending;

  const chosenId = selectedId ?? methods.find((m) => m.is_default)?.id ?? null;

  async function onPay() {
    if (!chosenId || creatingAttempt) return;
    setError(null);

    const res =
      kind === "place"
        ? await createPlaceAttempt.mutateAsync({
            placePromotionCheckoutId: checkoutId,
            paymentMethodId: chosenId,
          })
        : await createEventAttempt.mutateAsync({
            eventPromotionCheckoutId: checkoutId,
            paymentMethodId: chosenId,
          });

    if (res.status !== 200) {
      setError(
        res.status === 410
          ? "This checkout expired. Go back and start again."
          : (res.message ?? "Couldn't start the payment."),
      );
      return;
    }

    // Let the promote screen refresh its own promotion context on the way out.
    onFeatured();

    const attemptId = res.data.attempt.id;
    const ps = res.data.paystack;
    const successHref =
      kind === "place"
        ? `/(app)/organizer/places/${entityId}`
        : `/(app)/organizer/events/${entityId}`;

    router.push({
      pathname: "/(app)/payment/[attemptId]",
      params: {
        attemptId,
        kind: kind === "place" ? "place_promotion" : "event_promotion",
        mode: ps.mode,
        deepLink: `abonten://promotion/${checkoutId}`,
        contextTitle: `Feature this ${kind}`,
        amountLabel: `${currency} ${amount.toFixed(2)}`,
        successHref,
        successCtaLabel: `View ${kind}`,
        ...(ps.mode === "popup"
          ? { authorizationUrl: ps.authorizationUrl }
          : {
              chargeStatus: ps.chargeStatus,
              displayMessage: ps.displayMessage,
            }),
      },
    });
  }

  if (methods.length === 0) {
    return (
      <View className="gap-3 rounded-xl border border-border bg-card p-4">
        <AppText className="text-sm text-muted-foreground">
          Add a payment method to pay for a promotion.
        </AppText>
        <Pressable
          onPress={() => router.push("/(app)/wallet")}
          className="items-center rounded-lg bg-primary px-4 py-2.5"
        >
          <AppText className="text-sm font-semibold text-primary-foreground">
            Add payment method
          </AppText>
        </Pressable>
      </View>
    );
  }

  return (
    <View className="gap-3">
      <AppText className="text-sm font-semibold text-foreground">
        Pay with
      </AppText>
      {methods.map((m) => {
        const selected = m.id === chosenId;
        return (
          <Pressable
            key={m.id}
            onPress={() => setSelectedId(m.id)}
            className={`flex-row items-center justify-between rounded-xl border p-3 ${
              selected ? "border-primary bg-accent" : "border-border bg-card"
            }`}
          >
            <AppText className="text-sm text-foreground">
              {methodLabel(m)}
            </AppText>
            {selected ? (
              <AppText variant="small" tone="brand" className="font-semibold">
                ✓
              </AppText>
            ) : null}
          </Pressable>
        );
      })}

      {error ? (
        <View className="rounded-lg border border-destructive/40 bg-destructive/10 p-3">
          <AppText className="text-sm text-destructive">{error}</AppText>
        </View>
      ) : null}

      <Pressable
        disabled={!chosenId || creatingAttempt}
        onPress={onPay}
        className={`items-center rounded-xl px-4 py-3 ${
          !chosenId || creatingAttempt ? "bg-muted" : "bg-primary"
        }`}
      >
        {creatingAttempt ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <AppText
            className={`text-sm font-semibold ${
              !chosenId ? "text-muted-foreground" : "text-primary-foreground"
            }`}
          >
            Pay {currency} {amount.toFixed(2)}
          </AppText>
        )}
      </Pressable>
    </View>
  );
}
