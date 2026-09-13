import {
  ChartSkeleton,
  MetricGridSkeleton,
  Skeleton,
} from "@/components/metrics/Skeleton";

export default function AnalyticsLoading() {
  return (
    <output aria-live="polite" className="block">
      <span className="sr-only">Loading analytics…</span>
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <Skeleton className="h-6 w-52" />
          <Skeleton className="mt-2 h-4 w-96" />
        </div>
        <Skeleton className="h-7 w-64" />
      </div>
      <MetricGridSkeleton count={8} />
      <div className="mt-6 grid gap-3 lg:grid-cols-2">
        <ChartSkeleton />
        <ChartSkeleton />
      </div>
    </output>
  );
}
