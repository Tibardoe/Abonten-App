import { Skeleton } from "@/components/ui/skeleton";

export default function TicketCardSkeleton() {
  return (
    <div className="bg-card rounded-2xl shadow-md overflow-hidden border border-border">
      <Skeleton className="h-48 w-full rounded-none" />

      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-20" />
        </div>

        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-4 w-16" />

        <div className="flex justify-between gap-2 pt-1">
          <Skeleton className="h-9 w-24 rounded-md" />
          <Skeleton className="h-9 w-24 rounded-md" />
        </div>
      </div>
    </div>
  );
}
