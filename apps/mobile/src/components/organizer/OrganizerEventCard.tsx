import { formatDateWithSuffix } from "@abonten/core/dateFormatter";
import { AppText, Icon, StatusPill } from "@abonten/ui-native";
import { useThemeColors } from "@abonten/ui-native/theme";
import { Link } from "expo-router";
import { Pressable, View } from "react-native";

// One card shape for the Organizer dashboard's "Event performance" and
// "Upcoming events" lists (§5 / §6). Same visual hierarchy in both:
//   1. event title  +  a status pill (Upcoming / Ongoing / Ended / Sold out …)
//   2. the relevant date, with a calendar glyph
//   3. a metric strip — the most important number is biggest
// Statuses and tints come from the shared status system (@abonten/ui-native
// StatusPill), so an "Ongoing" here matches an "Ongoing" anywhere else.

const num = (v: number | string | null | undefined): number => Number(v ?? 0);

function money(currency: string | null | undefined, amount: number): string {
  return `${currency ? `${currency} ` : "GHS "}${amount.toLocaleString(
    undefined,
    { maximumFractionDigits: 0 },
  )}`;
}

/** Resolve the pill status, folding "sold out" in when capacity is hit. */
function statusFor(opts: {
  status: string | null;
  soldOut?: boolean;
}): string {
  if (opts.soldOut) return "sold_out";
  return opts.status ?? "upcoming";
}

function Metric({
  label,
  value,
  emphasis,
  align = "left",
}: {
  label: string;
  value: string;
  emphasis?: boolean;
  align?: "left" | "right";
}) {
  return (
    <View
      className={`min-w-0 gap-0.5 ${emphasis ? "flex-1" : "shrink-0 pl-3"} ${
        align === "right" ? "items-end" : ""
      }`}
    >
      <AppText variant="caption" numberOfLines={1}>
        {label}
      </AppText>
      <AppText
        variant={emphasis ? "sectionTitle" : "bodyStrong"}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.8}
      >
        {value}
      </AppText>
    </View>
  );
}

/** Thin capacity bar — brand fill, muted track, clamped 0–100%. */
function CapacityBar({ sold, capacity }: { sold: number; capacity: number }) {
  const c = useThemeColors();
  const pct = capacity > 0 ? Math.min(1, Math.max(0, sold / capacity)) : 0;
  return (
    <View
      className="h-1.5 overflow-hidden rounded-full"
      style={{ backgroundColor: c.muted }}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: capacity, now: sold }}
    >
      <View
        style={{
          width: `${pct * 100}%`,
          height: "100%",
          backgroundColor: pct >= 1 ? c.warning : c.primary,
        }}
      />
    </View>
  );
}

export function OrganizerEventCard({
  eventId,
  title,
  date,
  status,
  variant,
  currency,
  revenue,
  ticketsSold,
  capacity,
}: {
  eventId: string;
  title: string | null;
  date: string | null;
  status: string | null;
  variant: "performance" | "upcoming";
  currency?: string | null;
  revenue?: number | string;
  ticketsSold: number | string;
  capacity?: number | string | null;
}) {
  const sold = num(ticketsSold);
  const cap = capacity == null ? null : num(capacity);
  const soldOut = cap != null && cap > 0 && sold >= cap;
  const remaining = cap != null ? Math.max(0, cap - sold) : null;

  return (
    <Link href={`/(app)/organizer/events/${eventId}`} asChild>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${title ?? "Untitled event"} — open`}
        className="gap-3 rounded-2xl border border-border bg-card p-4 active:opacity-80"
      >
        <View className="flex-row items-start justify-between gap-3">
          <AppText
            variant="bodyStrong"
            numberOfLines={2}
            className="flex-1 leading-5"
          >
            {title ?? "Untitled event"}
          </AppText>
          <StatusPill status={statusFor({ status, soldOut })} size="sm" />
        </View>

        <View className="flex-row items-center gap-1.5">
          <Icon name="calendar-outline" size={13} tone="muted" />
          <AppText variant="caption">
            {date ? formatDateWithSuffix(date) : "Date not set"}
          </AppText>
        </View>

        {variant === "performance" ? (
          <View className="flex-row items-end justify-between">
            <Metric
              label="Revenue"
              value={money(currency, num(revenue))}
              emphasis
            />
            <Metric
              label="Tickets sold"
              value={sold.toLocaleString()}
              align="right"
            />
          </View>
        ) : (
          <View className="gap-2">
            <View className="flex-row items-end justify-between">
              <Metric
                label={cap != null ? "Sold" : "Tickets sold"}
                value={
                  cap != null
                    ? `${sold.toLocaleString()} / ${cap.toLocaleString()}`
                    : sold.toLocaleString()
                }
                emphasis
              />
              {remaining != null ? (
                <Metric
                  label={soldOut ? "Status" : "Spots left"}
                  value={soldOut ? "Sold out" : remaining.toLocaleString()}
                  align="right"
                />
              ) : null}
            </View>
            {cap != null && cap > 0 ? (
              <CapacityBar sold={sold} capacity={cap} />
            ) : null}
          </View>
        )}
      </Pressable>
    </Link>
  );
}
