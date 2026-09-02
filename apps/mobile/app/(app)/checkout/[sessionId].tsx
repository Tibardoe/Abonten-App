import { AppHeader } from "@/components/app/AppHeader";
import { PaymentSection } from "@/features/checkout/PaymentSection";
import {
  useCancelCheckout,
  useCheckoutPrepare,
  useCheckoutSession,
} from "@/features/checkout/useCheckout";
import {
  formatCountdown,
  useCheckoutCountdown,
} from "@/features/checkout/useCheckoutCountdown";
import { AppText } from "@abonten/ui-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  View,
} from "react-native";

function CheckoutExpiryBanner({
  expiresAt,
  onExpired,
}: {
  expiresAt: string | null;
  onExpired: () => void;
}) {
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
          ? "This checkout has expired."
          : `Checkout expires in ${formatCountdown(secondsLeft)}`}
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
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const router = useRouter();
  const { data, isLoading, isError, refetch } = useCheckoutPrepare(sessionId);
  const sessionQuery = useCheckoutSession(sessionId);
  const cancel = useCancelCheckout();

  // The first line item's expires_at speaks for the session (all rows share
  // one deadline). getSession self-heals stale rows server-side.
  const rows = (sessionQuery.data?.data ?? []) as { expires_at?: string }[];
  const expiresAt = rows[0]?.expires_at ?? null;

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator />
      </View>
    );
  }

  if (isError || !data || data.status !== 200 || !data.data) {
    return (
      <View className="flex-1 items-center justify-center gap-3 bg-background px-6">
        <AppText className="text-center text-muted-foreground">
          {data?.message ?? "This checkout could not be loaded."}
        </AppText>
        <Pressable
          className="rounded-lg bg-primary px-4 py-2 active:opacity-90"
          onPress={() => refetch()}
        >
          <AppText className="font-semibold text-primary-foreground">
            Retry
          </AppText>
        </Pressable>
      </View>
    );
  }

  const { validSessions, invalidSessionIds, grandTotal, currency } = data.data;
  const expired = invalidSessionIds.includes(sessionId ?? "");
  const session = validSessions.find((s) => s.checkoutSessionId === sessionId);

  async function onCancel() {
    const res = await cancel.mutateAsync(sessionId ?? "");
    if (res.status === 200) {
      router.back();
      return;
    }
    Alert.alert("Couldn't cancel", res.message ?? "Please try again.");
  }

  if (expired || !session) {
    return (
      <View className="flex-1 items-center justify-center gap-3 bg-background px-6">
        <AppText className="text-center text-muted-foreground">
          This checkout has expired. Your seats were released — start again from
          the event.
        </AppText>
        <Pressable
          className="rounded-lg bg-primary px-4 py-2 active:opacity-90"
          onPress={() => router.back()}
        >
          <AppText className="font-semibold text-primary-foreground">
            Back to event
          </AppText>
        </Pressable>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <AppHeader variant="title" title="Checkout" backFallback="/(app)" />
      <ScrollView
        className="flex-1 bg-background"
        contentContainerClassName="gap-5 p-4 pb-10"
      >
        <CheckoutExpiryBanner
          expiresAt={expiresAt}
          onExpired={() => {
            refetch();
            sessionQuery.refetch();
          }}
        />

        <View>
          <AppText variant="caption">Order summary</AppText>
          <AppText variant="sectionHeading">{session.eventTitle}</AppText>
        </View>

        <View className="gap-3 rounded-xl border border-border bg-card p-4">
          <Line label="Subtotal" value={`${currency} ${session.subtotal}`} />
          {session.discount > 0 ? (
            <Line
              label="Discount"
              value={`− ${currency} ${session.discount}`}
            />
          ) : null}
          <Line label="Service fee" value={`${currency} ${session.fee}`} />
          <View className="my-1 h-px bg-border" />
          <Line label="Total" value={`${currency} ${session.total}`} strong />
        </View>

        {grandTotal !== session.total ? (
          <AppText variant="muted">
            Group total: {currency} {grandTotal}
          </AppText>
        ) : null}

        <AppText variant="caption" className="-mb-2">
          Payment
        </AppText>
        <PaymentSection
          sessionId={sessionId ?? ""}
          currency={currency}
          total={session.total}
        />

        <Pressable
          disabled={cancel.isPending}
          onPress={onCancel}
          className="items-center rounded-xl border border-border py-3 active:opacity-90"
        >
          {cancel.isPending ? (
            <ActivityIndicator />
          ) : (
            <AppText className="text-sm font-semibold text-destructive">
              Cancel checkout
            </AppText>
          )}
        </Pressable>

        <AppText variant="caption" className="text-center">
          Your seats are held for a limited time.
        </AppText>
      </ScrollView>
    </View>
  );
}
