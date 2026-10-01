import { AppHeader } from "@/components/app/AppHeader";
import { QueryUnavailable } from "@/components/app/QueryUnavailable";
import {
  PayBar,
  PaymentSection,
  useTicketPayment,
} from "@/features/checkout/PaymentSection";
import {
  useCancelCheckout,
  useCheckoutPrepare,
  useCheckoutSession,
} from "@/features/checkout/useCheckout";
import {
  formatCountdown,
  useCheckoutCountdown,
} from "@/features/checkout/useCheckoutCountdown";
import { useQueryView } from "@/lib/useQueryView";
import type { PreparedCheckoutSession } from "@abonten/api-client";
import { formatMoney } from "@abonten/core/formatMoney";
import type { CreditQuote } from "@abonten/types/rewards";
import { AppText, useToast } from "@abonten/ui-native";
import { useTranslations } from "@abonten/ui-native/i18n";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";

function CheckoutExpiryBanner({
  expiresAt,
  onExpired,
}: {
  expiresAt: string | null;
  onExpired: () => void;
}) {
  const t = useTranslations("checkout");

  const { secondsLeft, isExpired, isWarning } = useCheckoutCountdown(expiresAt);
  const firedRef = useRef(false);

  useEffect(() => {
    if (isExpired && !firedRef.current) {
      firedRef.current = true;
      onExpired();
    }
  }, [isExpired, onExpired]);

  if (secondsLeft === null) return null;

  const tone = isExpired || isWarning ? "destructive" : "muted";
  return (
    <View
      className={`rounded-md border px-4 py-3 ${
        tone === "destructive"
          ? "border-destructive/40 bg-destructive/10"
          : "border-border bg-muted"
      }`}
    >
      <AppText
        className={`text-center text-sm font-medium ${
          tone === "destructive" ? "text-destructive" : "text-muted-foreground"
        }`}
      >
        {isExpired
          ? t("thisCheckoutHasExpired")
          : t("checkoutExpiresIn", {
              formatCountdown: formatCountdown(secondsLeft),
            })}
      </AppText>
    </View>
  );
}

function Line({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <View className="flex-row items-center justify-between">
      <AppText
        className={
          strong
            ? "text-sm font-semibold text-foreground"
            : "text-sm text-muted-foreground"
        }
      >
        {label}
      </AppText>
      <AppText
        className={
          strong
            ? "text-sm font-semibold text-foreground"
            : "text-sm text-foreground"
        }
      >
        {value}
      </AppText>
    </View>
  );
}

export default function CheckoutReviewScreen() {
  const t = useTranslations("checkout");

  const toast = useToast();
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const router = useRouter();
  const prepareQuery = useCheckoutPrepare(sessionId);
  const { data, refetch } = prepareQuery;
  // Loading, offline and failed are told apart from the server's own
  // answer about this checkout (expired, already paid…), which keeps its
  // message below.
  const prepareView = useQueryView(prepareQuery);
  const sessionQuery = useCheckoutSession(sessionId);
  const cancel = useCancelCheckout();

  // The first line item's expires_at speaks for the session (all rows share
  // one deadline). getSession self-heals stale rows server-side.
  const rows = (sessionQuery.data?.data ?? []) as { expires_at?: string }[];
  const expiresAt = rows[0]?.expires_at ?? null;

  // A definite answer from the server (a transient failure throws in the
  // hook, so any non-200 envelope here is one) keeps its own message.
  const definiteFailure = data !== undefined && data.status !== 200;
  if (
    !definiteFailure &&
    prepareView.kind !== "content" &&
    prepareView.kind !== "empty"
  ) {
    return (
      <View className="flex-1 bg-background">
        <QueryUnavailable
          view={prepareView}
          subject="this checkout"
          onRetry={() => refetch()}
          loading={
            <View className="flex-1 items-center justify-center">
              <ActivityIndicator />
            </View>
          }
        />
      </View>
    );
  }

  if (!data || data.status !== 200 || !data.data) {
    return (
      <View className="flex-1 items-center justify-center gap-3 bg-background px-6">
        <AppText className="text-center text-muted-foreground">
          {data?.message ?? t("thisCheckoutCouldNotBeLoaded")}
        </AppText>
        <Pressable
          accessibilityRole="button"
          className="rounded-lg bg-primary px-4 py-2 active:opacity-90"
          onPress={() => refetch()}
        >
          <AppText className="font-semibold text-primary-foreground">
            {t("retry")}
          </AppText>
        </Pressable>
      </View>
    );
  }

  const { validSessions, invalidSessionIds, grandTotal, currency, credit } =
    data.data;
  const expired = invalidSessionIds.includes(sessionId ?? "");
  const session = validSessions.find((s) => s.checkoutSessionId === sessionId);

  async function onCancel() {
    const res = await cancel.mutateAsync(sessionId ?? "");
    if (res.status === 200) {
      router.back();
      return;
    }
    toast.error(t("couldnTCancel"), {
      description: res.message ?? t("pleaseTryAgain"),
    });
  }

  if (expired || !session) {
    return (
      <View className="flex-1 items-center justify-center gap-3 bg-background px-6">
        <AppText className="text-center text-muted-foreground">
          {t("thisCheckoutHasExpiredAndThe")}
        </AppText>
        <Pressable
          accessibilityRole="button"
          className="rounded-lg bg-primary px-4 py-2 active:opacity-90"
          onPress={() => router.back()}
        >
          <AppText className="font-semibold text-primary-foreground">
            {t("chooseTicketsAgain")}
          </AppText>
        </Pressable>
      </View>
    );
  }

  return (
    <CheckoutReady
      sessionId={sessionId ?? ""}
      session={session}
      grandTotal={grandTotal}
      currency={currency}
      credit={credit}
      expiresAt={expiresAt}
      onExpired={() => {
        refetch();
        sessionQuery.refetch();
      }}
      onCreditRefused={() => refetch()}
      onCancel={onCancel}
      cancelling={cancel.isPending}
    />
  );
}

// The loaded checkout. Its own component so the payment state hook runs
// only once there is a session to pay for (the screen above returns early
// while loading or expired). Pay is the sticky bar under the ScrollView,
// like Buy on the event screen; BottomBar pads it clear of the home
// indicator, so the scroll content needs no inset of its own.
function CheckoutReady({
  sessionId,
  session,
  grandTotal,
  currency,
  credit,
  expiresAt,
  onExpired,
  onCreditRefused,
  onCancel,
  cancelling,
}: {
  sessionId: string;
  session: PreparedCheckoutSession;
  grandTotal: number;
  currency: string;
  credit: CreditQuote | null;
  expiresAt: string | null;
  onExpired: () => void;
  onCreditRefused: () => void;
  onCancel: () => void;
  cancelling: boolean;
}) {
  const t = useTranslations("checkout");

  const payment = useTicketPayment({
    sessionId,
    currency,
    total: session.total,
    eventTitle: session.eventTitle,
    eventId: session.eventId,
    creditQuote: credit,
    onCreditRefused,
  });

  return (
    <View className="flex-1 bg-background">
      <AppHeader variant="title" title={t("checkout")} backFallback="/(app)" />
      <ScrollView
        className="flex-1 bg-background"
        contentContainerClassName="gap-5 p-4 pb-6"
      >
        <CheckoutExpiryBanner expiresAt={expiresAt} onExpired={onExpired} />

        <View>
          <AppText variant="caption">{t("orderSummary2")}</AppText>
          <AppText variant="sectionHeading">{session.eventTitle}</AppText>
        </View>

        <View className="gap-3 rounded-xl border border-border bg-card p-4">
          <Line
            label={t("subtotal")}
            value={formatMoney(currency, session.subtotal)}
          />
          {session.discount > 0 ? (
            <Line
              label={t("discount")}
              value={`− ${formatMoney(currency, session.discount)}`}
            />
          ) : null}
          <Line
            label={t("serviceFee")}
            value={formatMoney(currency, session.fee)}
          />
          <View className="my-1 h-px bg-border" />
          <Line
            label={t("total")}
            value={formatMoney(currency, session.total)}
            strong
          />
        </View>

        {grandTotal !== session.total ? (
          <AppText variant="muted">
            {t("groupTotal", {
              formatMoney: formatMoney(currency, grandTotal),
            })}
          </AppText>
        ) : null}

        <AppText variant="caption" className="-mb-2">
          {t("payment")}
        </AppText>
        <PaymentSection state={payment} />

        <Pressable
          accessibilityRole="button"
          disabled={cancelling || payment.pending}
          onPress={onCancel}
          className="items-center rounded-xl border border-destructive/40 bg-destructive/10 py-3 active:opacity-80"
        >
          {cancelling ? (
            <ActivityIndicator />
          ) : (
            <AppText className="text-sm font-semibold text-destructive">
              {t("cancelCheckout")}
            </AppText>
          )}
        </Pressable>

        <AppText variant="caption" className="text-center">
          {t("yourSeatsAreHeldForA")}
        </AppText>
      </ScrollView>

      <PayBar state={payment} />
    </View>
  );
}
