import {
  useCancelCheckout,
  usePendingCheckouts,
} from "@/features/checkout/useCheckout";
import {
  formatCountdown,
  useCheckoutCountdown,
} from "@/features/checkout/useCheckoutCountdown";
import type { PendingCheckoutSession } from "@abonten/api-client";
import { formatMoney } from "@abonten/core/formatMoney";
import { AppText, Button, Card, Icon, SectionTitle } from "@abonten/ui-native";
import { useTranslations } from "@abonten/ui-native/i18n";
import { useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import { Alert, Pressable, View } from "react-native";

// Native echo of the web PendingCheckoutsBasket — the "resume checkout"
// list. Shown at the top of the Tickets tab. Line-level quantity editing
// from the basket (web has it) is left to the checkout screen you resume
// into; this surface is resume + release only.
export function PendingCheckoutsSection() {
  const t = useTranslations("checkout");

  const q = usePendingCheckouts();
  const clearAll = useCancelCheckout();
  const sessions =
    q.data?.status === 200
      ? (q.data.data ?? [])
      : ([] as PendingCheckoutSession[]);

  if (sessions.length === 0) return null;

  function onClearAll() {
    Alert.alert(
      t("releaseAllPendingCheckouts", { length: sessions.length }),
      t("theTicketsTheyReHoldingGo"),
      [
        { text: t("keep"), style: "cancel" },
        {
          text: t("releaseAll"),
          style: "destructive",
          onPress: () => {
            for (const s of sessions) {
              clearAll.mutate(s.checkoutSessionId);
            }
          },
        },
      ],
    );
  }

  return (
    <View className="gap-3 pt-1 pb-1">
      <View className="flex-row items-center justify-between">
        <SectionTitle>{t("continueCheckout")}</SectionTitle>
        {sessions.length > 1 ? (
          <Pressable
            accessibilityRole="button"
            onPress={onClearAll}
            hitSlop={8}
            disabled={clearAll.isPending}
          >
            <AppText variant="small" tone="error" className="font-medium">
              {clearAll.isPending ? t("releasing") : t("releaseAll")}
            </AppText>
          </Pressable>
        ) : null}
      </View>
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
  const t = useTranslations("checkout");

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
    Alert.alert(t("releaseThisCheckout"), t("theTicketsItSHoldingGo"), [
      { text: t("keep"), style: "cancel" },
      {
        text: t("release"),
        style: "destructive",
        onPress: () => release.mutate(session.checkoutSessionId),
      },
    ]);
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
        <Pressable
          accessibilityRole="button"
          disabled={release.isPending}
          onPress={onRelease}
          hitSlop={8}
        >
          <AppText variant="small" tone="error" className="font-medium">
            {release.isPending ? t("releasing") : t("release")}
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
            variant="caption"
            className={
              isExpired || isWarning
                ? "font-medium text-destructive"
                : undefined
            }
          >
            {isExpired
              ? t("thisCheckoutHasExpired")
              : t("expiresIn", {
                  formatCountdown: formatCountdown(secondsLeft),
                })}
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
                ? ` · −${formatMoney(line.currency, line.discount)}`
                : ""}
            </AppText>
            <AppText variant="small">
              {formatMoney(line.currency, line.amount)}
            </AppText>
          </View>
        ))}
      </View>

      <View className="flex-row items-center justify-between border-t border-border pt-2">
        <AppText className="text-sm font-semibold text-foreground">
          {t("checkoutTotal")}
        </AppText>
        <AppText className="text-sm font-semibold text-foreground">
          {formatMoney(currency, session.sessionSubtotal)}
        </AppText>
      </View>

      <Button
        title={isExpired ? t("expired") : t("resumeCheckout")}
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
