import { useSession } from "@/auth/SessionProvider";
import { api } from "@/lib/api";
import { settleEnvelope } from "@/lib/envelope";
import { AppText, Button, Overline, useToast } from "@abonten/ui-native";
import { useTranslations } from "@abonten/ui-native/i18n";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { View } from "react-native";
import { TICKET_TRANSFERS_KEY } from "./useTicketTransfers";

// The organizer's switch for one event (decision X1), the native echo of
// the web card on the event's manage page: guests may send its tickets to
// friends unless it is turned off. Hidden while sending is not open to this
// organizer.
export function EventTicketTransfersSection({ eventId }: { eventId: string }) {
  const t = useTranslations("tickets");
  const toast = useToast();
  const qc = useQueryClient();
  const { session } = useSession();
  const key = [...TICKET_TRANSFERS_KEY, "event", session?.user.id, eventId];
  const { data } = useQuery({
    queryKey: key,
    enabled: !!session,
    queryFn: async () =>
      settleEnvelope(await api.organizer.eventTicketTransfers(eventId)),
    staleTime: 30_000,
  });
  const save = useMutation({
    mutationFn: (enabled: boolean) =>
      api.organizer.setEventTicketTransfers(eventId, enabled),
  });

  const setting = data?.status === 200 ? (data.data ?? null) : null;
  if (!setting?.programEnabled) return null;

  const toggle = (enabled: boolean) => {
    void save
      .mutateAsync(enabled)
      .then((res) => {
        if (res.status === 200) {
          qc.setQueryData(key, {
            status: 200,
            data: { ...setting, enabled },
          });
          toast.success(t("organizerSaved"));
        } else {
          toast.error(res.message ?? t("organizerCouldNotSave"));
        }
      })
      .catch(() => toast.error(t("organizerCouldNotSave")));
  };

  return (
    <View className="gap-3 rounded-2xl border border-border bg-card p-4">
      <Overline>{t("organizerCardTitle")}</Overline>
      <AppText variant="small">{t("organizerCardBody")}</AppText>
      <AppText variant="bodyStrong">
        {setting.enabled ? t("organizerSendingOn") : t("organizerSendingOff")}
      </AppText>
      <Button
        title={setting.enabled ? t("organizerTurnOff") : t("organizerTurnOn")}
        variant={setting.enabled ? "outline" : "primary"}
        loading={save.isPending}
        disabled={save.isPending}
        onPress={() => toggle(!setting.enabled)}
      />
    </View>
  );
}
