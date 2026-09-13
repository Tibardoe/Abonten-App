import {
  type TrendResult,
  formatTrendPercent,
  trendDirection,
} from "@abonten/core/admin/computeTrend";
import { ArrowDownRight, ArrowUpRight, Minus, Sparkles } from "lucide-react";
import { cn } from "../ui";

// Up is not always good: more refunds is worse, more sales is better, and a
// count of open reports going up is a problem. The caller says which
// direction it wants, so the colour means "good/bad" rather than
// "bigger/smaller". Direction is always spelled out in text and carried by
// an icon too, so the meaning survives a black-and-white print and a reader
// who cannot distinguish red from green.

export type TrendProps = {
  result: TrendResult;
  /** e.g. "vs previous 30 days". Without one, nothing is rendered. */
  comparisonLabel: string | null;
  goodDirection?: "up" | "down" | "neutral";
  className?: string;
};

export function Trend({
  result,
  comparisonLabel,
  goodDirection = "up",
  className,
}: TrendProps) {
  const direction = trendDirection(result);
  if (direction === "none" || !comparisonLabel) return null;

  if (direction === "new") {
    return (
      <p
        className={cn(
          "mt-1 flex items-center gap-1 text-xs text-primary",
          className,
        )}
      >
        <Sparkles className="h-3 w-3 shrink-0" aria-hidden="true" />
        <span>New {comparisonLabel}</span>
      </p>
    );
  }

  const Icon =
    direction === "up"
      ? ArrowUpRight
      : direction === "down"
        ? ArrowDownRight
        : Minus;

  const isGood =
    goodDirection === "neutral" || direction === "flat"
      ? null
      : direction === goodDirection;

  const percent =
    result.kind === "percent" ? formatTrendPercent(result.value) : "0%";

  return (
    <p
      className={cn(
        "mt-1 flex items-center gap-1 text-xs",
        isGood === null
          ? "text-muted-foreground"
          : isGood
            ? "text-success"
            : "text-destructive",
        className,
      )}
    >
      <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />
      <span>
        {percent} {comparisonLabel}
      </span>
    </p>
  );
}
