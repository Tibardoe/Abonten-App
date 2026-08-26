import PageHeaderSkeleton from "@/components/molecules/PageHeaderSkeleton";
import EditProfileHeaderSkeleton from "@/settings/molecules/EditProfileHeaderSkeleton";

export default function Loading() {
  return (
    <div className="w-full flex flex-col gap-10">
      <PageHeaderSkeleton />
      <EditProfileHeaderSkeleton />
    </div>
  );
}
