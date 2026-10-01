import { QueryUnavailable } from "@/components/app/QueryUnavailable";
import {
  useCancelEvent,
  useEventCancellationImpact,
} from "@/features/organizer/usePayouts";
import { useQueryView } from "@/lib/useQueryView";
import { AppText, useToast } from "@abonten/ui-native";
import { useTranslations } from "@abonten/ui-native/i18n";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  View,
} from "react-native";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-center justify-between">
      <AppText className="text-sm text-muted-foreground">{label}</AppText>
      <AppText className="text-sm font-semibold text-foreground">
        {value}
      </AppText>
    </View>
  );
}

export default function CancelEventScreen() {
  const t = useTranslations("manage");

  const toast = useToast();
  const { eventId, title } = useLocalSearchParams<{
    eventId: string;
    title?: string;
  }>();
  const router = useRouter();
  const impact = useEventCancellationImpact(eventId ?? "");
  const cancel = useCancelEvent();
  const [confirmed, setConfirmed] = useState(false);

  const data =
    impact.data && impact.data.status === 200 ? impact.data.data : null;
  // Loading, offline and failed are told apart; cancelling stays disabled
  // until the impact (tickets, buyers, refunds) has actually loaded.
  const impactView = useQueryView(impact);
  const impactError = impactView.kind !== "content" || data === null;

  async function onCancel() {
    const res = await cancel.mutateAsync(eventId ?? "");
    if (res.status === 200) {
      Alert.alert(t("eventCancelled"), res.message, [
        { text: "OK", onPress: () => router.back() },
      ]);
      return;
    }
    toast.error(t("couldnTCancel"), {
      description: res.message ?? t("pleaseTryAgain"),
    });
  }

  if (impactView.kind === "loading") {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="gap-5 p-4 pb-10"
    >
      <AppText variant="sectionHeading">
        {title ?? t("cancelThisEvent")}
      </AppText>

      {impactError ? (
        <View className="gap-2 rounded-xl border border-destructive/40 bg-destructive/5 p-4">
          <AppText className="text-sm text-destructive">
            {(impact.data &&
              impact.data.status !== 200 &&
              impact.data.message) ||
              (impactView.kind === "offline"
                ? t("youReOfflineTheCancellationDetails")
                : t("couldnTLoadTheCancellationDetails"))}
          </AppText>
          <Pressable
            onPress={() => impact.refetch()}
            accessibilityRole="button"
            className="self-start rounded-lg border border-border px-3 py-1.5 active:opacity-80"
          >
            <AppText variant="small" className="font-semibold text-foreground">
              {impact.isFetching ? t("retrying") : t("retry")}
            </AppText>
          </Pressable>
        </View>
      ) : (
        <View className="gap-3 rounded-xl border border-border bg-card p-4">
          <Row
            label={t("paidTickets")}
            value={String(data?.paidTicketCount ?? 0)}
          />
          <Row
            label={t("freeTickets")}
            value={String(data?.freeTicketCount ?? 0)}
          />
          <Row
            label={t("attendees")}
            value={String(data?.attendeeCount ?? 0)}
          />
        </View>
      )}

      <View className="gap-2 rounded-xl border border-destructive/40 bg-destructive/5 p-4">
        <AppText className="text-sm font-semibold text-destructive">
          {t("thisCannotBeUndone")}
        </AppText>
        <AppText variant="muted">{t("everyTicketIsCancelledAllPaid")}</AppText>
      </View>

      <Pressable
        accessibilityRole="button"
        onPress={() => setConfirmed((v) => !v)}
        className="flex-row items-center gap-3"
      >
        <View
          className={`h-5 w-5 items-center justify-center rounded border ${
            confirmed ? "border-destructive bg-destructive" : "border-border"
          }`}
        >
          {confirmed ? (
            <AppText className="text-[11px] font-bold text-white">✓</AppText>
          ) : null}
        </View>
        <AppText variant="small" className="flex-1">
          {t("iUnderstandThisCancelsTheEvent")}
        </AppText>
      </Pressable>

      <Pressable
        accessibilityRole="button"
        onPress={onCancel}
        disabled={!confirmed || cancel.isPending || !!impactError}
        className={`items-center rounded-xl px-4 py-3 ${
          !confirmed || cancel.isPending || impactError
            ? "bg-muted"
            : "bg-destructive active:opacity-90"
        }`}
      >
        {cancel.isPending ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <AppText
            className={`text-sm font-semibold ${
              !confirmed || impactError ? "text-muted-foreground" : "text-white"
            }`}
          >
            {t("cancelEvent")}
          </AppText>
        )}
      </Pressable>

      <Pressable
        accessibilityRole="button"
        onPress={() => router.back()}
        className="items-center rounded-xl border border-border px-4 py-3 active:opacity-90"
      >
        <AppText className="text-sm text-foreground">{t("keepEvent")}</AppText>
      </Pressable>
    </ScrollView>
  );
}
