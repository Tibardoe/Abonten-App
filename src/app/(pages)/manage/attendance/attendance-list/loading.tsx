import AttendanceRowSkeleton from "@/components/molecules/AttendanceRowSkeleton";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="flex flex-col gap-5">
      <Skeleton className="h-6 w-48" />

      <ul className="flex flex-col gap-2 mb-5">
        {Array.from({ length: 6 }, (_, i) => (
          <AttendanceRowSkeleton key={i.toLocaleString()} />
        ))}
      </ul>
    </div>
  );
}
