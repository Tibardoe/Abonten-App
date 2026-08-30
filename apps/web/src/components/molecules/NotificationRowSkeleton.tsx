import { Skeleton } from "@/components/ui/skeleton";

export default function NotificationRowSkeleton() {
  return (
    <li className="flex items-start gap-2 border-b border-border px-4 py-3 last:border-0">
      <Skeleton className="mt-1.5 h-2 w-2 shrink-0 rounded-full" />

      <div className="flex-1 min-w-0 space-y-1.5">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-16" />
      </div>
    </li>
  );
}
