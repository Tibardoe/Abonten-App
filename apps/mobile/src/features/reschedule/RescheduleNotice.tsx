import { api } from "@/lib/api";
import { formatMoney } from "@abonten/core/money/formatMoney";
import { formatInTimeZone } from "@abonten/core/time/timeZone";
import { AppText, Button, useToast } from "@abonten/ui-native";
import { useLocale, useTranslations } from "@abonten/ui-native/i18n";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, View } from "react-native";

const WHEN: Intl.DateTimeFormatOptions = {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
};

// On a ticket for an event the organizer moved
// (docs/architecture/event-reschedule.md): the old and new dates, their
// message, and the choice — keep the ticket, or give it back for the ticket
// price and the service fee while the window is open. Nothing for an event
// that never moved. GET/POST /api/mobile/events/:eventId/reschedule[/keep|
// /refund] — the same cores as the website's ticket card.
export function RescheduleNotice({ eventId }: { eventId: string }) {
  const t = useTranslations("tickets");
  const tc = useTranslations("common");
  const { locale } = useLocale();
  const toast = useToast();
  const qc = useQueryClient();
  const key = ["mobile", "event-reschedule", eventId];
  const { data: move } = useQuery({
    queryKey: key,
    queryFn: async () => {
      const res = await api.events.reschedule(eventId);
      if (res.status === 200) return res.data;
      throw new Error(res.message);
    },
  });

  const keep = useMutation({
    mutationFn: () => api.events.keepAfterReschedule(eventId),
    onSuccess: (res) => {
      if (res.status === 200) {
        toast.success(res.message);
        qc.invalidateQueries({ queryKey: key });
      } else {
        toast.error(res.message);
      }
    },
    onError: () => toast.error(t("couldNotSaveChoice")),
  });
  const giveBack = useMutation({
    mutationFn: () => api.events.refundAfterReschedule(eventId),
    onSuccess: (res) => {
      if (res.status === 200) {
        toast.success(res.message);
        qc.invalidateQueries({ queryKey: key });
        qc.invalidateQueries({ queryKey: ["mobile", "ticket"] });
        qc.invalidateQueries({ queryKey: ["mobile", "tickets"] });
      } else {
        toast.error(res.message);
      }
    },
    onError: () => toast.error(t("couldNotSaveChoice")),
  });

  if (!move) return null;

  const when = (iso: string) =>
    formatInTimeZone(iso, move.timezone, WHEN, locale);
  const refundMoney =
    move.refund && move.refund.cashMinor + move.refund.creditMinor > 0
      ? {
          amountMinor: move.refund.cashMinor + move.refund.creditMinor,
          currency: move.refund.currency,
        }
      : null;
  const amount = refundMoney ? formatMoney(refundMoney, { locale }) : null;
  // Keeping is not final: until the window closes the holder may still
  // give the tickets back.
  const canChoose = move.refundOpen && move.activeTickets > 0;
  const busy = keep.isPending || giveBack.isPending;
  const giveBackLabel = amount
    ? t("rescheduleRefundAmount", { amount })
    : t("rescheduleGiveBack", { count: move.activeTickets });

  function confirmGiveBack() {
    if (!move) return;
    Alert.alert(
      t("rescheduleRefundConfirmTitle", { count: move.activeTickets }),
      amount
        ? t("rescheduleRefundConfirmPaid", { amount })
        : t("rescheduleRefundConfirmFree"),
      [
        { text: tc("cancel"), style: "cancel" },
        {
          text: giveBackLabel,
          style: "destructive",
          onPress: () => giveBack.mutate(),
        },
      ],
    );
  }

  return (
    <View className="w-full gap-2 rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-700 dark:bg-amber-950">
      <AppText variant="bodyStrong">{t("rescheduleBannerTitle")}</AppText>
      <AppText variant="small">
        {t("rescheduleBannerDates", {
          previous: when(move.previousStartsAt),
          now: when(move.startsAt),
        })}
      </AppText>
      <View className="gap-0.5">
        <AppText variant="caption" tone="muted">
          {t("rescheduleBannerMessageLabel")}
        </AppText>
        <AppText variant="small">{move.message}</AppText>
      </View>
      {move.activeTickets > 0 ? (
        <AppText variant="meta">
          {move.choice === "keep"
            ? t("rescheduleKeptNote")
            : move.refundOpen
              ? t("rescheduleBannerChoice", {
                  refundUntil: when(move.refundUntil),
                })
              : t("rescheduleClosedNote", {
                  refundUntil: when(move.refundUntil),
                })}
        </AppText>
      ) : null}
      {canChoose && move.refundBlocked ? (
        <AppText variant="meta">{move.refundBlocked}</AppText>
      ) : null}
      {canChoose ? (
        <View className="gap-2 pt-1">
          {move.choice !== "keep" ? (
            <Button
              title={t("rescheduleKeep", { count: move.activeTickets })}
              fullWidth
              disabled={busy}
              loading={keep.isPending}
              onPress={() => keep.mutate()}
            />
          ) : null}
          {!move.refundBlocked ? (
            <Button
              title={giveBackLabel}
              variant="outline"
              fullWidth
              disabled={busy}
              loading={giveBack.isPending}
              onPress={confirmGiveBack}
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
