import type { TrendResult } from "@abonten/core/admin/computeTrend";
import {
  type MetricKey,
  metricDefinition,
} from "@abonten/core/admin/metricDefinitions";
import { AlertTriangle } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Card, cn, money } from "../ui";
import { InfoTip } from "./InfoTip";
import { Trend } from "./Trend";

// One tile, one number, and everything an operator needs to trust it: what
// it means (ⓘ), the period it covers, how it compares with the period
// before, and where to go next.
//
// The states matter as much as the number. "0" and "we have no data" and
// "too few people to say" are three different answers and used to look
// identical, so each one is spelled out in words.

export type MetricState =
  | "ok"
  | "zero"
  | "no-data"
  | "insufficient"
  | "unavailable"
  | "error";

export type MetricFormat = "count" | "money" | "percent" | "ms";

export type MetricCardProps = {
  /** Overrides the registry label. Prefer the registry. */
  label?: string;
  metric?: MetricKey;
  value: number | null;
  format?: MetricFormat;
  currency?: string;
  /** Definition text; taken from the registry when `metric` is given. */
  definition?: { text: string; caveats?: string[]; source?: string };
  /** What window the value covers, e.g. "Last 30 days" or "Right now". */
  period?: string;
  trend?: {
    result: TrendResult;
    comparisonLabel: string | null;
    goodDirection?: "up" | "down" | "neutral";
  };
  state?: MetricState;
  /** Why a state is what it is, e.g. "cost known for 18 of 26 payments". */
  stateNote?: string;
  /** A second figure that stops the first being misread. */
  secondary?: ReactNode;
  tone?: "neutral" | "warning" | "danger";
  href?: string;
};

function formatValue(
  value: number,
  format: MetricFormat,
  currency: string,
): string {
  switch (format) {
    case "money":
      return money(value, currency);
    case "percent":
      return `${(value * 100).toFixed(1)}%`;
    case "ms":
      return `${Math.round(value)} ms`;
    default:
      return value.toLocaleString("en-GH");
  }
}

// "Zero" means different things depending on what the tile measures: no
// sales this month, nothing waiting right now, nothing ever. Saying "none in
// this period" under an all-time figure is simply wrong.
function zeroNote(period: string | undefined): string {
  if (period === "Right now") return "Nothing right now";
  if (period === "All time") return "Nothing yet";
  return period ? `None in ${period.toLowerCase()}` : "None";
}

function resolveState(
  value: number | null,
  explicit: MetricState | undefined,
): MetricState {
  if (explicit) return explicit;
  if (value === null) return "no-data";
  if (value === 0) return "zero";
  return "ok";
}

export function MetricCard({
  label,
  metric,
  value,
  format = "count",
  currency = "GHS",
  definition,
  period,
  trend,
  state,
  stateNote,
  secondary,
  tone,
  href,
}: MetricCardProps) {
  const registry = metric ? metricDefinition(metric) : null;
  const title = label ?? registry?.label ?? "";
  const tip = definition
    ? { ...definition }
    : registry
      ? {
          text: registry.definition,
          caveats: registry.caveats,
          source: registry.source,
        }
      : null;
  const resolved = resolveState(value, state);

  const body = (() => {
    switch (resolved) {
      case "ok":
        return (
          <p
            className={cn(
              "mt-1 text-2xl font-semibold tabular-nums",
              tone === "danger" && "text-destructive",
              tone === "warning" && "text-warning",
            )}
          >
            {formatValue(value ?? 0, format, currency)}
          </p>
        );
      case "zero":
        return (
          <>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-muted-foreground">
              {formatValue(0, format, currency)}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {stateNote ?? zeroNote(period)}
            </p>
          </>
        );
      case "no-data":
        return (
          <>
            <p className="mt-1 text-2xl font-semibold text-muted-foreground">
              —
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {stateNote ?? "Nothing recorded yet"}
            </p>
          </>
        );
      case "insufficient":
        return (
          <>
            <p className="mt-1 text-sm font-medium text-muted-foreground">
              Not enough data
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {stateNote ?? "Too few people to report this without naming them"}
            </p>
          </>
        );
      case "unavailable":
        return (
          <>
            <p className="mt-1 text-sm font-medium text-muted-foreground">
              Not available
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {stateNote ?? "This figure is not collected"}
            </p>
          </>
        );
      case "error":
        return (
          <p className="mt-1 flex items-center gap-1.5 text-sm font-medium text-destructive">
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
            {stateNote ?? "Couldn't load"}
          </p>
        );
    }
  })();

  // A drill-down card is not a link wrapped around the tile: the ⓘ inside
  // would then sit inside the anchor, and pressing it would open the
  // definition *and* navigate (a driven-browser check caught exactly that).
  // Instead the link is an overlay under the content, and the ⓘ stays above
  // it, so each control does one thing.
  const inner = (
    <Card
      className={cn(
        "relative h-full p-4",
        href && "transition-colors group-hover:bg-muted",
      )}
    >
      <div className="flex items-center gap-1.5">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          {title}
        </p>
        {tip ? (
          <InfoTip
            label={title}
            definition={tip.text}
            caveats={tip.caveats}
            source={tip.source}
            period={period}
            className="z-10"
          />
        ) : null}
      </div>

      {body}

      {period && resolved === "ok" ? (
        <p className="mt-0.5 text-xs text-muted-foreground">{period}</p>
      ) : null}
      {resolved === "ok" && trend ? (
        <Trend
          result={trend.result}
          comparisonLabel={trend.comparisonLabel}
          goodDirection={trend.goodDirection}
        />
      ) : null}
      {secondary ? (
        <p className="mt-1 text-xs text-muted-foreground">{secondary}</p>
      ) : null}
    </Card>
  );

  return href ? (
    <div className="group relative h-full">
      {inner}
      <Link
        href={href}
        className="absolute inset-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="sr-only">Go to {title}</span>
      </Link>
    </div>
  ) : (
    inner
  );
}
