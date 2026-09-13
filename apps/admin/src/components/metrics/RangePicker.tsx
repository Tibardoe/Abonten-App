import { formatAccraDate } from "@/lib/format";
import {
  ADMIN_RANGE_LABELS,
  type ResolvedAdminRange,
} from "@abonten/core/admin/adminDateRange";
import type { AdminRangeKey } from "@abonten/types/adminTypes";
import Link from "next/link";
import { cn } from "../ui";

// The period control, and the sentence that says what the period actually
// is. Presets are links and the custom range is a plain GET form, so the
// whole thing works with no client JavaScript and every view has a URL an
// operator can bookmark or paste into a message.

const PRESETS: AdminRangeKey[] = ["today", "7d", "30d", "90d", "ytd"];

export function RangePicker({
  basePath,
  range,
  keys = PRESETS,
  preserve,
}: {
  basePath: string;
  range: ResolvedAdminRange;
  keys?: AdminRangeKey[];
  /** Other query params to carry through, e.g. a status filter. */
  preserve?: Record<string, string | undefined>;
}) {
  const extra = Object.entries(preserve ?? {})
    .filter(([, v]) => v)
    .map(([k, v]) => `&${k}=${encodeURIComponent(v as string)}`)
    .join("");

  const lastIncludedDay = new Date(
    new Date(range.to).getTime() - 1,
  ).toISOString();

  return (
    <div className="flex flex-wrap items-center gap-1">
      {keys.map((key) => (
        <Link
          key={key}
          href={`${basePath}?range=${key}${extra}`}
          aria-current={range.key === key ? "page" : undefined}
          className={cn(
            "rounded px-2 py-1 text-xs",
            range.key === key
              ? "bg-primary text-primary-foreground"
              : "border border-border hover:bg-muted",
          )}
        >
          {ADMIN_RANGE_LABELS[key]}
        </Link>
      ))}

      <form
        method="get"
        action={basePath}
        className="flex flex-wrap items-center gap-1"
      >
        <input type="hidden" name="range" value="custom" />
        {Object.entries(preserve ?? {})
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v as string} />
          ))}
        <label className="sr-only" htmlFor="range-from">
          From date
        </label>
        <input
          id="range-from"
          type="date"
          name="from"
          defaultValue={range.from.slice(0, 10)}
          max={new Date().toISOString().slice(0, 10)}
          className="h-7 rounded border border-border bg-background px-1.5 text-xs"
        />
        <span className="text-xs text-muted-foreground">to</span>
        <label className="sr-only" htmlFor="range-to">
          To date
        </label>
        <input
          id="range-to"
          type="date"
          name="to"
          defaultValue={lastIncludedDay.slice(0, 10)}
          max={new Date().toISOString().slice(0, 10)}
          className="h-7 rounded border border-border bg-background px-1.5 text-xs"
        />
        <button
          type="submit"
          className="rounded border border-border px-2 py-1 text-xs hover:bg-muted"
        >
          Apply
        </button>
      </form>
    </div>
  );
}

/** The one-line description of what is on screen. */
export function RangeCaption({
  range,
  className,
}: {
  range: ResolvedAdminRange;
  className?: string;
}) {
  const lastIncludedDay = new Date(
    new Date(range.to).getTime() - 1,
  ).toISOString();
  const comparison =
    range.prevFrom && range.prevTo
      ? `Compared with ${formatAccraDate(range.prevFrom)} – ${formatAccraDate(
          new Date(new Date(range.prevTo).getTime() - 1).toISOString(),
        )}`
      : null;

  return (
    <p className={cn("text-xs text-muted-foreground", className)}>
      {range.label} · {formatAccraDate(range.from)} –{" "}
      {range.isPartial ? "now" : formatAccraDate(lastIncludedDay)} ·
      Africa/Accra
      {comparison ? ` · ${comparison}` : ""}
      {range.isPartial ? " · today is still in progress" : ""}
    </p>
  );
}
