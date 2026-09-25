import type { SuppressedBucket } from "@abonten/core/admin/smallSample";
import { cn } from "../../ui";

// A share-of-total breakdown, in plain HTML: no chart library, readable by a
// screen reader as a list, and honest about what it is not showing.
//
// A bucket small enough to identify a person comes through suppressed, and
// is rendered as "Not enough data" rather than as a number or a zero bar.

export function BreakdownBars({
  buckets,
  total,
  labelFor,
  className,
}: {
  buckets: SuppressedBucket[];
  total: number;
  /** Turns a database key into the word an operator uses. */
  labelFor?: (key: string) => string;
  className?: string;
}) {
  const label = labelFor ?? ((k: string) => k);
  const visible = buckets.filter((b) => !b.suppressed && (b.count ?? 0) > 0);
  const suppressed = buckets.filter((b) => b.suppressed);

  if (visible.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Not enough data to show this breakdown yet.
      </p>
    );
  }

  const max = Math.max(...visible.map((b) => b.count ?? 0), 1);

  return (
    <div className={cn("space-y-2", className)}>
      <ul className="space-y-2">
        {visible.map((b) => {
          const count = b.count ?? 0;
          const share = total > 0 ? Math.round((count / total) * 100) : 0;
          return (
            <li key={b.key}>
              <div className="flex items-baseline justify-between gap-2 text-xs">
                <span>{label(b.key)}</span>
                <span className="tabular-nums text-muted-foreground">
                  {count.toLocaleString("en-GB")}
                  {total > 0 ? ` · ${share}%` : ""}
                </span>
              </div>
              <div
                className="mt-1 h-1.5 rounded-full bg-muted"
                aria-hidden="true"
              >
                <div
                  className="h-1.5 rounded-full bg-chart-1"
                  style={{ width: `${Math.max(2, (count / max) * 100)}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>
      {suppressed.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          {suppressed.length} smaller group
          {suppressed.length === 1 ? " is" : "s are"} hidden: too few people to
          show without pointing at individuals.
        </p>
      ) : null}
    </div>
  );
}
