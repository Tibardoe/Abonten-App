import { QueryUnavailable } from "@/components/app/QueryUnavailable";
import { usePayouts } from "@/features/organizer/usePayouts";
import { useQueryView } from "@/lib/useQueryView";
import type { OrganizerPayoutRow } from "@abonten/api-client";
import { formatDateWithSuffix } from "@abonten/core/dateFormatter";
import { formatMoney } from "@abonten/core/formatMoney";
import { AppText, Refresher, StatusPill } from "@abonten/ui-native";
import { useLocale, useTranslations } from "@abonten/ui-native/i18n";
import { ActivityIndicator, FlatList, View } from "react-native";

function PayoutRow({ row }: { row: OrganizerPayoutRow }) {
  const { locale } = useLocale();

  return (
    <View className="gap-2 rounded-2xl border border-border bg-card p-3">
      <View className="flex-row items-start justify-between gap-3">
        <AppText variant="bodyStrong">
          {formatMoney(row.currency, row.amount)}
        </AppText>
        <StatusPill status={row.status} size="sm" />
      </View>
      <AppText variant="caption" numberOfLines={1}>
        {formatDateWithSuffix(row.requested_at, undefined, locale)} ·{" "}
        {row.reference}
      </AppText>
    </View>
  );
}

export default function PayoutsScreen() {
  const t = useTranslations("manage");

  const q = usePayouts();
  const rows = q.data && q.data.status === 200 ? q.data.data : [];
  // "No withdrawals yet" is only ever said for an answer the server gave;
  // loading, offline and failed are told apart (money is never cached on
  // disk, so offline with nothing loaded this session says so).
  const view = useQueryView(q, () => rows.length === 0);

  return (
    <FlatList
      className="flex-1 bg-background"
      data={rows}
      keyExtractor={(r) => r.id}
      renderItem={({ item }) => <PayoutRow row={item} />}
      contentContainerClassName="gap-3 p-4 pb-16"
      refreshControl={<Refresher onRefresh={() => q.refetch()} />}
      ListEmptyComponent={
        view.kind === "empty" ? (
          <AppText className="mt-10 text-center text-sm text-muted-foreground">
            {t("noWithdrawalsYet")}
          </AppText>
        ) : (
          <QueryUnavailable
            view={view}
            subject={t("yourPayouts")}
            onRetry={() => q.refetch()}
            loading={<ActivityIndicator className="mt-10" />}
          />
        )
      }
    />
  );
}
