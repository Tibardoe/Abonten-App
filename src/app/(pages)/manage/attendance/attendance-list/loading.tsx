import AttendanceRowSkeleton from "@/components/molecules/AttendanceRowSkeleton";
import StatTilesSkeleton from "@/components/molecules/StatTilesSkeleton";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-6">
        <Skeleton className="h-7 w-64" />
        <StatTilesSkeleton count={6} />
      </div>

      <Skeleton className="h-6 w-48" />

      <ul className="flex flex-col gap-2 mb-5">
        {Array.from({ length: 6 }, (_, i) => (
          <AttendanceRowSkeleton key={i.toLocaleString()} />
        ))}
      </ul>
    </div>
  );
}
