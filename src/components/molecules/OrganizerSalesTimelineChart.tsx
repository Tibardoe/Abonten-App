"use client";

import InlineErrorRetry from "@/components/molecules/InlineErrorRetry";
import type { DashboardBucket } from "@/utils/organizerDashboardDateRange";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Skeleton } from "../ui/skeleton";

// biome-ignore lint/suspicious/noExplicitAny: no generated Supabase types exist in this repo (see PROJECT.md)
type Row = any;

function formatBucketLabel(bucketStart: string, bucket: DashboardBucket) {
  const date = new Date(bucketStart);
  if (bucket === "hour") {
    return date.toLocaleTimeString("en-US", { hour: "numeric" });
  }
  if (bucket === "month") {
    return date.toLocaleDateString("en-US", {
      month: "short",
      year: "numeric",
    });
  }
  return date.toLocaleDateString("en-US", { weekday: "short", day: "numeric" });
}

function TimelineTooltip({
  active,
  payload,
  currency,
}: {
  active?: boolean;
  // biome-ignore lint/suspicious/noExplicitAny: recharts tooltip payload typing is not worth reproducing here
  payload?: any[];
  currency: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0].payload;

  return (
    <div className="bg-popover text-popover-foreground border border-border rounded-md shadow-md px-3 py-2 text-sm">
      <p className="font-medium">{row.label}</p>
      <p className="text-muted-foreground">
        {currency} {Number(row.gross).toLocaleString()} &middot; {row.orders}{" "}
        order{row.orders === 1 ? "" : "s"}
      </p>
    </div>
  );
}

export default function OrganizerSalesTimelineChart({
  data,
  bucket,
  currency,
  isLoading,
  isError,
  onRetry,
}: {
  data: Row[];
  bucket: DashboardBucket;
  currency: string;
  isLoading: boolean;
  isError?: boolean;
  onRetry?: () => void;
}) {
  if (isLoading) {
    return <Skeleton className="h-64 w-full rounded-md" />;
  }

  if (isError) {
    return (
      <InlineErrorRetry
        message="We couldn't load your sales chart."
        onRetry={() => onRetry?.()}
      />
    );
  }

  if (data.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center border border-dashed border-border rounded-md">
        <p className="text-sm text-muted-foreground">
          No sales in this period yet.
        </p>
      </div>
    );
  }

  const chartData = data.map((row) => ({
    label: formatBucketLabel(row.bucket_start, bucket),
    gross: Number(row.gross),
    orders: Number(row.orders),
  }));

  const total = chartData.reduce((sum, row) => sum + row.gross, 0);

  return (
    <div
      role="img"
      aria-label={`Sales over time chart. Total ${currency} ${total.toLocaleString()} across ${chartData.length} ${bucket === "hour" ? "hours" : bucket === "month" ? "months" : "days"}.`}
    >
      <ResponsiveContainer width="100%" height={256}>
        <BarChart
          data={chartData}
          margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            vertical={false}
            stroke="hsl(var(--border))"
          />
          <XAxis
            dataKey="label"
            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
            tickLine={false}
            axisLine={{ stroke: "hsl(var(--border))" }}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            width={48}
            tickFormatter={(value: number) =>
              value >= 1000 ? `${(value / 1000).toFixed(0)}k` : String(value)
            }
          />
          <Tooltip
            content={<TimelineTooltip currency={currency} />}
            cursor={{ fill: "hsl(var(--muted))" }}
          />
          <Bar
            dataKey="gross"
            fill="hsl(var(--chart-1))"
            radius={[4, 4, 0, 0]}
            maxBarSize={40}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
