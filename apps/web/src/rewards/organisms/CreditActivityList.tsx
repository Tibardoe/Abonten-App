"use client";

import InfiniteList from "@/components/organisms/InfiniteList";
import type { PaginatedResult } from "@abonten/types/pagination";
import type { CreditActivityItem } from "@abonten/types/rewards";
import { useTranslations } from "next-intl";
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
  const t = useTranslations("rewards");

  return (
    <InfiniteList
      queryKey={["credit-activity"]}
      initialPage={initialPage}
      fetchPage={fetchPage}
      emptyState={
        <p className="py-8 text-center text-sm text-muted-foreground">
          {t("noCreditActivityYetCreditYou")}
        </p>
      }
      renderItem={(item: CreditActivityItem) => (
        <CreditActivityRow key={item.id} item={item} />
      )}
    />
  );
}
