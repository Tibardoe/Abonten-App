import MobileSettingsHeaderNavSkeleton from "@/components/molecules/MobileSettingsHeaderNavSkeleton";
import { Skeleton } from "@/components/ui/skeleton";
import DetailsContainer from "@/settings/atoms/DetailsContainer";
import SettingsPlanCardSkeleton from "@/settings/molecules/SettingsPlanCardSkeleton";

export default function Loading() {
  return (
    <div className="w-full flex flex-col gap-10">
      <MobileSettingsHeaderNavSkeleton />

      <SettingsPlanCardSkeleton />

      <div className="space-y-2 mb-5">
        <Skeleton className="h-5 w-28" />

        <DetailsContainer>
          <div className="flex flex-col gap-3">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-4 w-36" />
            <div className="flex gap-3 items-center">
              <Skeleton className="w-10 h-10 rounded-md" />
              <Skeleton className="h-4 w-32" />
            </div>
          </div>

          <hr className="border-border" />

          <div className="flex justify-between items-center">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-6 w-6 rounded-full" />
          </div>
        </DetailsContainer>

        <Skeleton className="h-11 w-full rounded-md" />
      </div>
    </div>
  );
}
