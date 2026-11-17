"use client";

import { formatCountdown } from "@/hooks/useCheckoutCountdown";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

// How long a payment check still runs, shown while the buyer waits (the
// website's twin of the app's PaymentWaitTimers): the numbers are the
// page's own checking schedule, never a promise about the bank.

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

/** A bar filling up to the end of the quick checks, with the time left. */
export function WaitCountdown({
  startedAt,
  windowMs,
  awaitingPhone,
}: {
  startedAt: number;
  windowMs: number;
  awaitingPhone: boolean;
}) {
  const t = useTranslations("common");
  const now = useNow(true);
  const elapsed = Math.max(0, now - startedAt);
  if (elapsed >= windowMs) return null;
  const left = Math.ceil((windowMs - elapsed) / 1000);
  const percent = Math.round(Math.min(1, elapsed / windowMs) * 100);

  return (
    <div className="space-y-2">
      {/* The words below say the time left; the bar only shows it. */}
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-border"
        aria-hidden
      >
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-1000 ease-linear"
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="text-xs">
        {t("weKeepCheckingFor", { time: formatCountdown(left) })}
      </p>
      {awaitingPhone && elapsed >= NO_PROMPT_HINT_AFTER_MS ? (
        <p className="text-xs">{t("noPromptYetCheckMenu")}</p>
      ) : null}
    </div>
  );
}

/** After the quick checks: when the next one runs, or that they stopped. */
export function NextCheckText({
  nextCheckAt,
  checking,
  over,
  ticket,
}: {
  nextCheckAt: number | null;
  checking: boolean;
  over: boolean;
  /** Ticket orders: the buyer is also told the outcome afterwards. */
  ticket: boolean;
}) {
  const t = useTranslations("common");
  const now = useNow(nextCheckAt !== null);
  if (checking) return <p className="text-xs">{t("checkingPayment")}</p>;
  if (over) {
    return (
      <p className="text-xs">
        {ticket
          ? t("automaticChecksStoppedTicket")
          : t("automaticChecksStopped")}
      </p>
    );
  }
  if (nextCheckAt === null) return null;
  const seconds = Math.max(0, Math.ceil((nextCheckAt - now) / 1000));
  return <p className="text-xs">{t("nextAutomaticCheckIn", { seconds })}</p>;
}
