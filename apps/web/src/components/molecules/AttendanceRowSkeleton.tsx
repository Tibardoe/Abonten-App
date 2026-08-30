import { Skeleton } from "@/components/ui/skeleton";

export default function AttendanceRowSkeleton() {
  return (
    <li className="border border-border bg-card rounded-md shadow-md p-4 space-y-3">
      <div className="flex justify-between items-center">
        <Skeleton className="h-5 w-36" />
        <Skeleton className="h-4 w-20" />
      </div>

      <Skeleton className="h-4 w-44" />
      <Skeleton className="h-4 w-28" />
    </li>
  );
}
