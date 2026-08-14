import { Skeleton } from "@/components/ui/skeleton";

export default function EventCardSkeleton() {
  return (
    <li className="overflow-hidden rounded-xl shadow-lg bg-card border border-border">
      <Skeleton className="h-64 w-full rounded-none" />

      <div className="p-5 space-y-3">
        <div className="flex justify-between items-start gap-3">
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-5 w-5 shrink-0 rounded-full" />
        </div>

        <div className="space-y-2.5">
          <Skeleton className="h-4 w-full" />

          <div className="flex flex-wrap gap-x-4 gap-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-20" />
          </div>

          <div className="flex flex-wrap justify-between gap-2 pt-1">
            <div className="flex items-center gap-2">
              <Skeleton className="h-6 w-16 rounded-full" />
              <Skeleton className="h-6 w-20 rounded-full" />
            </div>

            <Skeleton className="h-7 w-20 rounded-full" />
          </div>
        </div>
      </div>
    </li>
  );
}
