import { CreditSwitch } from "@/features/rewards/CreditSwitch";
import { useInvalidateCredit } from "@/features/rewards/useRewards";
import { usePaymentMethods } from "@/features/wallet/usePaymentMethods";
import type { PaymentMethodRow } from "@abonten/api-client";
import { formatMoney } from "@abonten/core/formatMoney";
import { formatCredit } from "@abonten/core/rewards/creditAmount";
import type { CreditQuote } from "@abonten/types/rewards";
import { AppText } from "@abonten/ui-native";
import { useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import { useCreateAttempt } from "./usePayment";

// Method picker + "Pay". Once the attempt is created this hands off to
// <PaymentVerificationScreen> (app/(app)/payment/[attemptId]) — this component
// never shows payment status, so there's no second Pay button beside a live
// payment. api.checkout.attempt is idempotent server-side (an open attempt is
// reused, a failed one is replaced), so re-tapping "Pay" is safe. With
// Abonten Credit (quoted by the prepare step) a "Use credit" switch applies
// it; if it covers everything, there's nothing to pick and the same
// verification screen confirms the already-finalized order.

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
  creditQuote,
  onCreditRefused,
}: {
  sessionId: string;
  currency: string;
  total: number;
  eventTitle?: string;
  /** From the prepare step; null when Rewards is off or there's no credit. */
  creditQuote?: CreditQuote | null;
  /** The quote went stale (balance changed, checkout lapsed): refetch it. */
  onCreditRefused?: () => void;
}) {
  const router = useRouter();
  const { data: methodsRes } = usePaymentMethods();
  const methods = methodsRes?.status === 200 ? (methodsRes.data ?? []) : [];

  const quote =
    creditQuote?.offered && creditQuote.creditMinor > 0 ? creditQuote : null;
  const invalidateCredit = useInvalidateCredit();
  const [useCreditChoice, setUseCreditChoice] = useState<boolean | null>(null);
  const useCredit = !!quote && (useCreditChoice ?? true);
  const creditCoversAll = useCredit && !!quote?.creditOnly;
  const payAmount = useCredit && quote ? quote.cashMinor / 100 : total;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const createAttempt = useCreateAttempt();

  const chosenId = selectedId ?? methods.find((m) => m.is_default)?.id ?? null;
  const canPay = creditCoversAll || !!chosenId;

  async function onPay() {
    if (!canPay || createAttempt.isPending) return;
    setError(null);

    const res = await createAttempt.mutateAsync({
      checkoutSessionIds: [sessionId],
      paymentMethodId: creditCoversAll ? null : chosenId,
      useCredit,
    });

    if (res.status !== 200) {
      const expired = res.status === 409 && res.invalidSessionIds.length > 0;
      setError(
        expired
          ? "This checkout expired. Go back and start again."
          : (res.message ?? "Couldn't start the payment."),
      );
      if (res.status === 409 && !expired) onCreditRefused?.();
      return;
    }

    const attemptId = res.data.attempts[0]?.id;
    if (!attemptId) {
      setError("Couldn't start the payment.");
      return;
    }
    const ps = res.data.paystack;
    const verification = res.data.verification;
    if (useCredit) invalidateCredit();

    // A credit-only order that was refused (e.g. the checkout lapsed) has
    // nothing to wait for: say so here instead of on a status screen.
    if (
      ps === null &&
      verification &&
      verification.status !== 200 &&
      verification.status !== 202 &&
      verification.status !== 207
    ) {
      setError(verification.message ?? "Couldn't complete the payment.");
      onCreditRefused?.();
      return;
    }

    router.push({
      pathname: "/(app)/payment/[attemptId]",
      params: {
        attemptId,
        kind: "ticket",
        // Credit-only: already finalized server-side, so the verification
        // screen confirms it on its first check.
        mode: ps ? ps.mode : "direct",
        deepLink: `abonten://checkout/${sessionId}`,
        contextTitle: eventTitle ?? "Your order",
        amountLabel: ps
          ? formatMoney(currency, payAmount)
          : `Paid with ${formatCredit(res.data.credit?.appliedMinor ?? 0)} credit`,
        successHref: "/(app)/(tabs)/tickets",
        successCtaLabel: "View my tickets",
        ...(ps === null
          ? {
              chargeStatus: "success",
              displayMessage: "Confirming your credit payment…",
            }
          : ps.mode === "popup"
            ? { authorizationUrl: ps.authorizationUrl }
            : {
                chargeStatus: ps.chargeStatus,
                displayMessage: ps.displayMessage,
              }),
      },
    });
  }

  const creditSwitch = quote ? (
    <CreditSwitch
      quote={quote}
      value={useCredit}
      onChange={setUseCreditChoice}
      disabled={createAttempt.isPending}
    />
  ) : null;

  const errorBox = error ? (
    <View className="rounded-lg border border-destructive/40 bg-destructive/10 p-3">
      <AppText className="text-sm text-destructive">{error}</AppText>
    </View>
  ) : null;

  if (creditCoversAll) {
    return (
      <View className="gap-3">
        {creditSwitch}
        {errorBox}
        <Pressable
          disabled={createAttempt.isPending}
          onPress={onPay}
          className={`items-center rounded-xl px-4 py-3 ${
            createAttempt.isPending ? "bg-muted" : "bg-primary"
          }`}
        >
          {createAttempt.isPending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <AppText className="text-sm font-semibold text-primary-foreground">
              Confirm and pay with credit
            </AppText>
          )}
        </Pressable>
      </View>
    );
  }

  if (methods.length === 0) {
    return (
      <View className="gap-3 rounded-xl border border-border bg-card p-4">
        {creditSwitch}
        <AppText className="text-sm text-muted-foreground">
          {useCredit
            ? "Add a mobile money wallet or card to pay the rest."
            : "Add a mobile money wallet or card to pay."}
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
      {creditSwitch}
      <AppText className="text-sm font-semibold text-foreground">
        {useCredit ? "Pay the rest with" : "Pay with"}
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

      {errorBox}

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
            Pay {formatMoney(currency, payAmount)}
          </AppText>
        )}
      </Pressable>
    </View>
  );
}
