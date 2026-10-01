import OrderSummarySkeleton from "@/components/molecules/OrderSummarySkeleton";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="flex flex-col justify-center gap-5">
      <div className="space-y-2">
        <Skeleton className="h-7 w-24" />
        <Skeleton className="h-4 w-full max-w-md" />
      </div>

      <OrderSummarySkeleton />

      <Skeleton className="h-11 w-full rounded-md" />
    </div>
  );
}
