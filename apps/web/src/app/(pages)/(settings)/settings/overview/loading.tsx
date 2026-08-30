import PageHeaderSkeleton from "@/components/molecules/PageHeaderSkeleton";
import SettingsLinkListCardSkeleton from "@/settings/molecules/SettingsLinkListCardSkeleton";
import SettingsPromotionCardSkeleton from "@/settings/molecules/SettingsPromotionCardSkeleton";

export default function Loading() {
  return (
    <div className="w-full flex flex-col gap-10">
      <PageHeaderSkeleton />
      <SettingsPromotionCardSkeleton />
      <SettingsLinkListCardSkeleton rows={2} />
    </div>
  );
}
