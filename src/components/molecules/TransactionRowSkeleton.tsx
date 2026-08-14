import { Skeleton } from "@/components/ui/skeleton";

export default function TransactionRowSkeleton() {
  return (
    <div className="flex justify-between border-b border-border py-5">
      <div className="space-y-2">
        <Skeleton className="h-5 w-36" />
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-4 w-24" />
      </div>

      <div className="flex items-center gap-2 md:gap-3">
        <Skeleton className="h-5 w-16" />
        <Skeleton className="h-6 w-6 rounded-full" />
      </div>
    </div>
  );
}
