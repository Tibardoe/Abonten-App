// Chat-specific time formatting. The thread groups messages by calendar day
// with a separator, and each bubble shows a short clock time.

export function clockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

// "Today" / "Yesterday" / "Mon, 5 Sep" / "5 Sep 2024" — the label above the
// first message of each calendar day.
export function daySeparatorLabel(iso: string): string {
  const then = new Date(iso);
  const today = startOfDay(new Date());
  const thatDay = startOfDay(then);
  const dayMs = 86_400_000;

  if (thatDay === today) return "Today";
  if (thatDay === today - dayMs) return "Yesterday";

  const sameYear = then.getFullYear() === new Date().getFullYear();
  return then.toLocaleDateString(undefined, {
    weekday: sameYear ? "short" : undefined,
    day: "numeric",
    month: "short",
    year: sameYear ? undefined : "numeric",
  });
}

export function isSameCalendarDay(a: string, b: string): boolean {
  return startOfDay(new Date(a)) === startOfDay(new Date(b));
}

// Messages from the same sender within this gap render as one visual group
// (no repeated avatar, tighter spacing) — the WhatsApp/iMessage cluster.
export const GROUPING_WINDOW_MS = 3 * 60_000;
