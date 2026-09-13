import { MetricGridSkeleton, Skeleton } from "@/components/metrics/Skeleton";

// Shown while a console page's data loads. It mirrors the dashboard's shape
// so nothing jumps when the real figures arrive, and it tells a screen
// reader that something is happening rather than leaving silence.
export default function ConsoleLoading() {
  return (
    <output aria-live="polite" className="block">
      <span className="sr-only">Loading…</span>
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <Skeleton className="h-6 w-56" />
          <Skeleton className="mt-2 h-4 w-80" />
        </div>
        <Skeleton className="h-7 w-64" />
      </div>
      <Skeleton className="mb-2 h-4 w-40" />
      <MetricGridSkeleton count={10} />
      <Skeleton className="mb-2 mt-6 h-4 w-32" />
      <MetricGridSkeleton count={8} />
    </output>
  );
}
