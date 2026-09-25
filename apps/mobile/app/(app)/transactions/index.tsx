import { QueryUnavailable } from "@/components/app/QueryUnavailable";
import { TransactionsSkeleton } from "@/components/skeletons";
import {
  useTransactionHistory,
  useTransactionSummary,
} from "@/features/transactions/useTransactions";
import { useQueryView } from "@/lib/useQueryView";
import { formatMoney } from "@abonten/core/formatMoney";
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
  Icon,
  Refresher,
  Spinner,
  StatusPill,
} from "@abonten/ui-native";
import { useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { FlatList, Pressable, ScrollView, View } from "react-native";

// Native echo of the web /transactions page: a period filter, summary
// tiles, and the merged ticket + subscription history timeline. Status
// treatment (and the refund sub-status) come from the shared StatusPill /
// resolveStatus system, so "Pending" / "Failed" / "Refunded" here look
// identical to the same states on Finances and the Tickets screen.

const PERIODS: TransactionPeriod[] = [
  "today",
  "thisMonth",
  "lastMonth",
  "last3Months",
  "all",
];

function money(amount: number, currency: string) {
  return formatMoney(currency, Number(amount ?? 0));
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <Card padded className="flex-1">
      <AppText variant="caption">{label}</AppText>
      <AppText variant="bodyStrong">{value}</AppText>
    </Card>
  );
}

function TransactionRow({
  row,
  onPress,
}: {
  row: UserTransactionRow;
  onPress: () => void;
}) {
  const hasRefund = !!row.refund_status && row.refund_status !== "none";
  // A cancelled ticket whose transaction still reads "successful" but has a
  // refund request on file = the refund attempt failed (see refundStatus.ts).
  const refundLabel =
    row.refund_status === "refunded"
      ? "Refund issued"
      : row.refund_status === "refund_pending"
        ? "Refund pending"
        : row.refund_status === "successful" && row.refund_requested_at
          ? "Refund failed"
          : undefined;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${
        row.title ??
        (row.kind === "ticket" ? "Ticket purchase" : "Subscription")
      }, ${money(row.total_paid ?? row.amount, row.currency)}, ${row.status}`}
      className="gap-2 rounded-2xl border border-border bg-card p-3 active:opacity-90"
    >
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1 flex-row items-start gap-2">
          <Icon
            name={row.kind === "ticket" ? "ticket-outline" : "repeat-outline"}
            size={16}
            tone="muted"
            style={{ marginTop: 2 }}
          />
          <View className="flex-1">
            <AppText variant="bodyStrong" numberOfLines={1}>
              {row.title ??
                (row.kind === "ticket" ? "Ticket purchase" : "Subscription")}
            </AppText>
            <AppText variant="caption" numberOfLines={1}>
              {row.subtitle ?? row.reference}
            </AppText>
          </View>
        </View>
        <View className="items-end">
          <AppText variant="bodyStrong">
            {money(row.total_paid ?? row.amount, row.currency)}
          </AppText>
          {row.credit_used ? (
            <AppText variant="caption">
              incl. {money(Number(row.credit_used), row.currency)} credit
            </AppText>
          ) : null}
        </View>
      </View>
      <View className="flex-row items-center justify-between">
        <View className="flex-row flex-wrap items-center gap-1.5">
          <StatusPill status={row.status} size="sm" />
          {hasRefund && refundLabel ? (
            <StatusPill
              status={row.refund_status ?? ""}
              options={{ label: refundLabel }}
              size="sm"
            />
          ) : null}
        </View>
        <AppText variant="caption">
          {new Date(row.created_at).toLocaleDateString()}
        </AppText>
      </View>
    </Pressable>
  );
}

export default function Transactions() {
  const router = useRouter();
  const [period, setPeriod] = useState<TransactionPeriod>("thisMonth");
  const summaryQuery = useTransactionSummary(period);
  const historyQuery = useTransactionHistory(period);

  const rows =
    historyQuery.data?.pages.flatMap((p) => p.rows as UserTransactionRow[]) ??
    [];
  const summary = summaryQuery.data?.[0];
  // Loading, offline and failed are told apart from "nothing in this
  // period": the empty state is only ever said for an answer the server
  // gave. Transactions are never cached on disk (money), so offline with
  // nothing loaded this session shows the offline state, not zero rows.
  const historyView = useQueryView(historyQuery, () => rows.length === 0);

  const onEndReached = useCallback(() => {
    if (historyQuery.hasNextPage && !historyQuery.isFetchingNextPage)
      historyQuery.fetchNextPage();
  }, [historyQuery]);

  if (historyView.kind === "loading" && summaryQuery.data === undefined)
    return <TransactionsSkeleton />;

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

      {/* A figure is shown only when the summary actually loaded: a "0"
          for a summary the phone could not fetch would read as "you spent
          nothing". */}
      <View className="flex-row gap-3 px-4">
        <Tile
          label="Spent"
          value={
            summary
              ? money(summary.amount_spent ?? 0, summary.currency ?? "")
              : "—"
          }
        />
        <Tile
          label="Transactions"
          value={summary ? String(summary.total_transactions ?? 0) : "—"}
        />
      </View>
      <View className="flex-row gap-3 px-4">
        <Tile
          label="Tickets"
          value={summary ? String(summary.tickets_purchased ?? 0) : "—"}
        />
        <Tile
          label="Successful"
          value={summary ? String(summary.successful_count ?? 0) : "—"}
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
      renderItem={({ item }) => (
        <TransactionRow
          row={item}
          onPress={() =>
            router.push(`/(app)/transactions/${item.kind}/${item.id}`)
          }
        />
      )}
      onEndReached={onEndReached}
      onEndReachedThreshold={0.5}
      refreshControl={
        <Refresher
          onRefresh={() =>
            Promise.all([summaryQuery.refetch(), historyQuery.refetch()])
          }
        />
      }
      ListEmptyComponent={
        historyView.kind === "empty" ? (
          <EmptyState
            icon="swap-horizontal-outline"
            title="No transactions for this period"
            description="Purchases and promotions you pay for show up here."
          />
        ) : (
          <QueryUnavailable
            view={historyView}
            subject="your transactions"
            onRetry={() => historyQuery.refetch()}
            loading={<Spinner className="mt-6" />}
          />
        )
      }
      ListFooterComponent={historyQuery.isFetchingNextPage ? <Spinner /> : null}
    />
  );
}
