import { useSession } from "@/auth/SessionProvider";
import { usePendingCheckouts } from "@/features/checkout/useCheckout";
import {
  formatCountdown,
  useCheckoutCountdown,
} from "@/features/checkout/useCheckoutCountdown";
import type { PendingCheckoutSession } from "@abonten/api-client";
import { AppText, Button, Icon } from "@abonten/ui-native";
import { useTranslations } from "@abonten/ui-native/i18n";
import { useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import { Pressable, View } from "react-native";

// "Your tickets for Afro Night are held for 24:10 · Continue". The way back
// into a checkout left unfinished (the app closed on the payment page, a
// call came in): the held seats were only listed under My tickets, which
// nobody opened to look for them. Shown on Home (the soonest to expire) and
// on that event's page; gone once paid, released or expired.
export function PendingCheckoutBanner({
  eventId,
  className,
}: {
  /** Only this event's checkout (the event page); else the soonest. */
  eventId?: string;
  /** Outer spacing — applied only when the banner is shown. */
  className?: string;
}) {
  const { session } = useSession();
  const q = usePendingCheckouts({ enabled: !!session });
  const sessions =
    q.data?.status === 200
      ? (q.data.data ?? [])
      : ([] as PendingCheckoutSession[]);
  const held = sessions
    .filter((s) => !eventId || s.eventId === eventId)
    .sort((a, b) => a.expiresAt.localeCompare(b.expiresAt));

  const first = held[0];
  if (!first) return null;
  return (
    <HeldCheckout
      key={first.checkoutSessionId}
      session={first}
      others={eventId ? 0 : held.length - 1}
      onExpired={() => q.refetch()}
      className={className}
    />
  );
}

function HeldCheckout({
  session,
  others,
  onExpired,
  className,
}: {
  session: PendingCheckoutSession;
  others: number;
  onExpired: () => void;
  className?: string;
}) {
  const t = useTranslations("checkout");
  const router = useRouter();
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

  if (isExpired || secondsLeft === null) return null;

  return (
    <View
      className={`gap-3 rounded-xl border border-primary/40 bg-card p-4 ${className ?? ""}`}
    >
      <View className="flex-row items-start gap-3">
        <View className="h-10 w-10 items-center justify-center rounded-full bg-accent">
          <Icon
            name={isWarning ? "alert-circle" : "time-outline"}
            size={22}
            tone={isWarning ? "destructive" : "primary"}
          />
        </View>
        <View className="flex-1 gap-0.5">
          <AppText variant="bodyStrong">{t("finishYourCheckout")}</AppText>
          <AppText variant="meta">
            {t("yourTicketsForAreHeldFor", {
              title: session.eventTitle,
              time: formatCountdown(secondsLeft),
            })}
          </AppText>
        </View>
      </View>
      <Button
        title={t("resumeCheckout")}
        size="sm"
        onPress={() =>
          router.push(`/(app)/checkout/${session.checkoutSessionId}`)
        }
      />
      {others > 0 ? (
        <Pressable
          accessibilityRole="link"
          hitSlop={8}
          onPress={() => router.push("/(app)/tickets")}
        >
          <AppText variant="small" tone="primary" className="font-medium">
            {t("moreHeldCheckouts", { count: others })}
          </AppText>
        </Pressable>
      ) : null}
    </View>
  );
}
