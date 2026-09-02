import { usePayouts } from "@/features/organizer/usePayouts";
import type { OrganizerPayoutRow } from "@abonten/api-client";
import { formatDateWithSuffix } from "@abonten/core/dateFormatter";
import { AppText } from "@abonten/ui-native";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  View,
} from "react-native";

const STATUS_TONE: Record<string, string> = {
  completed: "text-foreground",
  processing: "text-muted-foreground",
  failed: "text-destructive",
  cancelled: "text-destructive",
};

function PayoutRow({ row }: { row: OrganizerPayoutRow }) {
  return (
    <View className="flex-row items-center justify-between gap-3 rounded-xl border border-border bg-card px-3 py-3">
      <View className="flex-1 gap-0.5">
        <AppText className="text-sm font-medium text-foreground">
          {row.currency}{" "}
          {row.amount.toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
        </AppText>
        <AppText variant="caption">
          {formatDateWithSuffix(row.requested_at)} · {row.reference}
        </AppText>
      </View>
      <AppText
        className={`text-[13px] font-semibold uppercase ${
          STATUS_TONE[row.status] ?? "text-muted-foreground"
        }`}
      >
        {row.status}
      </AppText>
    </View>
  );
}

export default function PayoutsScreen() {
  const q = usePayouts();
  const rows = q.data && q.data.status === 200 ? q.data.data : [];
  const failed = q.isError || (q.data && q.data.status !== 200);

  if (q.isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <FlatList
      className="flex-1 bg-background"
      data={rows}
      keyExtractor={(r) => r.id}
      renderItem={({ item }) => <PayoutRow row={item} />}
      contentContainerClassName="gap-3 p-4 pb-16"
      refreshControl={
        <RefreshControl
          refreshing={q.isRefetching}
          onRefresh={() => q.refetch()}
        />
      }
      ListEmptyComponent={
        <AppText className="mt-10 text-center text-sm text-muted-foreground">
          {failed ? "Couldn't load payouts." : "No withdrawals yet."}
        </AppText>
      }
    />
  );
}
