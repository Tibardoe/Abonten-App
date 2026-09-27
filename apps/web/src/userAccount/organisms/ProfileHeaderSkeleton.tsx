import { Skeleton } from "@/components/ui/skeleton";

function TabsSkeleton() {
  return (
    <div className="w-full flex justify-center items-center flex-col border-t border-border pt-3">
      <div className="flex gap-5">
        <Skeleton className="h-5 w-14" />
        <Skeleton className="h-5 w-16" />
        <Skeleton className="h-5 w-16" />
      </div>
    </div>
  );
}

// Mirrors ProfileDetails' single responsive layout: avatar, then name,
// handle, stats and actions.
export default function ProfileHeaderSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:gap-8">
        <Skeleton className="h-28 w-28 shrink-0 rounded-full" />

        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="space-y-2">
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-4 w-28" />
          </div>
          <div className="flex gap-6">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-24" />
          </div>
          <div className="flex gap-2 pt-1">
            <Skeleton className="h-9 w-24 rounded-full" />
            <Skeleton className="h-9 w-32 rounded-full" />
          </div>
        </div>
      </div>

      <TabsSkeleton />
    </div>
  );
}
