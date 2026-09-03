import type {
  DashboardBucket,
  OrganizerTimelineRow,
} from "@abonten/api-client";
import { AppText, Overline } from "@abonten/ui-native";
import { useThemeColors } from "@abonten/ui-native/theme";
import { useMemo, useState } from "react";
import { type LayoutChangeEvent, Pressable, View } from "react-native";
import Svg, { Line, Rect } from "react-native-svg";

// Gross-sales-over-time for the organizer dashboard. Pure react-native-svg
// (already a dep — no chart library): a rounded vertical bar chart with a
// few faint gridlines, a period total in the header, and tap-a-bar to pin
// its exact figure. Last 12 buckets.

const n = (v: number | string | null | undefined): number => Number(v ?? 0);
const CHART_H = 132;
const TOP_PAD = 8; // headroom above the tallest bar

function money(currency: string, amount: number): string {
  return `${currency} ${amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function compact(amount: number): string {
  if (amount >= 1_000_000)
    return `${(amount / 1_000_000).toFixed(amount >= 10_000_000 ? 0 : 1)}M`;
  if (amount >= 1_000)
    return `${(amount / 1_000).toFixed(amount >= 10_000 ? 0 : 1)}k`;
  return `${Math.round(amount)}`;
}

function bucketLabel(bucketStart: string, bucket: DashboardBucket): string {
  const d = new Date(bucketStart);
  if (bucket === "hour")
    return d.toLocaleTimeString("en-US", { hour: "numeric" });
  if (bucket === "month")
    return d.toLocaleDateString("en-US", { month: "short" });
  return d.toLocaleDateString("en-US", { day: "numeric", month: "short" });
}

export function SalesTimelineChart({
  rows,
  bucket,
  currency,
}: {
  rows: OrganizerTimelineRow[];
  bucket: DashboardBucket;
  currency: string;
}) {
  const c = useThemeColors();
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState<number | null>(null);

  const data = useMemo(() => rows.slice(-12), [rows]);
  const max = Math.max(1, ...data.map((r) => n(r.gross)));
  const periodTotal = data.reduce((s, r) => s + n(r.gross), 0);
  const periodOrders = data.reduce((s, r) => s + n(r.orders), 0);

  function onLayout(e: LayoutChangeEvent) {
    setWidth(e.nativeEvent.layout.width);
  }

  if (data.length === 0) {
    return (
      <View className="gap-2">
        <Overline>Sales over time</Overline>
        <View className="items-center gap-1 rounded-xl border border-border bg-card px-3 py-6">
          <AppText variant="bodyStrong">No sales yet</AppText>
          <AppText variant="meta" className="text-center">
            Gross sales for this period will chart here once tickets sell.
          </AppText>
        </View>
      </View>
    );
  }

  const gap = data.length > 8 ? 5 : 8;
  const plotH = CHART_H - TOP_PAD;
  const barW =
    width > 0
      ? Math.max(4, (width - gap * (data.length - 1)) / data.length)
      : 0;
  const sel = active != null ? data[active] : null;
  const gridLines = [0.25, 0.5, 0.75, 1];

  return (
    <View className="gap-2">
      <View className="flex-row items-baseline justify-between">
        <Overline>Sales over time</Overline>
        {sel ? (
          <AppText variant="metaStrong" tone="brand">
            {bucketLabel(sel.bucket_start, bucket)} ·{" "}
            {money(currency, n(sel.gross))} · {n(sel.orders)} order
            {n(sel.orders) === 1 ? "" : "s"}
          </AppText>
        ) : (
          <AppText variant="metaStrong">
            {money(currency, periodTotal)} · {periodOrders} order
            {periodOrders === 1 ? "" : "s"}
          </AppText>
        )}
      </View>

      <View className="rounded-xl border border-border bg-card p-4">
        <View className="flex-row">
          {/* Y axis max marker */}
          <View
            className="w-9 justify-between pr-1"
            style={{ height: CHART_H, paddingTop: TOP_PAD }}
          >
            <AppText variant="caption" numberOfLines={1}>
              {compact(max)}
            </AppText>
            <AppText variant="caption">0</AppText>
          </View>

          <View className="flex-1">
            <View onLayout={onLayout} style={{ height: CHART_H }}>
              {width > 0 ? (
                <Svg width={width} height={CHART_H}>
                  {gridLines.map((g) => (
                    <Line
                      key={g}
                      x1={0}
                      y1={CHART_H - g * plotH}
                      x2={width}
                      y2={CHART_H - g * plotH}
                      stroke={c.border}
                      strokeWidth={1}
                      strokeDasharray={g === 1 ? undefined : "3 4"}
                      opacity={g === 1 ? 1 : 0.6}
                    />
                  ))}
                  {data.map((r, i) => {
                    const h = Math.max(2, (n(r.gross) / max) * plotH);
                    const x = i * (barW + gap);
                    const on = active === null || active === i;
                    return (
                      <Rect
                        key={r.bucket_start}
                        x={x}
                        y={CHART_H - h}
                        width={barW}
                        height={h}
                        rx={Math.min(4, barW / 2)}
                        fill={on ? c.primary : c["muted-foreground"]}
                        opacity={on ? 1 : 0.3}
                      />
                    );
                  })}
                </Svg>
              ) : null}
              {/* Tap targets over the bars */}
              <View className="absolute inset-0 flex-row" style={{ gap }}>
                {data.map((r, i) => (
                  <Pressable
                    key={r.bucket_start}
                    onPress={() => setActive(active === i ? null : i)}
                    style={{ flex: 1 }}
                    accessibilityRole="button"
                    accessibilityLabel={`${bucketLabel(r.bucket_start, bucket)}: ${money(currency, n(r.gross))}`}
                  />
                ))}
              </View>
            </View>

            <View className="mt-1 flex-row justify-between">
              <AppText variant="caption">
                {bucketLabel(data[0].bucket_start, bucket)}
              </AppText>
              {data.length > 3 ? (
                <AppText variant="caption">
                  {bucketLabel(
                    data[Math.floor((data.length - 1) / 2)].bucket_start,
                    bucket,
                  )}
                </AppText>
              ) : null}
              <AppText variant="caption">
                {bucketLabel(data[data.length - 1].bucket_start, bucket)}
              </AppText>
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}
