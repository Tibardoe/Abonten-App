import {
  EmailRequiredCard,
  useNeedsEmailToPay,
} from "@/components/account/EmailRequiredCard";
import { CreditSwitch } from "@/features/rewards/CreditSwitch";
import { useInvalidateCredit } from "@/features/rewards/useRewards";
import { formatMoney } from "@abonten/core/formatMoney";
import {
  creditMinorToMajor,
  formatCredit,
} from "@abonten/core/rewards/creditAmount";
import type { CreditQuote } from "@abonten/types/rewards";
import { AppText, BottomBar, Button } from "@abonten/ui-native";
import { useTranslations } from "@abonten/ui-native/i18n";
import { useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { useCreateAttempt } from "./usePayment";
import { PaymentChoiceList, usePaymentChoice } from "./usePaymentChoice";

// Method picker + "Pay", in three parts so the Pay button can sit in the
// screen's sticky bottom bar (like Buy on the event screen) while the picker
// scrolls: useTicketPayment() holds the state and starts the attempt,
// <PaymentSection> is the picker (inside the ScrollView), <PayBar> the Pay
// button (in the column under it). Once the attempt is created this hands
// off to <PaymentVerificationScreen> (app/(app)/payment/[attemptId]) — this
// never shows payment status, so there's no second Pay button beside a live
// payment. api.checkout.attempt is idempotent server-side (an open attempt is
// reused, a failed one is replaced), so re-tapping "Pay" is safe. With
// Abonten Credit (quoted by the prepare step) a "Use credit" switch applies
// it; if it covers everything, there's nothing to pick and the same
// verification screen confirms the already-finalized order.

export function useTicketPayment({
  sessionId,
  currency,
  total,
  eventTitle,
  eventId,
  creditQuote,
  onCreditRefused,
}: {
  sessionId: string;
  /** For the opt-in prompt on the success screen. */
  eventId?: string;
  currency: string;
  total: number;
  eventTitle?: string;
  /** From the prepare step; null when Rewards is off or there's no credit. */
  creditQuote?: CreditQuote | null;
  /** The quote went stale (balance changed, checkout lapsed): refetch it. */
  onCreditRefused?: () => void;
}) {
  const t = useTranslations("checkout");

  const router = useRouter();
  const needsEmail = useNeedsEmailToPay();
  const payment = usePaymentChoice({
    kind: "ticket",
    checkoutSessionIds: [sessionId],
  });

  const quote =
    creditQuote?.offered && creditQuote.creditMinor > 0 ? creditQuote : null;
  const invalidateCredit = useInvalidateCredit();
  const [useCreditChoice, setUseCreditChoice] = useState<boolean | null>(null);
  const useCredit = !!quote && (useCreditChoice ?? true);
  const creditCoversAll = useCredit && !!quote?.creditOnly;
  const payAmount =
    useCredit && quote
      ? creditMinorToMajor(quote.cashMinor, quote.currency)
      : total;

  const [error, setError] = useState<string | null>(null);
  const createAttempt = useCreateAttempt();

  const chosen = payment.choice;
  // No email on the account (a phone sign-up): every payment is refused
  // without one, so the picker asks for it and Pay waits.
  const canPay = !needsEmail && (creditCoversAll || !!chosen);

  async function onPay() {
    if (!canPay || createAttempt.isPending) return;
    setError(null);

    const res = await createAttempt.mutateAsync({
      checkoutSessionIds: [sessionId],
      paymentMethodId: creditCoversAll
        ? null
        : (chosen?.paymentMethodId ?? null),
      method: creditCoversAll ? null : (chosen?.method ?? null),
      useCredit,
    });

    if (res.status !== 200) {
      const expired = res.status === 409 && res.invalidSessionIds.length > 0;
      setError(
        expired
          ? t("thisCheckoutExpiredGoBackAnd")
          : (res.message ?? t("couldnTStartThePayment")),
      );
      if (res.status === 409 && !expired) onCreditRefused?.();
      return;
    }

    const attemptId = res.data.attempts[0]?.id;
    if (!attemptId) {
      setError(t("couldnTStartThePayment"));
      return;
    }
    const ps = res.data.payment;
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
      setError(verification.message ?? t("couldnTCompleteThePayment"));
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
        ...(eventId ? { eventId } : {}),
        amountLabel: ps
          ? formatMoney(currency, payAmount)
          : `Paid with ${formatCredit(res.data.credit?.appliedMinor ?? 0, currency)} credit`,
        successHref: "/(app)/tickets",
        successCtaLabel: "View my tickets",
        ...(ps === null
          ? {
              chargeStatus: "success",
              displayMessage: "Confirming your credit payment…",
            }
          : ps.mode === "popup"
            ? { authorizationUrl: ps.authorizationUrl }
            : ps.mode === "redirect"
              ? { authorizationUrl: ps.url }
              : {
                  chargeStatus: ps.chargeStatus,
                  displayMessage: ps.displayMessage,
                }),
      },
    });
  }

  return {
    currency,
    total,
    quote,
    useCredit,
    setUseCreditChoice,
    creditCoversAll,
    payAmount,
    needsEmail,
    payment,
    canPay,
    pending: createAttempt.isPending,
    error,
    onPay,
  };
}

export type TicketPayment = ReturnType<typeof useTicketPayment>;

// With no wallet yet the list still offers "Add a wallet" (added in place
// and selected) and the ways to pay once, so there is no separate empty card.
export function PaymentSection({ state }: { state: TicketPayment }) {
  const t = useTranslations("checkout");

  if (state.needsEmail) {
    return <EmailRequiredCard purpose="tickets" />;
  }

  const creditSwitch = state.quote ? (
    <CreditSwitch
      quote={state.quote}
      value={state.useCredit}
      onChange={state.setUseCreditChoice}
      disabled={state.pending}
    />
  ) : null;

  if (state.creditCoversAll) return creditSwitch;

  return (
    <View className="gap-3">
      {creditSwitch}
      <AppText className="text-sm font-semibold text-foreground">
        {state.useCredit ? t("payTheRestWith") : t("payWith")}
      </AppText>
      <PaymentChoiceList state={state.payment} />
    </View>
  );
}

// The sticky footer: what will be charged on the left, Pay on the right —
// the event screen's Buy bar. A failed start shows its reason just above
// the button, where the tap was, not up in the scrolled picker. While the
// picker still needs something (an email, a way to pay) Pay stays disabled
// and the picker's own "Add email" / "Add a wallet" is the way forward.
export function PayBar({ state }: { state: TicketPayment }) {
  const t = useTranslations("checkout");

  const { quote, creditCoversAll } = state;

  const caption = creditCoversAll
    ? t("paidWithCredit")
    : state.useCredit
      ? t("toPayAfterCredit")
      : t("total");
  const amount =
    creditCoversAll && quote
      ? formatCredit(quote.creditMinor, quote.currency)
      : formatMoney(state.currency, state.payAmount);

  return (
    <BottomBar>
      {state.error ? (
        <View className="mb-3 rounded-lg border border-destructive/40 bg-destructive/10 p-3">
          <AppText className="text-sm text-destructive">{state.error}</AppText>
        </View>
      ) : null}
      <View className="flex-row items-center gap-3">
        <View className="flex-1">
          <AppText variant="caption" numberOfLines={1}>
            {caption}
          </AppText>
          <AppText variant="cardTitle" numberOfLines={1}>
            {amount}
          </AppText>
        </View>
        <Button
          title={creditCoversAll ? t("payWithCredit") : t("payNow")}
          disabled={!state.canPay}
          loading={state.pending}
          onPress={state.onPay}
          accessibilityHint={
            state.needsEmail
              ? t("addYourEmailAboveToPay")
              : !state.canPay
                ? t("chooseAWayToPayAbove")
                : t("startsThePayment")
          }
        />
      </View>
    </BottomBar>
  );
}
