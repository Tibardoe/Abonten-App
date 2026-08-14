import MobileSettingsHeaderNavSkeleton from "@/components/molecules/MobileSettingsHeaderNavSkeleton";
import EditProfileHeaderSkeleton from "@/settings/molecules/EditProfileHeaderSkeleton";

export default function Loading() {
  return (
    <div className="w-full flex flex-col gap-10">
      <MobileSettingsHeaderNavSkeleton />
      <EditProfileHeaderSkeleton />
    </div>
  );
}
