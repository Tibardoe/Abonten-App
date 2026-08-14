import { Skeleton } from "@/components/ui/skeleton";
import DetailsContainer from "@/settings/atoms/DetailsContainer";
import { Fragment } from "react";

function LinkRowSkeleton() {
  return (
    <div className="flex justify-between items-center">
      <Skeleton className="h-4 w-36" />
      <Skeleton className="h-6 w-6 rounded-full" />
    </div>
  );
}

export default function SettingsLinkListCardSkeleton({
  rows = 2,
}: {
  rows?: number;
}) {
  return (
    <div className="space-y-2">
      <Skeleton className="h-5 w-28" />

      <DetailsContainer>
        {Array.from({ length: rows }, (_, i) => (
          <Fragment key={i.toLocaleString()}>
            {i > 0 && <hr className="border-border" />}
            <LinkRowSkeleton />
          </Fragment>
        ))}
      </DetailsContainer>
    </div>
  );
}
