import { QrCode } from "@/components/QrCode";
import { usePlaceVisitPanel } from "@/features/rewards/usePlaceVisits";
import { formatCredit } from "@abonten/core/rewards/creditAmount";
import { AppText, Button, Overline, Refresher } from "@abonten/ui-native";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  View,
  useWindowDimensions,
} from "react-native";

// The place owner's check-in code (Rewards Phase 8), the native echo of the
// web Insights card. Visitors scan it with their phone camera or the app
// while they're at the place. It changes every 30 seconds, so a photo of it
// stops working almost at once; the query refetches as each one expires.

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <View className="min-w-[45%] flex-1 gap-1 rounded-xl border border-border bg-card p-3">
      <Overline>{label}</Overline>
      <AppText variant="sectionHeading">{value}</AppText>
    </View>
  );
}

export default function PlaceCheckInScreen() {
  const { placeId } = useLocalSearchParams<{ placeId: string }>();
  const q = usePlaceVisitPanel(placeId ?? "");
  const { width } = useWindowDimensions();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const panel = q.data;
  const secondsLeft = panel?.expiresAt
    ? Math.max(Math.ceil((Date.parse(panel.expiresAt) - now) / 1000), 0)
    : 0;

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="gap-5 p-4 pb-16"
      refreshControl={
        <Refresher refreshing={q.isRefetching} onRefresh={() => q.refetch()} />
      }
    >
      {q.isLoading ? (
        <View className="items-center py-12">
          <ActivityIndicator />
        </View>
      ) : q.isError || !panel ? (
        <View className="items-center gap-3 py-12">
          <AppText className="text-center text-muted-foreground">
            {q.error instanceof Error
              ? q.error.message
              : "Couldn't load the check-in code."}
          </AppText>
          <Button title="Retry" size="sm" onPress={() => q.refetch()} />
        </View>
      ) : !panel.available || !panel.url ? (
        <AppText className="py-12 text-center text-muted-foreground">
          Visitor check-in isn't available yet.
        </AppText>
      ) : (
        <>
          <View className="items-center gap-3">
            <View className="rounded-2xl bg-white p-3">
              <QrCode
                value={panel.url}
                size={Math.min(width - 80, 320)}
                accessibilityLabel="Check-in QR code for this place"
              />
            </View>
            <AppText variant="caption" className="tabular-nums">
              New code in {secondsLeft}s
            </AppText>
          </View>

          <AppText variant="small" className="text-center">
            Show this at your counter or entrance. Visitors scan it with their
            phone while they're here to check in (once a day).
            {panel.verified
              ? ` Every different person who checks in during a month earns you ${formatCredit(panel.perVisitorMinor)} of promotion credit (up to ${panel.maxVisitors} a month), added early the next month.`
              : " Visits are counted now; only verified places earn promotion credit from them."}
          </AppText>

          <View className="flex-row flex-wrap gap-2">
            <Tile label="Today" value={String(panel.stats.today)} />
            <Tile
              label="Visitors this month"
              value={String(panel.stats.thisMonthVisitors)}
            />
            <Tile
              label="Last month"
              value={String(panel.stats.lastMonthVisitors)}
            />
            <Tile
              label="Credit earned"
              value={formatCredit(panel.stats.earnedMinor)}
            />
          </View>
        </>
      )}
    </ScrollView>
  );
}
