import { usePaymentMethods } from "@/features/wallet/usePaymentMethods";
import type { PaymentMethodRow } from "@abonten/api-client";
import { AppText } from "@abonten/ui-native";
import { useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import { useCreateAttempt } from "./usePayment";

// Method picker + "Pay". Once the attempt is created this hands off to
// <PaymentVerificationScreen> (app/(app)/payment/[attemptId]) — this component
// never shows payment status, so there's no second Pay button beside a live
// payment. api.checkout.attempt is idempotent server-side (an open attempt is
// reused, a failed one is replaced), so re-tapping "Pay" is safe.

function methodLabel(m: PaymentMethodRow): string {
  const d = m.details as Record<string, string>;
  return m.method_type === "momo"
    ? `${d.networkName ?? "Mobile money"} · ${d.phone ?? ""}`
    : `${d.brand ?? "Card"} ···· ${d.last4 ?? ""}`;
}

export function PaymentSection({
  sessionId,
  currency,
  total,
  eventTitle,
}: {
  sessionId: string;
  currency: string;
  total: number;
  eventTitle?: string;
}) {
  const router = useRouter();
  const { data: methodsRes } = usePaymentMethods();
  const methods = methodsRes?.status === 200 ? (methodsRes.data ?? []) : [];

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const createAttempt = useCreateAttempt();

  const chosenId = selectedId ?? methods.find((m) => m.is_default)?.id ?? null;

  async function onPay() {
    if (!chosenId || createAttempt.isPending) return;
    setError(null);

    const res = await createAttempt.mutateAsync({
      checkoutSessionIds: [sessionId],
      paymentMethodId: chosenId,
    });

    if (res.status !== 200) {
      setError(
        res.status === 409
          ? "This checkout expired. Go back and start again."
          : (res.message ?? "Couldn't start the payment."),
      );
      return;
    }

    const attemptId = res.data.attempts[0]?.id;
    if (!attemptId) {
      setError("Couldn't start the payment.");
      return;
    }
    const ps = res.data.paystack;

    router.push({
      pathname: "/(app)/payment/[attemptId]",
      params: {
        attemptId,
        kind: "ticket",
        mode: ps.mode,
        deepLink: `abonten://checkout/${sessionId}`,
        contextTitle: eventTitle ?? "Your order",
        amountLabel: `${currency} ${total}`,
        successHref: "/(app)/(tabs)/tickets",
        successCtaLabel: "View my tickets",
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
          Add a mobile money wallet or card to pay.
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
        disabled={!chosenId || createAttempt.isPending}
        onPress={onPay}
        className={`items-center rounded-xl px-4 py-3 ${
          !chosenId || createAttempt.isPending ? "bg-muted" : "bg-primary"
        }`}
      >
        {createAttempt.isPending ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <AppText
            className={`text-sm font-semibold ${
              !chosenId ? "text-muted-foreground" : "text-primary-foreground"
            }`}
          >
            Pay {currency} {total}
          </AppText>
        )}
      </Pressable>
    </View>
  );
}
