import { AlertTriangle } from "lucide-react";
import { cn } from "../ui";

// A summary computed from a capped read has to say so. Before this, a page
// that summed "the first 10,000 decisions" showed the result as if it were
// the whole period, and nobody could tell from the screen. The cores now
// report how many rows there were against how many they read, and this
// renders that gap in words wherever it is not zero.

export function CapNotice({
  fetched,
  total,
  noun,
  className,
}: {
  fetched: number;
  total: number;
  /** What was counted, plural, e.g. "reward decisions". */
  noun: string;
  className?: string;
}) {
  if (total <= fetched) return null;
  // <output> carries the "status" role natively, so assistive tech announces
  // the notice when it appears without an explicit role attribute.
  return (
    <output
      className={cn(
        "flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-3 text-xs text-foreground",
        className,
      )}
    >
      <AlertTriangle
        className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning"
        aria-hidden="true"
      />
      <span>
        <strong className="font-medium">Incomplete figures.</strong> The
        summaries on this page were computed from the first{" "}
        {fetched.toLocaleString("en-GH")} of {total.toLocaleString("en-GH")}{" "}
        {noun} in this period. Choose a shorter period for exact numbers.
      </span>
    </output>
  );
}
