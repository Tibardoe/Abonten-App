import { QueryUnavailable } from "@/components/app/QueryUnavailable";
import {
  flattenOrganizerLedger,
  useOrganizerFinance,
  useOrganizerLedger,
} from "@/features/organizer/useOrganizer";
import {
  PromotionCreditCard,
  showPromotionCredit,
} from "@/features/rewards/PromotionCreditCard";
import { usePromotionCredit } from "@/features/rewards/useRewards";
import { useQueryView } from "@/lib/useQueryView";
import type {
  OrganizerFinanceOverviewRow,
  OrganizerLedgerTransactionRow,
} from "@abonten/api-client";
import { formatDateWithSuffix } from "@abonten/core/dateFormatter";
import { formatMoney } from "@abonten/core/formatMoney";
import {
  AppText,
  Chip,
  Icon,
  Overline,
  Refresher,
  StatusPill,
} from "@abonten/ui-native";
import { useLocale, useTranslations } from "@abonten/ui-native/i18n";
import { Link } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, View } from "react-native";

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
  promoter_commission: "Promoter commission",
  promoter_commission_reversal: "Promoter commission returned",
};

type LedgerFilter = "all" | "sales" | "fees" | "refunds" | "payouts";
const FILTERS: { key: LedgerFilter; label: string }[] = [
  { key: "all", label: "ledgerFilters.all" },
  { key: "sales", label: "ledgerFilters.sales" },
  { key: "fees", label: "ledgerFilters.fees" },
  { key: "refunds", label: "ledgerFilters.refunds" },
  { key: "payouts", label: "ledgerFilters.payouts" },
];
const FILTER_LINES: Record<
  LedgerFilter,
  OrganizerLedgerTransactionRow["line"][] | null
> = {
  all: null,
  sales: ["ticket_sale"],
  fees: ["platform_fee", "promoter_commission", "promoter_commission_reversal"],
  refunds: ["refund", "refund_release"],
  payouts: ["payout", "payout_release"],
};

function amount(currency: string, value: number): string {
  const sign = value < 0 ? "−" : "";
  return `${sign}${formatMoney(currency, Math.abs(value))}`;
}

function BalanceLine({
  icon,
  label,
  value,
}: {
  icon: "time-outline" | "wallet-outline";
  label: string;
  value: string;
}) {
  return (
    <View className="flex-row items-center justify-between">
      <View className="flex-row items-center gap-2">
        <Icon name={icon} size={15} tone="muted" />
        <AppText variant="small" tone="muted">
          {label}
        </AppText>
      </View>
      <AppText variant="metaStrong">{value}</AppText>
    </View>
  );
}

function BalanceCard({ row }: { row: OrganizerFinanceOverviewRow }) {
  const t = useTranslations("manage");

  return (
    <View className="gap-3 rounded-2xl border border-border bg-card p-4">
      <View className="gap-1">
        <Overline>
          {t("availableToWithdraw", { currency: row.currency })}
        </Overline>
        <AppText variant="hero" numberOfLines={1} adjustsFontSizeToFit>
          {amount(row.currency, row.available_balance)}
        </AppText>
      </View>
      <View className="gap-2 border-t border-border pt-3">
        <BalanceLine
          icon="time-outline"
          label={t("pendingSettlesAfterEachEvent")}
          value={amount(row.currency, row.pending_balance)}
        />
        <BalanceLine
          icon="wallet-outline"
          label={t("totalEarnedToDate")}
          value={amount(row.currency, row.total_earnings)}
        />
      </View>
    </View>
  );
}

function LedgerRow({ row }: { row: OrganizerLedgerTransactionRow }) {
  const { locale } = useLocale();

  return (
    <View className="gap-2 rounded-2xl border border-border bg-card p-3">
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1 gap-0.5">
          <AppText variant="bodyStrong" numberOfLines={1}>
            {LINE_LABEL[row.line] ?? row.line}
          </AppText>
          <AppText variant="caption" numberOfLines={1}>
            {row.event_title ?? row.reference ?? "—"}
          </AppText>
        </View>
        <AppText
          className={
            row.amount < 0
              ? "text-[15px] font-bold text-destructive"
              : "text-[15px] font-bold text-success"
          }
        >
          {amount(row.currency, row.amount)}
        </AppText>
      </View>
      <View className="flex-row items-center justify-between">
        <AppText variant="caption">
          {formatDateWithSuffix(row.created_at, undefined, locale)}
        </AppText>
        <StatusPill status={row.status} size="sm" />
      </View>
    </View>
  );
}

export default function OrganizerFinanceScreen() {
  const t = useTranslations("manage");

  const finance = useOrganizerFinance();
  const ledger = useOrganizerLedger();
  const promotionCredit = usePromotionCredit();
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
  // Loading, offline and failed are told apart from "no earnings" / "no
  // transactions": those are only ever said for an answer the server gave.
  // Finance is never cached on disk (money), so offline with nothing loaded
  // this session says so rather than showing a zero balance.
  const financeView = useQueryView(finance, () => balances.length === 0);
  const ledgerView = useQueryView(ledger, () => allRows.length === 0);

  const onEndReached = useCallback(() => {
    if (ledger.hasNextPage && !ledger.isFetchingNextPage)
      ledger.fetchNextPage();
  }, [ledger]);

  const header = (
    <View className="gap-4 pb-2">
      {financeView.kind === "content" ? (
        balances.map((b) => <BalanceCard key={b.currency} row={b} />)
      ) : financeView.kind === "empty" ? (
        <View className="rounded-xl border border-border bg-card p-4">
          <AppText className="text-sm text-muted-foreground">
            {t("noEarningsYet")}
          </AppText>
        </View>
      ) : (
        <QueryUnavailable
          view={financeView}
          subject="your balance"
          onRetry={() => finance.refetch()}
          loading={
            <View className="items-center py-8">
              <ActivityIndicator />
            </View>
          }
        />
      )}

      {showPromotionCredit(promotionCredit.data) ? (
        <PromotionCreditCard credit={promotionCredit.data} />
      ) : null}

      <View className="gap-2">
        <NavRow href="/(app)/organizer/withdraw" label={t("withdraw")} />
        <NavRow
          href="/(app)/organizer/payouts"
          label={t("withdrawalHistory")}
        />
        <NavRow
          href="/(app)/organizer/payout-accounts"
          label={t("payoutAccounts2")}
        />
      </View>

      <Overline className="pt-2">{t("transactions")}</Overline>
      <View className="flex-row flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Chip
            key={f.key}
            label={t(f.label)}
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
        <Refresher
          onRefresh={() =>
            Promise.all([
              finance.refetch(),
              ledger.refetch(),
              promotionCredit.refetch(),
            ])
          }
        />
      }
      ListEmptyComponent={
        ledgerView.kind === "empty" || ledgerView.kind === "content" ? (
          // Content with every row filtered out by the chip, or none at all.
          <AppText className="mt-6 text-center text-sm text-muted-foreground">
            {t("noTransactions")}
          </AppText>
        ) : (
          <QueryUnavailable
            view={ledgerView}
            subject="your transactions"
            onRetry={() => ledger.refetch()}
            loading={<ActivityIndicator className="my-4" />}
          />
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
