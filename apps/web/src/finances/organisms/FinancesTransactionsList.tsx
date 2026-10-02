"use client";

import { getOrganizerLedgerTransactions } from "@/actions/getOrganizerLedgerTransactions";
import TransactionRowSkeleton from "@/components/molecules/TransactionRowSkeleton";
import InfiniteList from "@/components/organisms/InfiniteList";
import { actionUnreachable } from "@/utils/actionUnreachable";
import { formatSingleDateTime } from "@abonten/core/dateFormatter";
import { formatMoney } from "@abonten/core/formatMoney";
import type { OrganizerLedgerTransactionRow } from "@abonten/types/organizerFinance";
import type { PaginatedResult } from "@abonten/types/pagination";
import { useLocale, useTranslations } from "next-intl";
import FinanceLineIcon, {
  LINE_LABEL_KEYS,
  getFinanceStatusMeta,
} from "../atoms/FinanceLineIcon";

function TransactionsListSkeleton() {
  return (
    <ul>
      {Array.from({ length: 6 }, (_, i) => (
        <TransactionRowSkeleton key={i.toLocaleString()} />
      ))}
    </ul>
  );
}

// Positive lines (money coming in) are prefixed "+", negative lines
// (fees/refunds/payouts) show their natural minus sign — never relying on
// color alone, per the task's explicit "not color-only" requirement.
function formatSignedAmount(amount: number, currency: string, locale: string) {
  const sign = amount > 0 ? "+" : amount < 0 ? "-" : "";
  return `${sign}${formatMoney(currency, Math.abs(amount), { locale })}`;
}

type FinancesTransactionsListProps = {
  initialPage: PaginatedResult<OrganizerLedgerTransactionRow> | null;
};

export default function FinancesTransactionsList({
  initialPage,
}: FinancesTransactionsListProps) {
  const locale = useLocale();

  const t = useTranslations("finances");

  return (
    <InfiniteList
      queryKey={["organizer-ledger-transactions"]}
      initialPage={initialPage}
      fetchPage={(cursor) => getOrganizerLedgerTransactions({ cursor })}
      emptyState={
        <p className="text-sm text-muted-foreground py-8 text-center">
          {t("noFinancialTransactionsYet")}
        </p>
      }
      loadingSkeleton={<TransactionsListSkeleton />}
      renderItem={(item: OrganizerLedgerTransactionRow) => {
        const { date } = formatSingleDateTime(
          item.created_at,
          undefined,
          locale,
        );
        const statusLabel = t(getFinanceStatusMeta(item.status).labelKey);

        return (
          <li
            key={`${item.entry_id}-${item.line}`}
            className="flex justify-between border-b border-border py-5"
          >
            <div className="space-y-1">
              <h2 className="font-bold">{t(LINE_LABEL_KEYS[item.line])}</h2>
              {item.event_title && (
                <p className="text-sm font-bold text-muted-foreground">
                  {item.event_title}
                </p>
              )}
              <p className="text-sm text-muted-foreground">{date}</p>
              {item.reference && (
                <p className="text-xs text-muted-foreground font-mono">
                  {item.reference}
                </p>
              )}
            </div>

            <div className="flex items-center gap-2 md:gap-3 font-bold">
              <div className="text-right">
                <p>{formatSignedAmount(item.amount, item.currency, locale)}</p>
                <p className="text-xs font-medium text-muted-foreground">
                  {statusLabel}
                </p>
              </div>
              <span className="sr-only">{statusLabel}</span>
              <FinanceLineIcon status={item.status} />
            </div>
          </li>
        );
      }}
    />
  );
}
