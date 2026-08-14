import TicketCardSkeleton from "@/components/molecules/TicketCardSkeleton";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-5">
      <Skeleton className="h-7 w-32" />

      <div className="grid md:grid-cols-3 gap-6">
        {Array.from({ length: 6 }, (_, i) => (
          <TicketCardSkeleton key={i.toLocaleString()} />
        ))}
      </div>
    </div>
  );
}
