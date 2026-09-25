"use client";

import { formatMoney } from "@abonten/core/formatMoney";
import { useSyncExternalStore } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Skeleton } from "../Skeleton";

// The console's time chart. Bars for what happened in each period, an
// optional dashed line for the same metric one period earlier, so "is this
// better than last month?" is answered on the chart rather than in the
// reader's head.
//
// Everything is drawn from CSS variables, so it follows the console's theme
// rather than carrying colours of its own, and the axis labels are formatted
// in Africa/Accra by the server-rendered parent, which passes them in.

export type TimeSeriesPoint = {
  /** Pre-formatted bucket label, e.g. "12 Sep". */
  label: string;
  value: number;
  /** The same bucket one period earlier, aligned by position. */
  previous?: number | null;
};

const subscribe = () => () => {};

export function TimeSeriesChart({
  data,
  valueLabel,
  previousLabel,
  format = "count",
  currency = "",
  height = 200,
}: {
  data: TimeSeriesPoint[];
  valueLabel: string;
  previousLabel?: string;
  /**
   * How values read on the axis and in the tooltip. A plain string, not a
   * formatter function: a server component cannot hand a function to a
   * client one.
   */
  format?: "count" | "money";
  currency?: string;
  height?: number;
}) {
  // recharts measures the DOM, so it cannot render on the server. Reserving
  // the exact height here keeps the page from jumping when it mounts.
  const mounted = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  if (!mounted) return <Skeleton style={{ height }} className="w-full" />;

  const fmt = (v: number) =>
    format === "money"
      ? formatMoney(currency, Math.round(v || 0), { trimZeroFraction: true })
      : v.toLocaleString("en-GB");
  const hasPrevious =
    previousLabel != null && data.some((d) => d.previous != null);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart
        data={data}
        margin={{ top: 4, right: 4, bottom: 0, left: 4 }}
      >
        <CartesianGrid
          strokeDasharray="3 3"
          vertical={false}
          stroke="hsl(var(--border))"
        />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          minTickGap={24}
          tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={48}
          allowDecimals={false}
          tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
          tickFormatter={(v: number) => fmt(v)}
        />
        <Tooltip
          cursor={{ fill: "hsl(var(--muted))" }}
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null;
            return (
              <div className="rounded-md border border-border bg-popover p-2 text-xs text-popover-foreground shadow-md">
                <p className="font-medium">{label}</p>
                {payload.map((p) => (
                  <p key={String(p.dataKey)} className="mt-0.5">
                    {p.dataKey === "previous" ? previousLabel : valueLabel}:{" "}
                    {fmt(Number(p.value ?? 0))}
                  </p>
                ))}
              </div>
            );
          }}
        />
        <Bar
          dataKey="value"
          fill="hsl(var(--chart-1))"
          radius={[3, 3, 0, 0]}
          maxBarSize={28}
        />
        {hasPrevious ? (
          <Line
            dataKey="previous"
            type="monotone"
            stroke="hsl(var(--chart-3))"
            strokeDasharray="4 3"
            strokeWidth={2}
            dot={false}
            connectNulls
          />
        ) : null}
      </ComposedChart>
    </ResponsiveContainer>
  );
}
