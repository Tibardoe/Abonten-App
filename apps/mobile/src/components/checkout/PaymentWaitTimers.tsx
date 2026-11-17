import { formatCountdown } from "@/features/checkout/useCheckoutCountdown";
import { AppText, Icon } from "@abonten/ui-native";
import { useTranslations } from "@abonten/ui-native/i18n";
import { useEffect, useState } from "react";
import { View } from "react-native";

// How long a payment check still runs, shown while the buyer waits: a
// spinner alone gave no idea whether to wait ten seconds or ten minutes
// (2026-11-17, the founder's live test). The numbers are the screen's own
// checking schedule, never a promise about the bank: "we'll keep checking
// for 0:52", then "next check in 12 s".

/** Re-renders every second while `active`; returns the current time. */
function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

/** After this long with no answer, a mobile-money buyer gets a hint. */
const NO_PROMPT_HINT_AFTER_MS = 25_000;

/**
 * The quick checks after paying: a bar filling up to the moment the screen
 * switches to "Still confirming", with the time left on it.
 */
export function VerifyCountdown({
  startedAt,
  windowMs,
  awaitingPhone,
}: {
  startedAt: number | null;
  windowMs: number;
  /** A mobile-money charge waiting for approval on the buyer's phone. */
  awaitingPhone: boolean;
}) {
  const t = useTranslations("wallet");
  const now = useNow(startedAt !== null);
  if (startedAt === null) return null;

  const elapsed = Math.max(0, now - startedAt);
  const left = Math.max(0, Math.ceil((windowMs - elapsed) / 1000));
  const progress = Math.min(1, elapsed / windowMs);

  return (
    <View className="w-full gap-2">
      <View
        className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
        accessibilityRole="progressbar"
        accessibilityValue={{
          min: 0,
          max: 100,
          now: Math.round(progress * 100),
        }}
      >
        <View
          className="h-full rounded-full bg-primary"
          style={{ width: `${Math.round(progress * 100)}%` }}
        />
      </View>
      <AppText variant="small" className="text-center text-muted-foreground">
        {t("weKeepCheckingFor", { time: formatCountdown(left) })}
      </AppText>
      {awaitingPhone && elapsed >= NO_PROMPT_HINT_AFTER_MS ? (
        <View className="flex-row items-start gap-1.5">
          <Icon name="phone-portrait-outline" size={15} tone="muted" />
          <AppText variant="small" className="flex-1 text-muted-foreground">
            {t("noPromptYetCheckMenu")}
          </AppText>
        </View>
      ) : null}
    </View>
  );
}

/**
 * While "Still confirming": when the next automatic check runs, that one is
 * running now, or that they have stopped.
 */
export function NextCheckLine({
  nextCheckAt,
  checking,
  over,
  ticket,
}: {
  nextCheckAt: number | null;
  checking: boolean;
  over: boolean;
  /** Ticket orders: we also tell the buyer the outcome afterwards. */
  ticket: boolean;
}) {
  const t = useTranslations("wallet");
  const now = useNow(nextCheckAt !== null);

  if (checking) {
    return (
      <AppText variant="small" className="text-center text-muted-foreground">
        {t("checkingPayment")}
      </AppText>
    );
  }
  if (over) {
    return (
      <AppText variant="small" className="text-center text-muted-foreground">
        {ticket
          ? t("automaticChecksStoppedTicket")
          : t("automaticChecksStopped")}
      </AppText>
    );
  }
  if (nextCheckAt === null) return null;
  const seconds = Math.max(0, Math.ceil((nextCheckAt - now) / 1000));
  return (
    <AppText variant="small" className="text-center text-muted-foreground">
      {t("nextAutomaticCheckIn", { seconds })}
    </AppText>
  );
}
