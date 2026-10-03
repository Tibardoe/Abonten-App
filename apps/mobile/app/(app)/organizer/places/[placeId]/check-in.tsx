import { QrCode } from "@/components/QrCode";
import { QueryUnavailable } from "@/components/app/QueryUnavailable";
import { usePlaceVisitPanel } from "@/features/rewards/usePlaceVisits";
import { useQueryView } from "@/lib/useQueryView";
import { formatCredit } from "@abonten/core/rewards/creditAmount";
import { AppText, Button, Overline, Refresher } from "@abonten/ui-native";
import { useLocale, useTranslations } from "@abonten/ui-native/i18n";
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
  const { locale } = useLocale();
  const t = useTranslations("manage");

  const { placeId } = useLocalSearchParams<{ placeId: string }>();
  const q = usePlaceVisitPanel(placeId ?? "");
  const { width } = useWindowDimensions();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const panel = q.data;
  // Loading, offline and failed are told apart from "not available yet".
  const view = useQueryView(q);
  const secondsLeft = panel?.expiresAt
    ? Math.max(Math.ceil((Date.parse(panel.expiresAt) - now) / 1000), 0)
    : 0;

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="gap-5 p-4 pb-16"
      refreshControl={<Refresher onRefresh={() => q.refetch()} />}
    >
      {view.kind !== "content" && view.kind !== "empty" ? (
        <QueryUnavailable
          view={view}
          subject={t("theCheckInCode")}
          onRetry={() => q.refetch()}
          loading={
            <View className="items-center py-12">
              <ActivityIndicator />
            </View>
          }
        />
      ) : !panel ? (
        <View className="items-center gap-3 py-12">
          <AppText className="text-center text-muted-foreground">
            {t("couldnTLoadTheCheckIn")}
          </AppText>
          <Button title={t("retry")} size="sm" onPress={() => q.refetch()} />
        </View>
      ) : !panel.available || !panel.url ? (
        <AppText className="py-12 text-center text-muted-foreground">
          {t("visitorCheckInIsnTAvailable")}
        </AppText>
      ) : (
        <>
          <View className="items-center gap-3">
            <View className="rounded-2xl bg-white p-3">
              <QrCode
                value={panel.url}
                size={Math.min(width - 80, 320)}
                accessibilityLabel={t("checkInQrCodeForThis")}
              />
            </View>
            <AppText variant="caption" className="tabular-nums">
              {t("newCodeInS", { secondsLeft: secondsLeft })}
            </AppText>
          </View>

          <AppText variant="small" className="text-center">
            {t("showThisAtYourCounterOr")}{" "}
            {panel.verified
              ? t("everyDifferentPersonWhoChecksIn", {
                  formatCredit: formatCredit(
                    panel.perVisitorMinor,
                    panel.currency,
                    locale,
                  ),
                  maxVisitors: panel.maxVisitors,
                })
              : t("visitsAreCountedNowOnlyVerified")}
          </AppText>

          <View className="flex-row flex-wrap gap-2">
            <Tile label={t("today")} value={String(panel.stats.today)} />
            <Tile
              label={t("visitorsThisMonth")}
              value={String(panel.stats.thisMonthVisitors)}
            />
            <Tile
              label={t("lastMonth")}
              value={String(panel.stats.lastMonthVisitors)}
            />
            <Tile
              label={t("creditEarned")}
              value={formatCredit(
                panel.stats.earnedMinor,
                panel.currency,
                locale,
              )}
            />
          </View>
        </>
      )}
    </ScrollView>
  );
}
