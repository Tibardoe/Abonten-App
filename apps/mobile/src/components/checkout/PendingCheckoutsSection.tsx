import {
  useCancelCheckout,
  usePendingCheckouts,
} from "@/features/checkout/useCheckout";
import {
  formatCountdown,
  useCheckoutCountdown,
} from "@/features/checkout/useCheckoutCountdown";
import type { PendingCheckoutSession } from "@abonten/api-client";
import { AppText, Button, Card, Icon, SectionTitle } from "@abonten/ui-native";
import { useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import { Alert, Pressable, View } from "react-native";

// Native echo of the web PendingCheckoutsBasket — the "resume checkout"
// list. Shown at the top of the Tickets tab. Line-level quantity editing
// from the basket (web has it) is left to the checkout screen you resume
// into; this surface is resume + release only.
export function PendingCheckoutsSection() {
  const q = usePendingCheckouts();
  const sessions =
    q.data?.status === 200
      ? (q.data.data ?? [])
      : ([] as PendingCheckoutSession[]);

  if (sessions.length === 0) return null;

  return (
    <View className="gap-3 pt-1 pb-1">
      <SectionTitle>Continue checkout</SectionTitle>
      {sessions.map((s) => (
        <SessionCard
          key={s.checkoutSessionId}
          session={s}
          onExpired={() => q.refetch()}
        />
      ))}
    </View>
  );
}

function SessionCard({
  session,
  onExpired,
}: {
  session: PendingCheckoutSession;
  onExpired: () => void;
}) {
  const router = useRouter();
  const release = useCancelCheckout();
  const { secondsLeft, isExpired, isWarning } = useCheckoutCountdown(
    session.expiresAt,
  );
  const notified = useRef(false);

  useEffect(() => {
    if (isExpired && !notified.current) {
      notified.current = true;
      onExpired();
    }
  }, [isExpired, onExpired]);

  const currency = session.lines[0]?.currency ?? "";

  function onRelease() {
    Alert.alert(
      "Release this checkout?",
      "The tickets it's holding go back on sale. You can start again anytime.",
      [
        { text: "Keep", style: "cancel" },
        {
          text: "Release",
          style: "destructive",
          onPress: () => release.mutate(session.checkoutSessionId),
        },
      ],
    );
  }

  return (
    <Card className="gap-3">
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1">
          <AppText className="text-sm font-semibold text-foreground">
            {session.eventTitle}
          </AppText>
          <AppText variant="muted">
            {session.eventDateAndTime.date} {session.eventDateAndTime.time}
          </AppText>
        </View>
        <Pressable disabled={release.isPending} onPress={onRelease} hitSlop={8}>
          <AppText className="text-[13px] font-medium text-destructive">
            {release.isPending ? "Releasing…" : "Release"}
          </AppText>
        </Pressable>
      </View>

      {secondsLeft !== null ? (
        <View className="flex-row items-center gap-1.5">
          <Icon
            name={isExpired || isWarning ? "alert-circle" : "time-outline"}
            size={13}
            tone={isExpired || isWarning ? "destructive" : "muted"}
          />
          <AppText
            className={`text-[11px] ${
              isExpired || isWarning
                ? "font-medium text-destructive"
                : "text-muted-foreground"
            }`}
          >
            {isExpired
              ? "This checkout has expired."
              : `Expires in ${formatCountdown(secondsLeft)}`}
          </AppText>
        </View>
      ) : null}

      <View className="gap-1">
        {session.lines.map((line) => (
          <View
            key={line.ticketCheckoutId}
            className="flex-row items-center justify-between"
          >
            <AppText variant="muted">
              {line.type} × {line.quantity}
              {line.discount > 0
                ? ` · −${line.currency} ${line.discount.toFixed(2)}`
                : ""}
            </AppText>
            <AppText variant="small">
              {line.currency} {line.amount.toFixed(2)}
            </AppText>
          </View>
        ))}
      </View>

      <View className="flex-row items-center justify-between border-t border-border pt-2">
        <AppText className="text-sm font-semibold text-foreground">
          Checkout total
        </AppText>
        <AppText className="text-sm font-semibold text-foreground">
          {currency} {session.sessionSubtotal.toFixed(2)}
        </AppText>
      </View>

      <Button
        title={isExpired ? "Expired" : "Resume checkout"}
        variant={isExpired ? "outline" : "primary"}
        size="sm"
        disabled={isExpired}
        onPress={() =>
          router.push(`/(app)/checkout/${session.checkoutSessionId}`)
        }
      />
    </Card>
  );
}
