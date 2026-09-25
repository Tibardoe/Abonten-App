import {
  EmailRequiredCard,
  useNeedsEmailToPay,
} from "@/components/account/EmailRequiredCard";
import { useCreatePromotionAttempt } from "@/features/organizer/useEventPromotion";
import { useCreatePlacePromotionAttempt } from "@/features/organizer/usePlacePromotion";
import { CreditSwitch } from "@/features/rewards/CreditSwitch";
import {
  useInvalidateCredit,
  usePromotionCreditQuote,
} from "@/features/rewards/useRewards";
import { usePaymentMethods } from "@/features/wallet/usePaymentMethods";
import { api } from "@/lib/api";
import type { PaymentMethodRow } from "@abonten/api-client";
import { formatMoney } from "@abonten/core/formatMoney";
import {
  creditMinorToMajor,
  formatCredit,
} from "@abonten/core/rewards/creditAmount";
import { AppText } from "@abonten/ui-native";
import { useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";

// Method picker + "Pay" for a promotion checkout. Like the ticket
// PaymentSection, it starts the attempt then hands off to
// <PaymentVerificationScreen>; it never renders payment status itself. When
// the user has Abonten Credit, a "Use credit" switch (on by default) applies
// the server-quoted amount; if it covers everything there's nothing to pick
// and the same verification screen simply confirms the result.

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
  /** "spotlight" is a promoted Spotlight campaign: cash only, and on
   *  success it waits for review instead of going live. */
  kind?: "event" | "place" | "spotlight";
}) {
  const router = useRouter();
  const needsEmail = useNeedsEmailToPay();
  const { data: methodsRes } = usePaymentMethods();
  const methods = methodsRes?.status === 200 ? (methodsRes.data ?? []) : [];

  // Credit can't be used for Spotlight promotions, so there is no quote.
  const { data: quote, refetch: refetchQuote } = usePromotionCreditQuote(
    kind,
    kind === "spotlight" ? null : checkoutId,
  );
  const invalidateCredit = useInvalidateCredit();
  const [useCreditChoice, setUseCreditChoice] = useState<boolean | null>(null);
  const useCredit = !!quote && (useCreditChoice ?? true);
  const creditCoversAll = useCredit && !!quote?.creditOnly;
  const payAmount =
    useCredit && quote
      ? creditMinorToMajor(quote.cashMinor, quote.currency)
      : amount;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const createEventAttempt = useCreatePromotionAttempt();
  const createPlaceAttempt = useCreatePlacePromotionAttempt();
  const [creatingSpotlight, setCreatingSpotlight] = useState(false);
  const creatingAttempt =
    createEventAttempt.isPending ||
    createPlaceAttempt.isPending ||
    creatingSpotlight;

  const chosenId = selectedId ?? methods.find((m) => m.is_default)?.id ?? null;
  const canPay = creditCoversAll || !!chosenId;

  async function onPay() {
    if (!canPay || creatingAttempt) return;
    setError(null);

    const paymentMethodId = creditCoversAll ? null : chosenId;
    let res: Awaited<ReturnType<typeof api.checkout.promotionAttempt>>;
    if (kind === "spotlight") {
      setCreatingSpotlight(true);
      try {
        res = await api.checkout.spotlightPromotionAttempt({
          contentCampaignCheckoutId: checkoutId,
          paymentMethodId,
        });
      } catch {
        setError("Couldn't start the payment. Check your connection.");
        return;
      } finally {
        setCreatingSpotlight(false);
      }
    } else
      res =
        kind === "place"
          ? await createPlaceAttempt.mutateAsync({
              placePromotionCheckoutId: checkoutId,
              paymentMethodId,
              useCredit,
            })
          : await createEventAttempt.mutateAsync({
              eventPromotionCheckoutId: checkoutId,
              paymentMethodId,
              useCredit,
            });

    if (res.status !== 200) {
      setError(
        res.status === 410
          ? "This checkout expired. Go back and start again."
          : (res.message ?? "Couldn't start the payment."),
      );
      if (res.status === 409) refetchQuote();
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
      setError(verification.message ?? "Couldn't complete the payment.");
      refetchQuote();
      return;
    }

    // Let the promote screen refresh its own promotion context on the way out.
    onFeatured();

    const attemptId = res.data.attempt.id;
    const successHref =
      kind === "spotlight"
        ? `/(app)/spotlight/campaign/${entityId}`
        : kind === "place"
          ? `/(app)/organizer/places/${entityId}`
          : `/(app)/organizer/events/${entityId}`;

    router.push({
      pathname: "/(app)/payment/[attemptId]",
      params: {
        attemptId,
        kind:
          kind === "spotlight"
            ? "spotlight_promotion"
            : kind === "place"
              ? "place_promotion"
              : "event_promotion",
        // Credit-only: already finalized server-side, so the verification
        // screen confirms it on its first check instead of waiting on a
        // charge.
        mode: ps ? ps.mode : "direct",
        deepLink: `abonten://promotion/${checkoutId}`,
        contextTitle:
          kind === "spotlight"
            ? "Promote your Spotlight"
            : `Feature this ${kind}`,
        amountLabel: ps
          ? formatMoney(currency, payAmount)
          : `Paid with ${formatCredit(res.data.credit?.appliedMinor ?? 0, currency)} credit`,
        successHref,
        successCtaLabel:
          kind === "spotlight" ? "View promotion" : `View ${kind}`,
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

  const payButton = (
    <Pressable
      accessibilityRole="button"
      disabled={!canPay || creatingAttempt}
      onPress={onPay}
      className={`items-center rounded-xl px-4 py-3 ${
        !canPay || creatingAttempt ? "bg-muted" : "bg-primary"
      }`}
    >
      {creatingAttempt ? (
        <ActivityIndicator color="#fff" />
      ) : (
        <AppText
          className={`text-sm font-semibold ${
            !canPay ? "text-muted-foreground" : "text-primary-foreground"
          }`}
        >
          {creditCoversAll
            ? "Confirm and pay with credit"
            : `Pay ${formatMoney(currency, payAmount)}`}
        </AppText>
      )}
    </Pressable>
  );

  const errorBox = error ? (
    <View className="rounded-lg border border-destructive/40 bg-destructive/10 p-3">
      <AppText className="text-sm text-destructive">{error}</AppText>
    </View>
  ) : null;

  const creditSwitch = quote ? (
    <CreditSwitch
      quote={quote}
      value={useCredit}
      onChange={setUseCreditChoice}
      disabled={creatingAttempt}
    />
  ) : null;

  // No email on the account (a phone sign-up): every payment is refused
  // without one, so ask for it here instead of failing on "Pay".
  if (needsEmail) {
    return <EmailRequiredCard purpose="promotion" />;
  }

  if (creditCoversAll) {
    return (
      <View className="gap-3">
        {creditSwitch}
        {errorBox}
        {payButton}
      </View>
    );
  }

  if (methods.length === 0) {
    return (
      <View className="gap-3">
        {creditSwitch}
        <View className="gap-3 rounded-xl border border-border bg-card p-4">
          <AppText className="text-sm text-muted-foreground">
            Add a payment method to pay for a promotion.
          </AppText>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push("/(app)/wallet")}
            className="items-center rounded-lg bg-primary px-4 py-2.5"
          >
            <AppText className="text-sm font-semibold text-primary-foreground">
              Add payment method
            </AppText>
          </Pressable>
        </View>
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
            accessibilityRole="button"
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
      {payButton}
    </View>
  );
}
