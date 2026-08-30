import { Skeleton } from "@/components/ui/skeleton";

export default function AnalyticsRowsSkeleton({ count }: { count: number }) {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i.toLocaleString()}
          className="border border-border bg-card rounded-md shadow-md p-4 space-y-2"
        >
          <div className="flex justify-between items-center">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-4 w-16" />
          </div>
          <Skeleton className="h-2 w-full" />
        </div>
      ))}
    </div>
  );
}
