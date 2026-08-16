import { TbMinus, TbTrendingDown, TbTrendingUp } from "react-icons/tb";
import { cn } from "../lib/utils";

// Renders the direction as an icon AND text/color together — never color
// alone (a colorblind user must still be able to tell up from down).
// `label` is required whenever there IS a previous period to compare
// against; pass no percent/previous props at all (see caller) when the
// comparison genuinely doesn't exist (e.g. "All Time") rather than
// rendering a fabricated 0%.
export default function TrendIndicator({
  percentChange,
  label,
}: {
  percentChange: number;
  label: string;
}) {
  const isFlat = Math.abs(percentChange) < 0.05;
  const isUp = !isFlat && percentChange > 0;
  const isDown = !isFlat && percentChange < 0;

  const Icon = isUp ? TbTrendingUp : isDown ? TbTrendingDown : TbMinus;

  return (
    <p
      className={cn("text-xs mt-1 flex items-center gap-1", {
        "text-primary": isUp,
        "text-destructive": isDown,
        "text-muted-foreground": isFlat,
      })}
    >
      <Icon className="text-sm" aria-hidden="true" />
      <span>
        {isUp ? "+" : ""}
        {percentChange.toFixed(1)}% {label}
      </span>
    </p>
  );
}
