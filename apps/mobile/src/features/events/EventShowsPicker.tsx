import { formatInTimeZone } from "@abonten/core/time/timeZone";
import { AppText } from "@abonten/ui-native";
import { useLocale, useTranslations } from "@abonten/ui-native/i18n";
import { router } from "expo-router";
import { Pressable, ScrollView, View } from "react-native";
import { useEventShows } from "./useEventShows";

/**
 * The other shows of a run (docs/architecture/show-runs.md): each show is
 * its own listing with its own seats, so picking one opens it. Shown only
 * when the event belongs to a run with more than one upcoming show.
 */
export function EventShowsPicker({
  eventId,
  inRun,
}: {
  eventId: string;
  inRun: boolean;
}) {
  const { locale } = useLocale();
  const t = useTranslations("events");
  const { data } = useEventShows(eventId, inRun);
  const shows = data ?? [];
  if (!inRun || shows.length < 2) return null;

  return (
    <View className="gap-2">
      <AppText variant="small" className="font-semibold">
        {t("chooseAShow")}
      </AppText>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="gap-2"
      >
        {shows.map((show) => {
          const current = show.id === eventId;
          const unavailable = show.sold_out || show.status === "canceled";
          return (
            <Pressable
              key={show.id}
              accessibilityRole="button"
              accessibilityState={{ selected: current }}
              onPress={() => {
                if (!current) router.push(`/(app)/event/${show.id}`);
              }}
              className={`rounded-xl border px-3 py-2 ${
                current ? "border-primary bg-primary/10" : "border-border"
              } ${unavailable ? "opacity-60" : ""}`}
            >
              <AppText variant="small" className="font-semibold">
                {formatInTimeZone(
                  show.starts_at,
                  show.timezone,
                  { weekday: "short", day: "numeric", month: "short" },
                  locale,
                )}
              </AppText>
              <AppText variant="caption" tone="muted">
                {formatInTimeZone(
                  show.starts_at,
                  show.timezone,
                  { hour: "numeric", minute: "2-digit" },
                  locale,
                )}
                {" · "}
                {show.status === "canceled"
                  ? t("showCancelled")
                  : show.sold_out
                    ? t("showSoldOut")
                    : show.seats_left != null
                      ? t("showSeatsLeft", { count: show.seats_left })
                      : t("showOnSale")}
              </AppText>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}
