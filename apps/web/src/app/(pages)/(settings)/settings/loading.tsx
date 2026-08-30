import { Skeleton } from "@/components/ui/skeleton";
import SettingsLinkListCardSkeleton from "@/settings/molecules/SettingsLinkListCardSkeleton";
import SettingsPromotionCardSkeleton from "@/settings/molecules/SettingsPromotionCardSkeleton";

export default function Loading() {
  return (
    <>
      <div className="w-full flex md:hidden flex-col gap-4">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i.toLocaleString()} className="flex items-center gap-3">
            <Skeleton className="h-8 w-8 rounded-md" />
            <Skeleton className="h-4 w-32" />
          </div>
        ))}
      </div>

      <div className="w-full flex-col gap-14 hidden lg:flex">
        <SettingsPromotionCardSkeleton />
        <SettingsLinkListCardSkeleton rows={2} />
      </div>
    </>
  );
}
