import { Skeleton } from "@/components/ui/skeleton";
import DetailsContainer from "@/settings/atoms/DetailsContainer";

export default function SettingsPromotionCardSkeleton() {
  return (
    <div className="space-y-2">
      <Skeleton className="h-5 w-28" />

      <DetailsContainer>
        <div className="space-y-2">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-4 w-48" />
        </div>

        <hr className="border-border" />

        <div className="flex justify-between items-center">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-6 w-6 rounded-full" />
        </div>
      </DetailsContainer>
    </div>
  );
}
