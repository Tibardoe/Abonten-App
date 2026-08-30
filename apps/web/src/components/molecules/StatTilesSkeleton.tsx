import { Skeleton } from "@/components/ui/skeleton";

export default function StatTilesSkeleton({ count }: { count: number }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i.toLocaleString()}
          className="border border-border bg-card rounded-md shadow-md p-4 space-y-2"
        >
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-7 w-16" />
        </div>
      ))}
    </div>
  );
}
