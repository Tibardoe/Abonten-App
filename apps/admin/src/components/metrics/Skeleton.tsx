import { Card, cn } from "../ui";

// Loading shapes that match what replaces them, so a page does not jump when
// the data lands. Reduced-motion users get a still block rather than a pulse.

export function Skeleton({
  className,
  style,
}: { className?: string; style?: React.CSSProperties }) {
  return (
    <div
      aria-hidden="true"
      style={style}
      className={cn(
        "animate-pulse rounded-md bg-muted motion-reduce:animate-none",
        className,
      )}
    />
  );
}

export function MetricGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {Array.from({ length: count }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length placeholder
        <Card key={i} className="p-4">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="mt-2 h-7 w-20" />
          <Skeleton className="mt-2 h-3 w-28" />
        </Card>
      ))}
    </div>
  );
}

export function ChartSkeleton({ height = 220 }: { height?: number }) {
  return <Skeleton className="w-full" style={{ height }} />;
}

export function TableSkeleton({
  rows = 6,
  cols = 5,
}: { rows?: number; cols?: number }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      {Array.from({ length: rows }, (_, r) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length placeholder
          key={r}
          className="flex gap-3 border-b border-border px-3 py-2.5 last:border-b-0"
        >
          {Array.from({ length: cols }, (_, c) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length placeholder
            <Skeleton key={c} className="h-4 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}
