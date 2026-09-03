import type {
  DashboardBucket,
  OrganizerTimelineRow,
} from "@abonten/api-client";
import { AppText, Overline } from "@abonten/ui-native";
import { useThemeColors } from "@abonten/ui-native/theme";
import { useState } from "react";
import { type LayoutChangeEvent, Pressable, View } from "react-native";
import Svg, { Line, Rect } from "react-native-svg";

// Compact vertical bar chart for organizer gross-sales-over-time — replaces
// the old proportional-bar list. Pure react-native-svg (already a dep, no
// chart library). Tap a bar to see its exact figure. Last 12 buckets.

const n = (v: number | string | null | undefined): number => Number(v ?? 0);
const CHART_H = 120;

function money(currency: string, amount: number): string {
  return `${currency} ${amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function bucketLabel(bucketStart: string, bucket: DashboardBucket): string {
  const d = new Date(bucketStart);
  if (bucket === "hour")
    return d.toLocaleTimeString("en-US", { hour: "numeric" });
  if (bucket === "month")
    return d.toLocaleDateString("en-US", { month: "short" });
  return d.toLocaleDateString("en-US", { day: "numeric" });
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

  const data = rows.slice(-12);
  const max = Math.max(1, ...data.map((r) => n(r.gross)));

  function onLayout(e: LayoutChangeEvent) {
    setWidth(e.nativeEvent.layout.width);
  }

  if (data.length === 0) {
    return (
      <View className="gap-2">
        <Overline>Sales over time</Overline>
        <View className="rounded-xl border border-border bg-card p-3">
          <AppText variant="muted">No sales in this period yet.</AppText>
        </View>
      </View>
    );
  }

  const gap = 6;
  const barW =
    width > 0
      ? Math.max(4, (width - gap * (data.length - 1)) / data.length)
      : 0;
  const sel = active != null ? data[active] : null;

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
        ) : null}
      </View>

      <View className="gap-1.5 rounded-xl border border-border bg-card p-4">
        <View onLayout={onLayout} style={{ height: CHART_H }}>
          {width > 0 ? (
            <Svg width={width} height={CHART_H}>
              <Line
                x1={0}
                y1={CHART_H - 0.5}
                x2={width}
                y2={CHART_H - 0.5}
                stroke={c.border}
                strokeWidth={1}
              />
              {data.map((r, i) => {
                const h = Math.max(2, (n(r.gross) / max) * (CHART_H - 6));
                const x = i * (barW + gap);
                return (
                  <Rect
                    key={r.bucket_start}
                    x={x}
                    y={CHART_H - h}
                    width={barW}
                    height={h}
                    rx={3}
                    fill={
                      active === null || active === i
                        ? c.primary
                        : c["muted-foreground"]
                    }
                    opacity={active === null || active === i ? 1 : 0.35}
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

        <View className="flex-row justify-between">
          <AppText variant="caption">
            {bucketLabel(data[0].bucket_start, bucket)}
          </AppText>
          <AppText variant="caption">
            {bucketLabel(data[data.length - 1].bucket_start, bucket)}
          </AppText>
        </View>
      </View>
    </View>
  );
}
