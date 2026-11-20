import { api } from "@/lib/api";
import type { ShowPassShow } from "@abonten/api-client";
import { passChoicesLeft, passShowChoosable } from "@abonten/core/showPasses";
import { formatInTimeZone } from "@abonten/core/time/timeZone";
import { AppText, Button, useToast } from "@abonten/ui-native";
import { useLocale, useTranslations } from "@abonten/ui-native/i18n";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { View } from "react-native";

// On a pass ticket: the run's shows, which ones the pass holds a ticket
// for, and a button to choose another (docs/architecture/show-passes.md).
// GET / POST /api/mobile/tickets/:ticketId/pass — the same cores as the
// website's ticket view.
export function PassShowsPanel({ ticketId }: { ticketId: string }) {
  const t = useTranslations("tickets");
  const { locale } = useLocale();
  const toast = useToast();
  const qc = useQueryClient();
  const key = ["mobile", "show-pass", ticketId];
  const { data: state, isError } = useQuery({
    queryKey: key,
    queryFn: async () => {
      const res = await api.tickets.showPass(ticketId);
      if (res.status === 200) return res.data;
      if (res.status === 404) return null;
      throw new Error(res.message);
    },
  });
  const choose = useMutation({
    mutationFn: (eventId: string) =>
      api.tickets.claimShowPass(ticketId, { eventId }),
    onSuccess: (res) => {
      if (res.status === 200) {
        toast.success(res.message ?? t("passChosen"));
        qc.invalidateQueries({ queryKey: key });
        qc.invalidateQueries({ queryKey: ["mobile", "tickets"] });
      } else {
        toast.error(res.message ?? t("couldNotChooseShow"));
      }
    },
    onError: () => toast.error(t("couldNotChooseShow")),
  });

  if (isError) {
    return (
      <AppText variant="meta" className="text-center">
        {t("passCouldNotLoad")}
      </AppText>
    );
  }
  if (!state) return null;

  const left = passChoicesLeft(state);
  const when = (show: ShowPassShow) =>
    formatInTimeZone(
      show.startsAt,
      show.timezone,
      {
        weekday: "short",
        day: "numeric",
        month: "short",
        hour: "numeric",
        minute: "2-digit",
      },
      locale,
    );

  return (
    <View className="w-full gap-3 rounded-xl border border-border bg-card p-4">
      <View className="gap-1">
        <AppText variant="bodyStrong">{t("passYourShows")}</AppText>
        <AppText variant="meta">
          {t("passShowsLeft", { left, total: state.showsTotal })}
        </AppText>
      </View>
      {state.shows.map((show) => {
        const held =
          !!show.ticketId &&
          (show.ticketStatus === "active" || show.ticketStatus === "used");
        return (
          <View
            key={show.eventId}
            className="min-h-[44px] flex-row items-center justify-between gap-3"
          >
            <AppText
              variant="small"
              className={held ? "font-semibold" : undefined}
            >
              {when(show)}
            </AppText>
            {held ? (
              <AppText variant="caption" tone="muted">
                {show.isBoughtShow ? t("passBoughtShow") : t("passChosen")}
              </AppText>
            ) : passShowChoosable(state, show) ? (
              <Button
                title={t("passChoose")}
                size="sm"
                variant="outline"
                disabled={choose.isPending}
                onPress={() => choose.mutate(show.eventId)}
              />
            ) : (
              <AppText variant="caption" tone="muted">
                {show.status === "canceled"
                  ? t("passShowCancelled")
                  : show.started
                    ? t("passShowStarted")
                    : !show.hasPass || show.passesLeft === 0
                      ? t("passShowFull")
                      : "—"}
              </AppText>
            )}
          </View>
        );
      })}
    </View>
  );
}
