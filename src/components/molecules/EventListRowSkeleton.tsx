import { Skeleton } from "@/components/ui/skeleton";

export default function EventListRowSkeleton() {
  return (
    <li className="border border-border bg-card rounded-md shadow-md p-4 space-y-3">
      <div className="flex justify-between items-center">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-5 w-5 rounded-full" />
      </div>

      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-4 w-24" />
    </li>
  );
}
