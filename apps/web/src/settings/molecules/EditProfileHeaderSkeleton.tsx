import { Skeleton } from "@/components/ui/skeleton";

export default function EditProfileHeaderSkeleton() {
  return (
    <div className="space-y-10 md:space-y-16">
      <div className="flex justify-between items-center bg-muted rounded-xl p-3 md:p-5">
        <div className="flex gap-3 items-center">
          <Skeleton className="w-20 h-20 rounded-full shrink-0" />
          <div className="space-y-2">
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-4 w-36" />
          </div>
        </div>

        <Skeleton className="h-9 w-24 rounded-md hidden md:block" />
      </div>

      <div className="flex flex-col gap-5">
        <Skeleton className="h-14 w-full rounded-md" />
        <Skeleton className="h-14 w-full rounded-md" />
        <Skeleton className="h-14 w-full rounded-md" />
        <Skeleton className="h-14 w-full rounded-md" />
        <Skeleton className="h-9 w-24 self-end rounded-md" />
      </div>
    </div>
  );
}
