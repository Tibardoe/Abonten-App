import BackButton from "@/components/atoms/BackButton";
import { Skeleton } from "@/components/ui/skeleton";

export default function PageHeaderSkeleton() {
  return (
    <div className="flex items-center w-full">
      <BackButton />
      <Skeleton className="mx-auto h-6 w-32" />
    </div>
  );
}
