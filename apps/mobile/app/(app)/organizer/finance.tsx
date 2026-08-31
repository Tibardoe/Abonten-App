import {
  flattenOrganizerLedger,
  useOrganizerFinance,
  useOrganizerLedger,
} from "@/features/organizer/useOrganizer";
import type {
  OrganizerFinanceOverviewRow,
  OrganizerLedgerTransactionRow,
} from "@abonten/api-client";
import { formatDateWithSuffix } from "@abonten/core/dateFormatter";
import { useCallback } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  Text,
  View,
} from "react-native";

const LINE_LABEL: Record<OrganizerLedgerTransactionRow["line"], string> = {
  ticket_sale: "Ticket sale",
  platform_fee: "Service fee",
  refund: "Refund",
  refund_release: "Refund released",
  payout: "Payout",
  payout_release: "Payout released",
};

function amount(currency: string, value: number): string {
  const sign = value < 0 ? "−" : "";
  return `${sign}${currency} ${Math.abs(value).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function BalanceCard({ row }: { row: OrganizerFinanceOverviewRow }) {
  return (
    <View className="gap-3 rounded-xl border border-border bg-card p-4">
      <View className="flex-row items-center justify-between">
        <Text className="text-xs uppercase text-muted-foreground">
          Available ({row.currency})
        </Text>
        <Text className="text-xl font-bold text-foreground">
          {amount(row.currency, row.available_balance)}
        </Text>
      </View>
      <View className="flex-row justify-between">
        <Text className="text-xs text-muted-foreground">Pending</Text>
        <Text className="text-xs text-foreground">
          {amount(row.currency, row.pending_balance)}
        </Text>
      </View>
      <View className="flex-row justify-between">
        <Text className="text-xs text-muted-foreground">Total earned</Text>
        <Text className="text-xs text-foreground">
          {amount(row.currency, row.total_earnings)}
        </Text>
      </View>
    </View>
  );
}

function LedgerRow({ row }: { row: OrganizerLedgerTransactionRow }) {
  return (
    <View className="flex-row items-center justify-between gap-3 rounded-xl border border-border bg-card px-3 py-3">
      <View className="flex-1 gap-0.5">
        <Text className="text-sm font-medium text-foreground" numberOfLines={1}>
          {LINE_LABEL[row.line] ?? row.line}
        </Text>
        <Text className="text-xs text-muted-foreground" numberOfLines={1}>
          {row.event_title ?? row.reference ?? "—"}
        </Text>
        <Text className="text-[10px] text-muted-foreground">
          {formatDateWithSuffix(row.created_at)} · {row.status}
        </Text>
      </View>
      <Text
        className={
          row.amount < 0
            ? "text-sm font-semibold text-destructive"
            : "text-sm font-semibold text-foreground"
        }
      >
        {amount(row.currency, row.amount)}
      </Text>
    </View>
  );
}

export default function OrganizerFinanceScreen() {
  const finance = useOrganizerFinance();
  const ledger = useOrganizerLedger();

  const balances: OrganizerFinanceOverviewRow[] =
    finance.data && finance.data.status === 200 ? finance.data.data : [];
  const rows = flattenOrganizerLedger(ledger.data?.pages);
  const ledgerFailed =
    ledger.isError ||
    (ledger.data?.pages[0] && ledger.data.pages[0].status >= 400);

  const onEndReached = useCallback(() => {
    if (ledger.hasNextPage && !ledger.isFetchingNextPage)
      ledger.fetchNextPage();
  }, [ledger]);

  const header = (
    <View className="gap-4 pb-2">
      {finance.isLoading ? (
        <View className="items-center py-8">
          <ActivityIndicator />
        </View>
      ) : balances.length === 0 ? (
        <View className="rounded-xl border border-border bg-card p-4">
          <Text className="text-sm text-muted-foreground">
            {finance.isError
              ? "Couldn't load your balance."
              : "No earnings yet."}
          </Text>
        </View>
      ) : (
        balances.map((b) => <BalanceCard key={b.currency} row={b} />)
      )}
      <Text className="pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Transactions
      </Text>
    </View>
  );

  return (
    <FlatList
      className="flex-1 bg-background"
      data={rows}
      keyExtractor={(r) => r.entry_id}
      renderItem={({ item }) => <LedgerRow row={item} />}
      ListHeaderComponent={header}
      contentContainerClassName="gap-3 p-4 pb-16"
      onEndReached={onEndReached}
      onEndReachedThreshold={0.5}
      refreshControl={
        <RefreshControl
          refreshing={
            (finance.isRefetching || ledger.isRefetching) &&
            !ledger.isFetchingNextPage
          }
          onRefresh={() => {
            finance.refetch();
            ledger.refetch();
          }}
        />
      }
      ListEmptyComponent={
        ledger.isLoading ? (
          <ActivityIndicator className="my-4" />
        ) : (
          <Text className="mt-6 text-center text-sm text-muted-foreground">
            {ledgerFailed ? "Couldn't load transactions." : "No transactions."}
          </Text>
        )
      }
      ListFooterComponent={
        ledger.isFetchingNextPage ? (
          <ActivityIndicator className="my-4" />
        ) : null
      }
    />
  );
}
