import { Skeleton } from "@/components/ui/skeleton";
import HighlightsRowSkeleton from "@/userAccount/molecules/HighlightsRowSkeleton";

function StatSkeleton() {
  return (
    <span className="flex flex-col gap-1">
      <Skeleton className="h-4 w-6" />
      <Skeleton className="h-3 w-14" />
    </span>
  );
}

function TabsSkeleton() {
  return (
    <div className="w-full flex justify-center items-center flex-col border-t border-border pt-3">
      <div className="flex gap-5">
        <Skeleton className="h-5 w-14" />
        <Skeleton className="h-5 w-16" />
        <Skeleton className="h-5 w-16" />
      </div>
    </div>
  );
}

export default function ProfileHeaderSkeleton() {
  return (
    <>
      {/* On mobile */}
      <div className="md:hidden flex flex-col gap-7">
        <div className="flex w-full justify-between">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-8 w-8 rounded-full" />
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-start gap-4">
            <Skeleton className="w-[110px] h-[110px] rounded-full shrink-0" />

            <div className="flex flex-col justify-start w-full gap-3">
              <Skeleton className="h-5 w-36" />

              <div className="flex justify-between">
                <StatSkeleton />
                <StatSkeleton />
                <StatSkeleton />
              </div>
            </div>
          </div>

          <div className="w-full space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        </div>

        <Skeleton className="h-9 w-full rounded-md" />

        <div className="flex flex-col gap-3">
          <Skeleton className="h-5 w-24" />
          <HighlightsRowSkeleton />
        </div>

        <TabsSkeleton />
      </div>

      {/* On tablet and desktop */}
      <div className="hidden md:flex flex-col gap-7">
        <div className="hidden md:flex gap-10 items-start w-[50%]">
          <Skeleton className="w-[150px] h-[150px] rounded-full shrink-0" />

          <div className="grid grid-cols-3 gap-3 justify-start items-center w-full">
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-9 w-full rounded-md" />
            <Skeleton className="h-8 w-8 rounded-full justify-self-end" />

            <StatSkeleton />
            <StatSkeleton />
            <StatSkeleton />

            <div className="col-span-3 space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <Skeleton className="h-5 w-24" />
          <HighlightsRowSkeleton />
        </div>

        <TabsSkeleton />
      </div>
    </>
  );
}
