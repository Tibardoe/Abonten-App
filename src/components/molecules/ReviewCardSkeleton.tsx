import { Skeleton } from "@/components/ui/skeleton";

export default function ReviewCardSkeleton() {
  return (
    <li className="w-full bg-card shadow-sm rounded-xl p-5 flex flex-col gap-3 border border-border">
      <div className="flex justify-between items-center">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-4 w-24" />
      </div>

      <div className="space-y-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-20" />
      </div>
    </li>
  );
}
