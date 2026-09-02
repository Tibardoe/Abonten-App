import {
  useRetryFulfillment,
  useSubmitChargeOtp,
  useVerifyPayment,
} from "@/features/checkout/usePayment";
import { useCreatePromotionAttempt } from "@/features/organizer/useEventPromotion";
import { useCreatePlacePromotionAttempt } from "@/features/organizer/usePlacePromotion";
import { usePaymentMethods } from "@/features/wallet/usePaymentMethods";
import type { PaymentMethodRow } from "@abonten/api-client";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";

// Native promotion-payment flow — the slim sibling of the ticket
// PaymentSection. Starts the charge via checkout.promotionAttempt (event) or
// checkout.placePromotionAttempt (place), then polls the shared
// payments.verify (which runs finalizePaystackPayment ->
// activateEvent/PlacePromotion). A 207 means the charge cleared but
// activation failed — retryable without re-charging, same as the ticket flow.

type Phase =
  | { k: "idle" }
  | { k: "starting" }
  | { k: "awaiting"; attemptId: string; hint: string }
  | { k: "otp"; attemptId: string }
  | { k: "succeeded" }
  | { k: "activationFailed"; attemptId: string; message: string }
  | { k: "failed"; message: string };

const POLL_MS = 4000;
const MAX_POLLS = 20;

function methodLabel(m: PaymentMethodRow): string {
  const d = m.details as Record<string, string>;
  return m.method_type === "momo"
    ? `${d.networkName ?? "Mobile money"} · ${d.phone ?? ""}`
    : `${d.brand ?? "Card"} ···· ${d.last4 ?? ""}`;
}

export function PromotionPaymentSection({
  checkoutId,
  currency,
  amount,
  onFeatured,
  kind = "event",
}: {
  checkoutId: string;
  currency: string;
  amount: number;
  onFeatured: () => void;
  /** Which promotion checkout this pays for — picks the attempt endpoint. */
  kind?: "event" | "place";
}) {
  const router = useRouter();
  const { data: methodsRes } = usePaymentMethods();
  const methods = methodsRes?.status === 200 ? (methodsRes.data ?? []) : [];

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>({ k: "idle" });
  const [otp, setOtp] = useState("");
  const pollsRef = useRef(0);

  const createEventAttempt = useCreatePromotionAttempt();
  const createPlaceAttempt = useCreatePlacePromotionAttempt();
  const creatingAttempt =
    createEventAttempt.isPending || createPlaceAttempt.isPending;
  const verify = useVerifyPayment();
  const submitOtp = useSubmitChargeOtp();
  const retry = useRetryFulfillment();

  const chosenId = selectedId ?? methods.find((m) => m.is_default)?.id ?? null;

  const pollVerify = useCallback(
    async (attemptId: string) => {
      const res = await verify.mutateAsync(attemptId);
      if (res.status === 200) {
        setPhase({ k: "succeeded" });
        onFeatured();
        return;
      }
      if (res.status === 207) {
        setPhase({
          k: "activationFailed",
          attemptId: res.data.paymentAttemptId,
          message:
            res.message ??
            "Payment went through but we couldn't activate the promotion. Retry now — you won't be charged again.",
        });
        return;
      }
      if (res.status === 400) {
        setPhase({ k: "failed", message: res.message ?? "Payment failed." });
        return;
      }
      pollsRef.current += 1;
      if (pollsRef.current >= MAX_POLLS) {
        setPhase({
          k: "failed",
          message:
            "Still waiting for confirmation. Check the Promotion tab in a minute — if it went through, it'll show as featured.",
        });
      }
    },
    [verify, onFeatured],
  );

  useEffect(() => {
    if (phase.k !== "awaiting") return;
    const id = setInterval(() => {
      void pollVerify(phase.attemptId);
    }, POLL_MS);
    return () => clearInterval(id);
  }, [phase, pollVerify]);

  async function onPay() {
    if (!chosenId) return;
    setPhase({ k: "starting" });
    pollsRef.current = 0;

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
      setPhase({
        k: "failed",
        message:
          res.status === 410
            ? "This checkout expired. Go back and start again."
            : (res.message ?? "Couldn't start the payment."),
      });
      return;
    }

    const attemptId = res.data.attempt.id;
    const ps = res.data.paystack;

    if (ps.mode === "popup") {
      await WebBrowser.openAuthSessionAsync(
        ps.authorizationUrl,
        `abonten://promotion/${checkoutId}`,
      );
      setPhase({ k: "awaiting", attemptId, hint: "Confirming your payment…" });
      void pollVerify(attemptId);
      return;
    }

    if (ps.chargeStatus === "send_otp") {
      setPhase({ k: "otp", attemptId });
      return;
    }
    setPhase({
      k: "awaiting",
      attemptId,
      hint:
        ps.displayMessage ??
        "Approve the payment prompt on your phone, then wait here.",
    });
    void pollVerify(attemptId);
  }

  async function onSubmitOtp(attemptId: string) {
    const res = await submitOtp.mutateAsync({
      paymentAttemptId: attemptId,
      otp,
    });
    if (res.status !== 200) {
      setPhase({ k: "otp", attemptId });
      return;
    }
    setOtp("");
    setPhase({ k: "awaiting", attemptId, hint: "Confirming your payment…" });
    void pollVerify(attemptId);
  }

  async function onRetryActivation(attemptId: string) {
    const res = await retry.mutateAsync(attemptId);
    if (res.status === 200) {
      setPhase({ k: "succeeded" });
      onFeatured();
      return;
    }
    if (res.status === 207 || res.status === 202) {
      setPhase({
        k: "activationFailed",
        attemptId,
        message:
          "Still working on it. Give it a minute and retry — your payment is safe.",
      });
      return;
    }
    setPhase({
      k: "failed",
      message: res.message ?? "Something went wrong. Please contact support.",
    });
  }

  if (phase.k === "succeeded") {
    return (
      <View className="items-center gap-3 rounded-xl border border-border bg-card p-5">
        <Text className="text-base font-bold text-success">
          Your {kind} is now featured
        </Text>
        <Pressable
          onPress={() => router.back()}
          className="rounded-lg bg-primary px-4 py-2.5"
        >
          <Text className="text-sm font-semibold text-primary-foreground">
            Done
          </Text>
        </Pressable>
      </View>
    );
  }

  if (phase.k === "activationFailed") {
    return (
      <View className="gap-3 rounded-xl border border-border bg-card p-4">
        <Text className="text-sm font-semibold text-warning">
          Payment received — finishing up
        </Text>
        <Text className="text-sm text-muted-foreground">{phase.message}</Text>
        <Pressable
          disabled={retry.isPending}
          onPress={() => onRetryActivation(phase.attemptId)}
          className={`items-center rounded-lg px-4 py-2.5 ${
            retry.isPending ? "bg-muted" : "bg-primary"
          }`}
        >
          {retry.isPending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text className="text-sm font-semibold text-primary-foreground">
              Retry activation
            </Text>
          )}
        </Pressable>
      </View>
    );
  }

  if (phase.k === "failed") {
    return (
      <View className="gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-4">
        <Text className="text-sm text-destructive">{phase.message}</Text>
        <Pressable
          onPress={() => setPhase({ k: "idle" })}
          className="items-center rounded-lg border border-border py-2.5"
        >
          <Text className="text-sm font-semibold text-foreground">
            Try again
          </Text>
        </Pressable>
      </View>
    );
  }

  if (phase.k === "awaiting" || phase.k === "starting") {
    return (
      <View className="items-center gap-3 rounded-xl border border-border bg-card p-5">
        <ActivityIndicator />
        <Text className="text-center text-sm text-muted-foreground">
          {phase.k === "awaiting" ? phase.hint : "Starting your payment…"}
        </Text>
      </View>
    );
  }

  if (phase.k === "otp") {
    return (
      <View className="gap-3 rounded-xl border border-border bg-card p-4">
        <Text className="text-sm font-semibold text-foreground">
          Enter the OTP sent to your phone
        </Text>
        <TextInput
          value={otp}
          onChangeText={setOtp}
          placeholder="123456"
          keyboardType="number-pad"
          className="rounded-lg border border-border bg-background px-3 py-2 text-foreground"
          placeholderTextColor="#999"
        />
        <Pressable
          disabled={submitOtp.isPending || otp.trim().length === 0}
          onPress={() => onSubmitOtp(phase.attemptId)}
          className={`items-center rounded-lg px-4 py-2.5 ${
            submitOtp.isPending || otp.trim().length === 0
              ? "bg-muted"
              : "bg-primary"
          }`}
        >
          {submitOtp.isPending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text className="text-sm font-semibold text-primary-foreground">
              Submit
            </Text>
          )}
        </Pressable>
      </View>
    );
  }

  // idle
  if (methods.length === 0) {
    return (
      <View className="gap-3 rounded-xl border border-border bg-card p-4">
        <Text className="text-sm text-muted-foreground">
          Add a payment method to pay for a promotion.
        </Text>
        <Pressable
          onPress={() => router.push("/(app)/wallet")}
          className="items-center rounded-lg bg-primary px-4 py-2.5"
        >
          <Text className="text-sm font-semibold text-primary-foreground">
            Add payment method
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View className="gap-3">
      <Text className="text-sm font-semibold text-foreground">Pay with</Text>
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
            <Text className="text-sm text-foreground">{methodLabel(m)}</Text>
            {selected ? (
              <Text className="text-xs font-semibold text-primary">✓</Text>
            ) : null}
          </Pressable>
        );
      })}

      <Pressable
        disabled={!chosenId || creatingAttempt}
        onPress={onPay}
        className={`items-center rounded-xl px-4 py-3 ${
          !chosenId || creatingAttempt ? "bg-muted" : "bg-primary"
        }`}
      >
        <Text
          className={`text-sm font-semibold ${
            !chosenId ? "text-muted-foreground" : "text-primary-foreground"
          }`}
        >
          Pay {currency} {amount.toFixed(2)}
        </Text>
      </Pressable>
    </View>
  );
}
