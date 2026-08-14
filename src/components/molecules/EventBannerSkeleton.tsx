import { Skeleton } from "@/components/ui/skeleton";

export default function EventBannerSkeleton() {
  return (
    <div className="relative w-full h-[250px] md:h-[350px] rounded-xl overflow-hidden">
      <Skeleton className="absolute inset-0 rounded-none" />

      <div className="relative h-full flex flex-col justify-end p-3 xs:p-4 sm:p-5 md:p-6 lg:p-8">
        <Skeleton className="absolute top-2 right-2 xs:top-3 xs:right-3 sm:top-4 sm:right-4 md:top-5 md:right-5 lg:top-6 lg:right-6 h-6 w-24 rounded-full" />

        <div className="w-fit space-y-2 md:space-y-3">
          <Skeleton className="h-5 w-32 rounded-full" />
          <Skeleton className="h-8 md:h-10 w-64 md:w-96" />

          <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-4">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-20" />
          </div>

          <div className="mt-3 flex md:flex-col md:items-start items-center justify-between gap-2">
            <Skeleton className="h-8 w-28 rounded-full" />
            <Skeleton className="h-9 w-32 rounded-md" />
          </div>
        </div>
      </div>
    </div>
  );
}
