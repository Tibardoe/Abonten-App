import { Skeleton } from "@/components/ui/skeleton";

function DetailRowSkeleton() {
  return (
    <div className="flex justify-between items-center">
      <Skeleton className="h-4 w-28" />
      <Skeleton className="h-4 w-32" />
    </div>
  );
}

export default function TransactionDetailSkeleton() {
  return (
    <div className="space-y-10 mb-5 md:mb-0 w-full">
      <div className="flex justify-between items-center bg-muted rounded-md p-5">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-4 w-20" />
      </div>

      <div className="flex gap-3 bg-muted rounded-md p-5">
        <Skeleton className="h-8 w-8 rounded-full shrink-0" />
        <div className="space-y-2 flex-1">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-3 w-36" />
        </div>
      </div>

      <div className="bg-muted rounded-md p-5 space-y-5">
        <DetailRowSkeleton />
        <DetailRowSkeleton />
        <DetailRowSkeleton />
        <DetailRowSkeleton />
        <DetailRowSkeleton />
        <DetailRowSkeleton />
      </div>
    </div>
  );
}
