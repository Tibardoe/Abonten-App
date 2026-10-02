import { RecommendationPromptCard } from "@/components/alerts/RecommendationPromptCard";
import { AppHeader } from "@/components/app/AppHeader";
import {
  type PaymentKind,
  usePaymentVerification,
} from "@/features/checkout/usePaymentVerification";
import { AppText, Button, Icon, OtpInput, Spinner } from "@abonten/ui-native";
import { useTranslations } from "@abonten/ui-native/i18n";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { ScrollView, View } from "react-native";

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
};

export default function PaymentVerificationScreen() {
  const t = useTranslations("wallet");

  const p = useLocalSearchParams<Params>();
  const router = useRouter();
  const [otp, setOtp] = useState("");

  const { state, checking, otpSubmitting, checkAgain, submitOtp } =
    usePaymentVerification({
      attemptId: p.attemptId,
      kind: p.kind ?? "ticket",
      mode: p.mode === "direct" ? "direct" : "popup",
      authorizationUrl: p.authorizationUrl,
      deepLink: p.deepLink,
      chargeStatus: p.chargeStatus,
      displayMessage: p.displayMessage,
    });

  const goSuccess = () => {
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
              {p.kind === "ticket" ? t("order") : t("promotion")}
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
            <Button
              title={t("checkAgain")}
              fullWidth
              loading={checking}
              disabled={checking}
              onPress={checkAgain}
            />
            <Button
              title={p.kind === "ticket" ? t("goToTickets") : t("goBack")}
              variant="outline"
              fullWidth
              onPress={goSuccess}
            />
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
            <Button
              title={t("retry")}
              fullWidth
              loading={checking}
              disabled={checking}
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
