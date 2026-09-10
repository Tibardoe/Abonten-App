"use client";

import InfiniteList from "@/components/organisms/InfiniteList";
import type { PaginatedResult } from "@abonten/types/pagination";
import type { CreditActivityItem } from "@abonten/types/rewards";
import CreditActivityRow from "../molecules/CreditActivityRow";

export default function CreditActivityList({
  initialPage,
  fetchPage,
}: {
  initialPage: PaginatedResult<CreditActivityItem> | null;
  fetchPage: (
    cursor: string | null,
  ) => Promise<PaginatedResult<CreditActivityItem>>;
}) {
  return (
    <InfiniteList
      queryKey={["credit-activity"]}
      initialPage={initialPage}
      fetchPage={fetchPage}
      emptyState={
        <p className="py-8 text-center text-sm text-muted-foreground">
          No credit activity yet. Credit you earn or receive will show up here.
        </p>
      }
      renderItem={(item: CreditActivityItem) => (
        <CreditActivityRow key={item.id} item={item} />
      )}
    />
  );
}
