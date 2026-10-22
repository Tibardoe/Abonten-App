import { AppHeader } from "@/components/app/AppHeader";
import { QueryUnavailable } from "@/components/app/QueryUnavailable";
import { StaticMapPreview } from "@/components/map/StaticMapPreview";
import { useDirections } from "@/features/directions/DirectionsSheet";
import { callNumber } from "@/features/safety/deviceSms";
import { api } from "@/lib/api";
import { settleEnvelope } from "@/lib/envelope";
import { useQueryView } from "@/lib/useQueryView";
import { getRelativeTime } from "@abonten/core/dateFormatter";
import { formatDateTime } from "@abonten/core/i18n/format";
import { formatPhoneInternational } from "@abonten/core/phone/phone";
import { primaryEmergencyNumber } from "@abonten/core/safety/emergencyNumbers";
import { isSafetyToken } from "@abonten/core/safety/links";
import type {
  SafetyAcknowledgement,
  SafetyView,
} from "@abonten/types/safetyType";
import {
  AppText,
  Button,
  Card,
  Icon,
  Refresher,
  useToast,
} from "@abonten/ui-native";
import { useLocale, useTranslations } from "@abonten/ui-native/i18n";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { ScrollView, View } from "react-native";

// What a trusted contact who is also on Abonten sees when they tap an
// alert: the same view as the /sos/<token> page, natively. Where the person
// is, how fresh that is, their note, the event, a button to call them and
// the emergency number, and three answers the person sees at once.

export default function SafetyWatchScreen() {
  const t = useTranslations("safety");
  const { locale } = useLocale();
  const toast = useToast();
  const qc = useQueryClient();
  const { token } = useLocalSearchParams<{ token: string }>();
  const valid = isSafetyToken(token);
  const key = ["mobile", "safety", "view", token] as const;
  const query = useQuery({
    queryKey: key,
    enabled: valid,
    queryFn: async () => settleEnvelope(await api.safety.view(token as string)),
    refetchInterval: (q) => {
      const seconds = (q.state.data as { data?: SafetyView } | undefined)?.data
        ?.pollSeconds;
      return seconds ? seconds * 1000 : false;
    },
  });
  const view = useQueryView(query);
  const data: SafetyView | null = query.data?.data ?? null;
  const [busy, setBusy] = useState(false);
  const location = data?.location ?? null;
  const directions = useDirections({
    label: data?.person.name ?? "",
    coords: location ? { lat: location.lat, lng: location.lng } : undefined,
  });

  const answer = async (acknowledgement: SafetyAcknowledgement) => {
    if (!valid) return;
    setBusy(true);
    try {
      const res = await api.safety.acknowledge(token as string, {
        acknowledgement,
      });
      if (res.status === 200 && res.data) {
        qc.setQueryData(key, res);
        toast.success(t("answerSent", { name: data?.person.name ?? "" }));
      } else {
        toast.error(res.message ?? t("couldNotSave"));
      }
    } catch {
      toast.error(t("networkError"));
    } finally {
      setBusy(false);
    }
  };

  const clock = (at: string) =>
    formatDateTime(at, locale, {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: data?.timezone ?? "UTC",
    });

  if (!data) {
    return (
      <View className="flex-1 bg-background">
        <AppHeader
          variant="title"
          title={t("title")}
          backFallback="/(app)/notifications"
        />
        <QueryUnavailable
          view={view}
          subject={t("title")}
          onRetry={() => query.refetch()}
        />
        {!valid || (query.data && query.data.status === 404) ? (
          <AppText variant="small" className="p-4">
            {t("linkEnded")}
          </AppText>
        ) : null}
      </View>
    );
  }

  const open = data.status === "active" || data.status === "alerting";
  const alerting = data.status === "alerting";
  const emergency = primaryEmergencyNumber(data.emergencyNumbers);
  const name = data.person.name;

  const headline = alerting
    ? data.alertReason === "check_in_missed"
      ? t("watch.missed", { name })
      : t("watch.alert", { name })
    : open
      ? t("watch.sharing", { name, time: clock(data.endsAt) })
      : data.resolution === "false_alarm"
        ? t("watch.mistake", { name })
        : data.resolution === "safe"
          ? t("watch.safe", { name })
          : t("watch.ended", { name });

  return (
    <View className="flex-1 bg-background">
      <AppHeader
        variant="title"
        title={t("title")}
        backFallback="/(app)/notifications"
      />
      <ScrollView
        contentContainerClassName="gap-5 p-4 pb-16"
        refreshControl={<Refresher onRefresh={() => query.refetch()} />}
      >
        <Card
          className={`gap-3 ${alerting ? "border-destructive" : ""}`}
          accessibilityLiveRegion="polite"
        >
          <View className="flex-row items-center gap-3">
            {data.person.avatarUrl ? (
              <Image
                source={{ uri: data.person.avatarUrl }}
                style={{ width: 48, height: 48, borderRadius: 24 }}
                contentFit="cover"
                accessibilityIgnoresInvertColors
              />
            ) : (
              <Icon name="person-circle-outline" size={48} tone="muted" />
            )}
            <View className="flex-1">
              <AppText variant="cardTitle">{headline}</AppText>
              {data.event ? (
                <AppText variant="meta">
                  {t("active.atEvent", { event: data.event.title })}
                </AppText>
              ) : null}
            </View>
          </View>
          {data.note ? (
            <View className="rounded-xl bg-muted p-3">
              <AppText variant="small">
                {t("watch.note", { note: data.note })}
              </AppText>
            </View>
          ) : null}
        </Card>

        {location ? (
          <View className="gap-2">
            <StaticMapPreview
              key={`${location.lat.toFixed(4)},${location.lng.toFixed(4)}`}
              coords={{ lat: location.lat, lng: location.lng }}
              label={name}
              onPress={directions.show}
              height={220}
            />
            <AppText
              variant="meta"
              tone={data.locationState === "stale" ? "warning" : "muted"}
            >
              {t(
                data.locationState === "stale"
                  ? "watch.lastSeen"
                  : "watch.liveAt",
                {
                  when: getRelativeTime(location.at, new Date(), locale),
                  accuracy: location.accuracyM ?? 0,
                  hasAccuracy: location.accuracyM ? "yes" : "no",
                },
              )}
            </AppText>
            <Button
              title={t("watch.directions")}
              variant="outline"
              leftIcon="navigate-outline"
              onPress={directions.show}
            />
          </View>
        ) : (
          <AppText variant="small">
            {data.locationState === "hidden"
              ? t("watch.locationHidden")
              : t("watch.noLocation")}
          </AppText>
        )}

        <View className="gap-2">
          {data.person.phoneE164 ? (
            <Button
              title={t("watch.call", {
                name,
                phone: formatPhoneInternational(data.person.phoneE164),
              })}
              leftIcon="call-outline"
              fullWidth
              onPress={() => callNumber(data.person.phoneE164 as string)}
            />
          ) : null}
          {alerting && emergency ? (
            <Button
              title={t("callEmergency", { number: emergency.number })}
              variant="destructive"
              leftIcon="call"
              fullWidth
              onPress={() => callNumber(emergency.number)}
            />
          ) : null}
        </View>

        {open ? (
          <Card className="gap-3">
            <AppText variant="bodyStrong">
              {t("watch.answerTitle", { name })}
            </AppText>
            {(["on_my_way", "calling", "cant_help"] as const).map((a) => (
              <Button
                key={a}
                title={t("watch.answer", { answer: a })}
                variant={
                  data.viewer.acknowledgement === a ? "primary" : "outline"
                }
                leftIcon={
                  data.viewer.acknowledgement === a ? "checkmark" : undefined
                }
                disabled={busy}
                onPress={() => void answer(a)}
              />
            ))}
          </Card>
        ) : null}

        {data.timeline.length > 0 ? (
          <Card className="gap-2">
            {data.timeline.map((e) => (
              <View key={`${e.kind}-${e.at}`} className="flex-row gap-3">
                <Icon name="ellipse" size={8} tone="muted" />
                <AppText variant="meta" className="flex-1">
                  {t("timeline", {
                    kind: e.kind,
                    name: e.name ?? "",
                    person: name,
                    answer: e.acknowledgement ?? "",
                    outcome: e.resolution ?? "",
                    reason: e.reason ?? "",
                  })}
                </AppText>
                <AppText variant="meta">{clock(e.at)}</AppText>
              </View>
            ))}
          </Card>
        ) : null}

        <AppText variant="caption">{t("notEmergencyServices")}</AppText>
      </ScrollView>
      {directions.sheet}
    </View>
  );
}
