import { AppHeader } from "@/components/app/AppHeader";
import {
  type PaymentKind,
  usePaymentVerification,
} from "@/features/checkout/usePaymentVerification";
import { AppText, Button, Icon, OtpInput, Spinner } from "@abonten/ui-native";
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
};

export default function PaymentVerificationScreen() {
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
    router.replace(p.successHref || "/(app)/(tabs)/tickets");
  };

  return (
    <View className="flex-1 bg-background">
      <AppHeader variant="title" title="Payment" />
      <ScrollView
        className="flex-1"
        contentContainerClassName="grow justify-center gap-6 p-6"
        keyboardShouldPersistTaps="handled"
      >
        {p.contextTitle ? (
          <View className="items-center gap-1">
            <AppText variant="caption">
              {p.kind === "ticket" ? "Order" : "Promotion"}
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
              Verifying your payment
            </AppText>
            <AppText variant="muted" className="text-center">
              {state.note ??
                p.displayMessage ??
                "This can take a few seconds — please don't close the app."}
            </AppText>
          </View>
        ) : null}

        {state.status === "otp" ? (
          <View className="gap-4 rounded-2xl border border-border bg-card p-6">
            <View className="gap-1">
              <AppText variant="bodyStrong">Enter the OTP</AppText>
              <AppText variant="muted">
                We sent a one-time code to your phone to approve this payment.
              </AppText>
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
              title="Submit code"
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
              Payment successful
            </AppText>
            <AppText variant="muted" className="text-center">
              {p.kind === "ticket"
                ? "Your ticket is confirmed and ready in Tickets."
                : "Your listing is now featured."}
            </AppText>
            <Button
              title={p.successCtaLabel ?? "View my tickets"}
              fullWidth
              onPress={goSuccess}
            />
          </View>
        ) : null}

        {state.status === "pending" ? (
          <View className="items-center gap-4 rounded-2xl border border-border bg-card p-8">
            <Icon name="time-outline" size={52} tone="warning" />
            <AppText variant="sectionHeading" className="text-center">
              Still confirming
            </AppText>
            <AppText variant="muted" className="text-center">
              {state.note}
            </AppText>
            <Button
              title="Check again"
              fullWidth
              loading={checking}
              disabled={checking}
              onPress={checkAgain}
            />
            <Button
              title={p.kind === "ticket" ? "Go to Tickets" : "Go back"}
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
              Payment received — finishing up
            </AppText>
            <AppText variant="muted" className="text-center">
              {state.message}
            </AppText>
            <Button
              title="Retry"
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
              Payment not completed
            </AppText>
            <AppText variant="muted" className="text-center">
              {state.message}
            </AppText>
            <Button
              title="Back to checkout"
              fullWidth
              onPress={() => router.back()}
            />
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}
