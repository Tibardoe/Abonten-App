"use client";

import getOrganizerFinanceOverview from "@/actions/getOrganizerFinanceOverview";
import InlineErrorRetry from "@/components/molecules/InlineErrorRetry";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useMarketContext } from "@/hooks/useMarketContext";
import { invalidateOrganizerFinanceQueries } from "@/utils/mutationQueryInvalidation";
import { answerOrThrow } from "@abonten/core/envelopeFailure";
import { formatMoney } from "@abonten/core/formatMoney";
import type { OrganizerFinanceOverviewRow } from "@abonten/types/organizerFinance";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import PendingEarningsList from "../molecules/PendingEarningsList";
import PromotionCreditCard from "../molecules/PromotionCreditCard";
import RefundSummary from "../molecules/RefundSummary";
import WithdrawModal from "../molecules/WithdrawModal";

export const ORGANIZER_FINANCE_OVERVIEW_QUERY_KEY = [
  "organizer-finance-overview",
];

type FinancesOverviewProps = {
  /** Left out when the server could not read it: the balance loads here. */
  initialOverview?: OrganizerFinanceOverviewRow[];
};

/**
 * "How much money can I withdraw right now?" — the main question this page
 * answers immediately. Reads the same getOrganizerFinanceOverview action the
 * Dashboard summary and Event Insights use, so these figures can never
 * disagree. Cross-currency organizers are rare (this schema has no
 * cross-currency aggregation anywhere else either — see
 * add_currency_to_event_overview_analytics_v2's comment) so the first
 * currency row drives the primary tiles/Withdraw button, matching the
 * Dashboard's existing "primaryCurrency" convention; any additional
 * currencies still get their own summary line underneath.
 */
export default function FinancesOverview({
  initialOverview,
}: FinancesOverviewProps) {
  const locale = useLocale();
  const t = useTranslations("finances");

  const queryClient = useQueryClient();
  const [isWithdrawOpen, setIsWithdrawOpen] = useState(false);

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ORGANIZER_FINANCE_OVERVIEW_QUERY_KEY,
    queryFn: async () => {
      const response = answerOrThrow(await getOrganizerFinanceOverview());
      return response.status === 200 ? response.data : [];
    },
    initialData: initialOverview,
    staleTime: 20_000,
  });

  const { market } = useMarketContext();
  const rows = data ?? [];
  const primary = rows[0] ?? {
    // No earnings yet: zero, shown in the market's currency ("GH₵0.00"),
    // not as a bare "0.00".
    currency: market?.defaultCurrency ?? "",
    pending_balance: 0,
    available_balance: 0,
    total_earnings: 0,
  };
  const otherCurrencies = rows.slice(1);

  const invalidateAll = () => invalidateOrganizerFinanceQueries(queryClient);

  if (isPending) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    );
  }

  // A balance that could not be read is not a balance of zero.
  if (isError && !data) {
    return (
      <InlineErrorRetry
        message={t("couldnTLoadYourBalance")}
        onRetry={() => refetch()}
      />
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <section className="rounded-2xl border border-border bg-card text-card-foreground p-5 md:p-6 space-y-4">
        <div>
          <p className="text-sm text-muted-foreground">
            {t("availableToWithdraw")}
          </p>
          <p className="font-bold text-2xl md:text-3xl">
            {formatMoney(primary.currency, primary.available_balance, {
              locale,
            })}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {t("moneyAvailableAfterEligibleEventProceeds")}
          </p>
        </div>

        {primary.available_balance > 0 && (
          <Button
            type="button"
            onClick={() => setIsWithdrawOpen(true)}
            className="font-semibold rounded-md px-6 py-5"
          >
            {t("withdraw")}
          </Button>
        )}

        <div className="grid grid-cols-2 gap-4 pt-2 border-t border-border">
          <div>
            <p className="text-sm text-muted-foreground">{t("pending2")}</p>
            <p className="font-semibold text-lg">
              {formatMoney(primary.currency, primary.pending_balance, {
                locale,
              })}
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">
              {t("totalEarnings")}
            </p>
            <p className="font-semibold text-lg">
              {formatMoney(primary.currency, primary.total_earnings, {
                locale,
              })}
            </p>
          </div>
        </div>

        {otherCurrencies.length > 0 && (
          <div className="pt-2 border-t border-border space-y-1">
            {otherCurrencies.map((row) => (
              <p key={row.currency} className="text-xs text-muted-foreground">
                {t("availablePending", {
                  currency: row.currency,
                  available: formatMoney(row.currency, row.available_balance, {
                    locale,
                  }),
                  pending: formatMoney(row.currency, row.pending_balance, {
                    locale,
                  }),
                })}
              </p>
            ))}
          </div>
        )}
      </section>

      <PromotionCreditCard />
      <PendingEarningsList />
      <RefundSummary />

      {isWithdrawOpen && (
        <WithdrawModal
          availableBalance={primary.available_balance}
          currency={primary.currency}
          onClose={() => setIsWithdrawOpen(false)}
          onSuccess={invalidateAll}
          onBalanceStale={invalidateAll}
        />
      )}
    </div>
  );
}
