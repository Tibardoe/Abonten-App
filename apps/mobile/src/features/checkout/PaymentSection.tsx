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
import {
  useCreateAttempt,
  useSubmitChargeOtp,
  useVerifyPayment,
} from "./usePayment";

type Phase =
  | { k: "idle" }
  | { k: "starting" }
  | { k: "awaiting"; attemptId: string; hint: string }
  | { k: "otp"; attemptId: string }
  | { k: "succeeded" }
  | { k: "failed"; message: string };

const POLL_MS = 4000;
const MAX_POLLS = 20;

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
}: {
  sessionId: string;
  currency: string;
  total: number;
}) {
  const router = useRouter();
  const { data: methodsRes } = usePaymentMethods();
  const methods = methodsRes?.status === 200 ? (methodsRes.data ?? []) : [];

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>({ k: "idle" });
  const [otp, setOtp] = useState("");
  const pollsRef = useRef(0);

  const createAttempt = useCreateAttempt();
  const verify = useVerifyPayment();
  const submitOtp = useSubmitChargeOtp();

  const chosenId = selectedId ?? methods.find((m) => m.is_default)?.id ?? null;

  const pollVerify = useCallback(
    async (attemptId: string) => {
      const res = await verify.mutateAsync(attemptId);
      if (res.status === 200) {
        setPhase({ k: "succeeded" });
        return;
      }
      if (res.status === 207) {
        setPhase({
          k: "failed",
          message:
            "Payment went through but we couldn't issue your ticket. Contact support with your reference.",
        });
        return;
      }
      if (res.status === 400) {
        setPhase({ k: "failed", message: res.message ?? "Payment failed." });
        return;
      }
      // 202 / transient — keep polling until the cap
      pollsRef.current += 1;
      if (pollsRef.current >= MAX_POLLS) {
        setPhase({
          k: "failed",
          message:
            "Still waiting for confirmation. Check your tickets in a minute — if it went through, it'll appear there.",
        });
      }
    },
    [verify],
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

    const res = await createAttempt.mutateAsync({
      checkoutSessionIds: [sessionId],
      paymentMethodId: chosenId,
    });

    if (res.status !== 200) {
      setPhase({
        k: "failed",
        message:
          res.status === 409
            ? "This checkout expired. Go back and start again."
            : (res.message ?? "Couldn't start the payment."),
      });
      return;
    }

    const attemptId = res.data.attempts[0]?.id;
    const ps = res.data.paystack;

    if (!attemptId) {
      setPhase({ k: "failed", message: "Couldn't start the payment." });
      return;
    }

    if (ps.mode === "popup") {
      await WebBrowser.openAuthSessionAsync(
        ps.authorizationUrl,
        `abonten://checkout/${sessionId}`,
      );
      setPhase({
        k: "awaiting",
        attemptId,
        hint: "Confirming your payment…",
      });
      void pollVerify(attemptId);
      return;
    }

    // direct charge
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
      // stay on the OTP screen, surface the message
      setPhase({ k: "otp", attemptId });
      return;
    }
    setOtp("");
    setPhase({ k: "awaiting", attemptId, hint: "Confirming your payment…" });
    void pollVerify(attemptId);
  }

  if (phase.k === "succeeded") {
    return (
      <View className="items-center gap-3 rounded-xl border border-border bg-card p-5">
        <Text className="text-base font-bold text-success">
          Payment complete
        </Text>
        <Pressable
          onPress={() => router.replace("/(app)/transactions")}
          className="rounded-lg bg-primary px-4 py-2.5"
        >
          <Text className="text-sm font-semibold text-primary-foreground">
            View my tickets
          </Text>
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
          Add a mobile money wallet to pay.
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
        disabled={!chosenId || createAttempt.isPending}
        onPress={onPay}
        className={`items-center rounded-xl px-4 py-3 ${
          !chosenId || createAttempt.isPending ? "bg-muted" : "bg-primary"
        }`}
      >
        <Text
          className={`text-sm font-semibold ${
            !chosenId ? "text-muted-foreground" : "text-primary-foreground"
          }`}
        >
          Pay {currency} {total}
        </Text>
      </Pressable>
    </View>
  );
}
