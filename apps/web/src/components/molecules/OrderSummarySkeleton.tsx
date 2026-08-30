import { Skeleton } from "@/components/ui/skeleton";

export default function OrderSummarySkeleton() {
  return (
    <div className="border border-border rounded-2xl shadow-lg p-6 space-y-4 bg-card">
      <div className="flex justify-between items-center">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-4 w-20" />
      </div>

      <div className="flex justify-between border-b border-border pb-2">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-4 w-36" />
      </div>

      <div className="border border-border rounded-md px-4 py-3 bg-muted space-y-2">
        <div className="flex justify-between">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-12" />
        </div>
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-full" />
      </div>

      <div className="flex justify-between pt-2 border-t border-border">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-5 w-20" />
      </div>
    </div>
  );
}
