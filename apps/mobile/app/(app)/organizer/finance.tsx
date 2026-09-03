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
import { AppText, Chip, Overline } from "@abonten/ui-native";
import { Link } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  View,
} from "react-native";

function NavRow({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} asChild>
      <Pressable className="flex-row items-center justify-between rounded-xl border border-border bg-card px-4 py-3 active:opacity-80">
        <AppText className="text-sm text-foreground">{label}</AppText>
        <AppText className="text-muted-foreground">›</AppText>
      </Pressable>
    </Link>
  );
}

const LINE_LABEL: Record<OrganizerLedgerTransactionRow["line"], string> = {
  ticket_sale: "Ticket sale",
  platform_fee: "Service fee",
  refund: "Refund",
  refund_release: "Refund released",
  payout: "Payout",
  payout_release: "Payout released",
};

type LedgerFilter = "all" | "sales" | "fees" | "refunds" | "payouts";
const FILTERS: { key: LedgerFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "sales", label: "Sales" },
  { key: "fees", label: "Fees" },
  { key: "refunds", label: "Refunds" },
  { key: "payouts", label: "Payouts" },
];
const FILTER_LINES: Record<
  LedgerFilter,
  OrganizerLedgerTransactionRow["line"][] | null
> = {
  all: null,
  sales: ["ticket_sale"],
  fees: ["platform_fee"],
  refunds: ["refund", "refund_release"],
  payouts: ["payout", "payout_release"],
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
        <Overline>Available ({row.currency})</Overline>
        <AppText variant="screenTitle">
          {amount(row.currency, row.available_balance)}
        </AppText>
      </View>
      <View className="flex-row justify-between">
        <AppText variant="muted">Pending</AppText>
        <AppText variant="small">
          {amount(row.currency, row.pending_balance)}
        </AppText>
      </View>
      <View className="flex-row justify-between">
        <AppText variant="muted">Total earned</AppText>
        <AppText variant="small">
          {amount(row.currency, row.total_earnings)}
        </AppText>
      </View>
    </View>
  );
}

function LedgerRow({ row }: { row: OrganizerLedgerTransactionRow }) {
  return (
    <View className="flex-row items-center justify-between gap-3 rounded-xl border border-border bg-card px-3 py-3">
      <View className="flex-1 gap-0.5">
        <AppText
          className="text-sm font-medium text-foreground"
          numberOfLines={1}
        >
          {LINE_LABEL[row.line] ?? row.line}
        </AppText>
        <AppText
          className="text-[13px] text-muted-foreground"
          numberOfLines={1}
        >
          {row.event_title ?? row.reference ?? "—"}
        </AppText>
        <AppText variant="caption">
          {formatDateWithSuffix(row.created_at)} · {row.status}
        </AppText>
      </View>
      <AppText
        className={
          row.amount < 0
            ? "text-[15px] font-semibold text-destructive"
            : "text-[15px] font-semibold text-success"
        }
      >
        {amount(row.currency, row.amount)}
      </AppText>
    </View>
  );
}

export default function OrganizerFinanceScreen() {
  const finance = useOrganizerFinance();
  const ledger = useOrganizerLedger();
  const [filter, setFilter] = useState<LedgerFilter>("all");

  const balances: OrganizerFinanceOverviewRow[] =
    finance.data && finance.data.status === 200 ? finance.data.data : [];
  const allRows = flattenOrganizerLedger(ledger.data?.pages);
  const rows = useMemo(() => {
    // One ledger entry can surface as several transaction rows (a ticket
    // sale and its service fee share an entry_id), and keyset pages can
    // re-emit a boundary row. Collapse on (entry_id, line) so the list has
    // genuinely unique items — the FlatList key is derived from the same
    // pair. (The RPC cursor using the non-unique entry_id as its id column
    // is a pre-existing server-side fragility — flagged, not changed here.)
    const seen = new Set<string>();
    const deduped = allRows.filter((r) => {
      const key = `${r.entry_id}:${r.line}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const lines = FILTER_LINES[filter];
    return lines ? deduped.filter((r) => lines.includes(r.line)) : deduped;
  }, [allRows, filter]);
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
          <AppText className="text-sm text-muted-foreground">
            {finance.isError
              ? "Couldn't load your balance."
              : "No earnings yet."}
          </AppText>
        </View>
      ) : (
        balances.map((b) => <BalanceCard key={b.currency} row={b} />)
      )}

      <View className="gap-2">
        <NavRow href="/(app)/organizer/withdraw" label="Withdraw" />
        <NavRow href="/(app)/organizer/payouts" label="Withdrawal history" />
        <NavRow
          href="/(app)/organizer/payout-accounts"
          label="Payout accounts"
        />
      </View>

      <Overline className="pt-2">Transactions</Overline>
      <View className="flex-row flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Chip
            key={f.key}
            label={f.label}
            selected={filter === f.key}
            onPress={() => setFilter(f.key)}
          />
        ))}
      </View>
    </View>
  );

  return (
    <FlatList
      className="flex-1 bg-background"
      data={rows}
      keyExtractor={(r) => `${r.entry_id}:${r.line}`}
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
          <AppText className="mt-6 text-center text-sm text-muted-foreground">
            {ledgerFailed ? "Couldn't load transactions." : "No transactions."}
          </AppText>
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
