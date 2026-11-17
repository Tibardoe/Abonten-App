import { RecommendationPromptCard } from "@/components/alerts/RecommendationPromptCard";
import { AppHeader } from "@/components/app/AppHeader";
import {
  NextCheckLine,
  VerifyCountdown,
} from "@/components/checkout/PaymentWaitTimers";
import { useCancelCheckout } from "@/features/checkout/useCheckout";
import {
  type PaymentKind,
  VERIFY_WINDOW_MS,
  usePaymentVerification,
} from "@/features/checkout/usePaymentVerification";
import {
  AppText,
  Button,
  Icon,
  OtpInput,
  Spinner,
  useToast,
} from "@abonten/ui-native";
import { useTranslations } from "@abonten/ui-native/i18n";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Alert, Pressable, ScrollView, View } from "react-native";

// The one payment-status surface for every Paystack purchase. The checkout /
// promote screens only *start* the attempt, then push here — this screen owns
// "verifying / succeeded / pending / failed / finishing-up", so there is never
// a second Pay button next to a live payment and the states can't be confused.

type Params = {
  attemptId: string;
  kind: PaymentKind;
  mode: "popup" | "direct";
  authorizationUrl?: string;
  deepLink?: string;
  chargeStatus?: string;
  displayMessage?: string;
  contextTitle?: string;
  amountLabel?: string;
  successHref?: string;
  successCtaLabel?: string;
  /** Set for ticket purchases: lets the success state offer alerts. */
  eventId?: string;
  /** "1": success goes back to the screen that started the payment. */
  successBack?: string;
  /** Ticket orders: the held checkout, for "Pay another way". */
  checkoutSessionId?: string;
};

export default function PaymentVerificationScreen() {
  const t = useTranslations("wallet");

  const p = useLocalSearchParams<Params>();
  const router = useRouter();
  const [otp, setOtp] = useState("");

  const {
    state,
    checking,
    otpSubmitting,
    checkAgain,
    submitOtp,
    stopChecking,
    cooldown,
    checkedJustNow,
    weakConnection,
    verifyStartedAt,
    nextCheckAt,
    backgroundChecking,
    autoChecksOver,
  } = usePaymentVerification({
    attemptId: p.attemptId,
    kind: p.kind ?? "ticket",
    mode: p.mode === "direct" ? "direct" : "popup",
    authorizationUrl: p.authorizationUrl,
    deepLink: p.deepLink,
    chargeStatus: p.chargeStatus,
    displayMessage: p.displayMessage,
  });

  // "Check again" / "Retry": a spinner while asking, then a short rest
  // with the seconds shown, so one press is visibly one check.
  const checkLabel = (idle: string) =>
    checking
      ? t("checkingPayment")
      : cooldown > 0
        ? t("checkAgainIn", { seconds: cooldown })
        : idle;
  const checkNote = weakConnection ? (
    <View className="flex-row items-start gap-1.5">
      <Icon name="cloud-offline-outline" size={15} tone="warning" />
      <AppText variant="small" className="flex-1 text-muted-foreground">
        {t("weakConnectionWeKeepTrying")}
      </AppText>
    </View>
  ) : checkedJustNow ? (
    <AppText variant="small" className="text-center text-muted-foreground">
      {t("weJustCheckedNotConfirmedYet")}
    </AppText>
  ) : null;

  // The prompt went to the wrong number, the card was refused at the bank:
  // back to the order to pay another way. The server closes this attempt
  // when the new one starts, and money this one still takes later is
  // refunded in full (orphan capture), so say exactly that first.
  const payAnotherWay = () => {
    const sessionId = p.checkoutSessionId;
    if (!sessionId) return;
    Alert.alert(t("payAnotherWayTitle"), t("payAnotherWayBody"), [
      { text: t("keepWaiting"), style: "cancel" },
      {
        text: t("payAnotherWay"),
        onPress: () => router.dismissTo(`/(app)/checkout/${sessionId}`),
      },
    ]);
  };

  // Ticket orders can be left (we tell them the outcome later) or cancelled
  // here. Cancelling closes the payment on our side and frees the seats; a
  // prompt approved afterwards anyway is refunded in full (orphan capture),
  // which the confirmation says.
  const isOrder = p.kind === "ticket" && !!p.checkoutSessionId;
  const cancelCheckout = useCancelCheckout();
  const toast = useToast();
  const cancelOrder = () => {
    const sessionId = p.checkoutSessionId;
    if (!sessionId) return;
    Alert.alert(t("cancelOrderTitle"), t("cancelOrderBody"), [
      { text: t("keepWaiting"), style: "cancel" },
      {
        text: t("cancelOrder"),
        style: "destructive",
        onPress: async () => {
          const res = await cancelCheckout
            .mutateAsync(sessionId)
            .catch(() => null);
          if (res?.status === 200) {
            stopChecking();
            toast.success(t("orderCancelled"));
            if (p.eventId) router.dismissTo(`/(app)/event/${p.eventId}`);
            else goSuccess();
            return;
          }
          // 409: the payment is being confirmed this very second.
          toast.error(res?.message ?? t("pleaseTryAgain"));
        },
      },
    ]);
  };
  const leaveOptions = isOrder ? (
    <View className="w-full items-center gap-2">
      <Button
        title={t("checkLater")}
        variant="outline"
        fullWidth
        onPress={() => goSuccess()}
      />
      <AppText variant="small" className="text-center text-muted-foreground">
        {t("checkLaterNote")}
      </AppText>
      <Pressable
        accessibilityRole="button"
        hitSlop={8}
        disabled={cancelCheckout.isPending}
        onPress={cancelOrder}
      >
        <AppText variant="small" tone="error" className="font-medium">
          {t("cancelOrder")}
        </AppText>
      </Pressable>
    </View>
  ) : null;

  const goSuccess = () => {
    // A plan's part returns to the plan, which shows what is left.
    if (p.successBack === "1" && router.canGoBack()) {
      router.back();
      return;
    }
    const href = p.successHref || "/(app)/tickets";
    // Tickets is a pushed screen now (Spotlight took its tab), so land on it
    // straight above the tabs: Back from "My tickets" should not reopen the
    // checkout that was just paid.
    if (href.startsWith("/(app)/tickets")) {
      if (router.canDismiss()) router.dismissAll();
      router.push(href as never);
      return;
    }
    router.replace(href as never);
  };

  return (
    <View className="flex-1 bg-background">
      <AppHeader variant="title" title={t("payment")} />
      <ScrollView
        className="flex-1"
        contentContainerClassName="grow justify-center gap-6 p-6"
        keyboardShouldPersistTaps="handled"
      >
        {p.contextTitle ? (
          <View className="items-center gap-1">
            <AppText variant="caption">
              {p.kind === "ticket" || p.kind === "ticket_plan"
                ? t("order")
                : t("promotion")}
            </AppText>
            <AppText variant="sectionHeading" className="text-center">
              {p.contextTitle}
            </AppText>
            {p.amountLabel ? (
              <AppText variant="muted">{p.amountLabel}</AppText>
            ) : null}
          </View>
        ) : null}

        {state.status === "verifying" ? (
          <View className="items-center gap-4 rounded-2xl border border-border bg-card p-8">
            <Spinner />
            <AppText variant="bodyStrong" className="text-center">
              {t("verifyingYourPayment")}
            </AppText>
            <AppText variant="muted" className="text-center">
              {state.note ?? p.displayMessage ?? t("thisCanTakeAFewSeconds")}
            </AppText>
            <VerifyCountdown
              startedAt={verifyStartedAt}
              windowMs={VERIFY_WINDOW_MS}
              awaitingPhone={
                p.mode === "direct" && p.chargeStatus === "pay_offline"
              }
            />
            {weakConnection ? checkNote : null}
            {leaveOptions}
          </View>
        ) : null}

        {state.status === "otp" ? (
          <View className="gap-4 rounded-2xl border border-border bg-card p-6">
            <View className="gap-1">
              <AppText variant="bodyStrong">{t("enterTheOtp")}</AppText>
              <AppText variant="muted">{t("weSentAOneTimeCode")}</AppText>
            </View>
            <OtpInput
              value={otp}
              onChange={setOtp}
              onComplete={(v) => submitOtp(v)}
              length={6}
              disabled={otpSubmitting}
              invalid={!!state.error}
            />
            {state.error ? (
              <View className="flex-row items-center gap-1.5">
                <Icon name="alert-circle" size={15} tone="destructive" />
                <AppText variant="small" tone="error">
                  {state.error}
                </AppText>
              </View>
            ) : null}
            <Button
              title={t("submitCode")}
              fullWidth
              loading={otpSubmitting}
              disabled={otpSubmitting || otp.trim().length < 6}
              onPress={() => submitOtp(otp)}
            />
          </View>
        ) : null}

        {state.status === "succeeded" ? (
          <View className="items-center gap-4 rounded-2xl border border-border bg-card p-8">
            <Icon name="checkmark-circle" size={56} tone="success" />
            <AppText variant="sectionHeading" className="text-center">
              {t("paymentSuccessful")}
            </AppText>
            <AppText variant="muted" className="text-center">
              {p.kind === "ticket"
                ? t("yourTicketIsConfirmedAndReady")
                : p.kind === "ticket_plan"
                  ? t("yourPaymentWasAddedToYourPlan")
                  : p.kind === "spotlight_promotion"
                    ? t("yourPromotionIsWaitingForReview")
                    : t("yourListingIsNowFeatured")}
            </AppText>
            <Button
              title={p.successCtaLabel ?? t("viewMyTickets")}
              fullWidth
              onPress={goSuccess}
            />
          </View>
        ) : null}

        {state.status === "succeeded" && p.kind === "ticket" && p.eventId ? (
          <RecommendationPromptCard
            context={{ context: "purchase", eventId: p.eventId }}
          />
        ) : null}

        {state.status === "pending" ? (
          <View className="items-center gap-4 rounded-2xl border border-border bg-card p-8">
            <Icon name="time-outline" size={52} tone="warning" />
            <AppText variant="sectionHeading" className="text-center">
              {t("stillConfirming")}
            </AppText>
            <AppText variant="muted" className="text-center">
              {state.note}
            </AppText>
            <AppText
              variant="small"
              className="text-center text-muted-foreground"
            >
              {t("ifYouApprovedItWeConfirmIt")}
            </AppText>
            {checkNote}
            <NextCheckLine
              nextCheckAt={nextCheckAt}
              checking={backgroundChecking && !checking}
              over={autoChecksOver}
              ticket={p.kind === "ticket"}
            />
            <Button
              title={checkLabel(t("checkAgain"))}
              fullWidth
              loading={checking}
              disabled={checking || cooldown > 0}
              onPress={checkAgain}
            />
            {p.kind === "ticket" && p.checkoutSessionId ? (
              <Button
                title={t("payAnotherWay")}
                variant="outline"
                fullWidth
                onPress={payAnotherWay}
              />
            ) : null}
            {isOrder ? (
              leaveOptions
            ) : (
              <Button
                title={p.kind === "ticket" ? t("goToTickets") : t("goBack")}
                variant="outline"
                fullWidth
                onPress={goSuccess}
              />
            )}
          </View>
        ) : null}

        {state.status === "fulfillmentFailed" ? (
          <View className="items-center gap-4 rounded-2xl border border-border bg-card p-8">
            <Icon name="hourglass-outline" size={48} tone="warning" />
            <AppText variant="sectionHeading" className="text-center">
              {t("paymentReceivedFinishingUp")}
            </AppText>
            <AppText variant="muted" className="text-center">
              {state.message}
            </AppText>
            {checkNote}
            <Button
              title={checkLabel(t("retry"))}
              fullWidth
              loading={checking}
              disabled={checking || cooldown > 0}
              onPress={checkAgain}
            />
          </View>
        ) : null}

        {state.status === "failed" ? (
          <View className="items-center gap-4 rounded-2xl border border-destructive/40 bg-destructive/10 p-8">
            <Icon name="close-circle" size={52} tone="destructive" />
            <AppText variant="sectionHeading" className="text-center">
              {t("paymentNotCompleted")}
            </AppText>
            <AppText variant="muted" className="text-center">
              {state.message}
            </AppText>
            <Button
              title={t("backToCheckout")}
              fullWidth
              onPress={() => router.back()}
            />
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}
