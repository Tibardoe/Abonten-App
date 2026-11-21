import { formatInTimeZone } from "@abonten/core/time/timeZone";
import { AppText, Button, Chip, useToast } from "@abonten/ui-native";
import { useLocale, useTranslations } from "@abonten/ui-native/i18n";
import { useState } from "react";
import { Alert, View } from "react-native";
import { useJoinEventRuns, useJoinableRuns } from "./useEventShows";

/**
 * On Shows and copies: bring another of the account's listings, with every
 * show of its run, into this run, so buyers see the play once
 * (docs/architecture/show-runs.md §2b). Hidden when there is nothing to
 * bring in. Mirrors the website's Shows card.
 */
export function JoinRunsSection({ eventId }: { eventId: string }) {
  const t = useTranslations("events");
  const { locale } = useLocale();
  const toast = useToast();
  const runsQuery = useJoinableRuns(eventId);
  const join = useJoinEventRuns(eventId);
  const [chosen, setChosen] = useState<string | null>(null);

  const res = runsQuery.data;
  const runs = res?.status === 200 ? (res.data ?? []) : [];
  if (runs.length === 0) return null;
  const run = runs.find((r) => r.eventId === chosen) ?? null;

  const label = (r: (typeof runs)[number]) =>
    t("joinRunsOption", {
      title: r.title,
      count: r.showCount,
      first: r.firstStartsAt
        ? formatInTimeZone(
            r.firstStartsAt,
            r.timezone,
            { day: "numeric", month: "short" },
            locale,
          )
        : "",
    });

  const confirmJoin = () => {
    if (!run) return;
    Alert.alert(
      t("joinRunsConfirm", { title: run.title, count: run.showCount }),
      undefined,
      [
        { text: t("cancel"), style: "cancel" },
        {
          text: t("joinRunsButton"),
          onPress: () =>
            join.mutate(run.eventId, {
              onSettled: (out) => {
                if (out?.status === 200) {
                  toast.success(out.message);
                  setChosen(null);
                  return;
                }
                toast.error(out?.message ?? "");
              },
            }),
        },
      ],
    );
  };

  return (
    <View className="gap-3 border-t border-border pt-5">
      <AppText variant="small" className="font-semibold">
        {t("joinRunsTitle")}
      </AppText>
      <AppText variant="meta">{t("joinRunsIntro")}</AppText>
      <AppText variant="label">{t("joinRunsChoose")}</AppText>
      <View className="flex-row flex-wrap gap-2">
        {runs.map((r) => (
          <Chip
            key={r.eventId}
            label={label(r)}
            selected={r.eventId === chosen}
            onPress={() => setChosen(r.eventId)}
          />
        ))}
      </View>
      <Button
        title={t("joinRunsButton")}
        variant="outline"
        fullWidth
        loading={join.isPending}
        disabled={join.isPending || !run}
        onPress={confirmJoin}
      />
    </View>
  );
}
