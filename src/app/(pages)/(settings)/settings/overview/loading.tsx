import MobileSettingsHeaderNavSkeleton from "@/components/molecules/MobileSettingsHeaderNavSkeleton";
import SettingsLinkListCardSkeleton from "@/settings/molecules/SettingsLinkListCardSkeleton";
import SettingsPlanCardSkeleton from "@/settings/molecules/SettingsPlanCardSkeleton";

export default function Loading() {
  return (
    <div className="w-full flex flex-col gap-10">
      <MobileSettingsHeaderNavSkeleton />
      <SettingsPlanCardSkeleton />
      <SettingsLinkListCardSkeleton rows={3} />
    </div>
  );
}
