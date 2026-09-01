import {
  useTransactionHistory,
  useTransactionSummary,
} from "@/features/transactions/useTransactions";
import {
  TRANSACTION_PERIOD_LABELS,
  type TransactionPeriod,
} from "@abonten/core/transactionsDateRange";
import type { UserTransactionRow } from "@abonten/types/transactions";
import {
  AppText,
  Card,
  Chip,
  EmptyState,
  ScreenLoader,
  Spinner,
} from "@abonten/ui-native";
import { useCallback, useState } from "react";
import { FlatList, ScrollView, View } from "react-native";

// Native echo of the web /transactions page: a period filter, summary
// tiles, and the merged ticket + subscription history timeline.

const PERIODS: TransactionPeriod[] = [
  "today",
  "thisMonth",
  "lastMonth",
  "last3Months",
  "all",
];

const STATUS_TONE: Record<string, string> = {
  paid: "text-primary",
  pending: "text-muted-foreground",
  failed: "text-destructive",
  cancelled: "text-destructive",
  expired: "text-muted-foreground",
};

function money(amount: number, currency: string) {
  return `${currency || "GHS"} ${Number(amount ?? 0).toLocaleString()}`;
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <Card padded className="flex-1">
      <AppText variant="caption">{label}</AppText>
      <AppText variant="bodyStrong">{value}</AppText>
    </Card>
  );
}

function TransactionRow({ row }: { row: UserTransactionRow }) {
  const refunded =
    !!row.refund_status && row.refund_status !== "none"
      ? ` · refund ${row.refund_status}`
      : "";
  return (
    <View className="gap-1 rounded-xl border border-border bg-card p-3">
      <View className="flex-row items-center justify-between">
        <AppText variant="bodyStrong" numberOfLines={1} className="flex-1">
          {row.title ??
            (row.kind === "ticket" ? "Ticket purchase" : "Subscription")}
        </AppText>
        <AppText variant="bodyStrong">
          {money(row.total_paid ?? row.amount, row.currency)}
        </AppText>
      </View>
      <AppText variant="caption" numberOfLines={1}>
        {row.subtitle ?? row.reference}
      </AppText>
      <View className="flex-row items-center justify-between">
        <AppText
          className={`text-[12px] font-medium ${STATUS_TONE[row.status] ?? "text-muted-foreground"}`}
        >
          {row.status}
          {refunded}
        </AppText>
        <AppText variant="caption">
          {new Date(row.created_at).toLocaleDateString()}
        </AppText>
      </View>
    </View>
  );
}

export default function Transactions() {
  const [period, setPeriod] = useState<TransactionPeriod>("thisMonth");
  const summaryQuery = useTransactionSummary(period);
  const historyQuery = useTransactionHistory(period);

  const rows =
    historyQuery.data?.pages.flatMap((p) => p.rows as UserTransactionRow[]) ??
    [];
  const summary = summaryQuery.data?.[0];

  const onEndReached = useCallback(() => {
    if (historyQuery.hasNextPage && !historyQuery.isFetchingNextPage)
      historyQuery.fetchNextPage();
  }, [historyQuery]);

  if (summaryQuery.isLoading && historyQuery.isLoading) return <ScreenLoader />;

  const header = (
    <View className="gap-4 pb-2">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="gap-2 px-4 pt-4"
      >
        {PERIODS.map((p) => (
          <Chip
            key={p}
            label={TRANSACTION_PERIOD_LABELS[p]}
            selected={period === p}
            onPress={() => setPeriod(p)}
          />
        ))}
      </ScrollView>

      <View className="flex-row gap-3 px-4">
        <Tile
          label="Spent"
          value={money(summary?.amount_spent ?? 0, summary?.currency ?? "GHS")}
        />
        <Tile
          label="Transactions"
          value={String(summary?.total_transactions ?? 0)}
        />
      </View>
      <View className="flex-row gap-3 px-4">
        <Tile label="Tickets" value={String(summary?.tickets_purchased ?? 0)} />
        <Tile
          label="Successful"
          value={String(summary?.successful_count ?? 0)}
        />
      </View>
    </View>
  );

  return (
    <FlatList
      className="flex-1 bg-background"
      data={rows}
      keyExtractor={(r) => r.id}
      ListHeaderComponent={header}
      contentContainerClassName="gap-3 px-4 pb-16"
      renderItem={({ item }) => <TransactionRow row={item} />}
      onEndReached={onEndReached}
      onEndReachedThreshold={0.5}
      ListEmptyComponent={
        historyQuery.isLoading ? (
          <Spinner className="mt-6" />
        ) : (
          <EmptyState
            icon="swap-horizontal-outline"
            title={
              historyQuery.isError
                ? "Couldn't load transactions"
                : "No transactions for this period"
            }
            description="Purchases and promotions you pay for show up here."
          />
        )
      }
      ListFooterComponent={historyQuery.isFetchingNextPage ? <Spinner /> : null}
    />
  );
}
