import MobileSettingsHeaderNavSkeleton from "@/components/molecules/MobileSettingsHeaderNavSkeleton";
import SettingsLinkListCardSkeleton from "@/settings/molecules/SettingsLinkListCardSkeleton";
import SettingsPromotionCardSkeleton from "@/settings/molecules/SettingsPromotionCardSkeleton";

export default function Loading() {
  return (
    <div className="w-full flex flex-col gap-10">
      <MobileSettingsHeaderNavSkeleton />
      <SettingsPromotionCardSkeleton />
      <SettingsLinkListCardSkeleton rows={2} />
    </div>
  );
}
