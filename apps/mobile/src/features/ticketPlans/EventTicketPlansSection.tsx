import {
  useEventTicketPlans,
  useSetEventTicketPlans,
} from "@/features/ticketPlans/useTicketPlans";
import { formatMoney } from "@abonten/core/money/formatMoney";
import { AppText, Button, Overline, useToast } from "@abonten/ui-native";
import { useLocale, useTranslations } from "@abonten/ui-native/i18n";
import { View } from "react-native";

// The organizer's Pay small small switch for one event, the native echo of
// the web card on the event's manage page: buyers lock the price, hold their
// tickets and pay in parts before a deadline; the organizer is paid for each
// ticket when its plan is finished. Hidden while the programme is not open
// to this organizer and the event has no plans.
export function EventTicketPlansSection({ eventId }: { eventId: string }) {
  const t = useTranslations("ticketPlans");
  const { locale } = useLocale();
  const toast = useToast();
  const { data } = useEventTicketPlans(eventId);
  const save = useSetEventTicketPlans(eventId);

  const setting = data?.status === 200 ? (data.data ?? null) : null;
  if (!setting) return null;
  if (!setting.available && !setting.enabled && setting.openPlans === 0) {
    return null;
  }

  const toggle = (enabled: boolean) => {
    void save.mutateAsync(enabled).then((res) => {
      if (res.status === 200) toast.success(res.message ?? t("saved"));
      else toast.error(res.message ?? t("couldNotSave"));
    });
  };

  return (
    <View className="gap-3 rounded-2xl border border-border bg-card p-4">
      <Overline>{t("paySmallSmall")}</Overline>
      <AppText variant="small">{t("organizerCardBody")}</AppText>
      <AppText variant="bodyStrong">
        {setting.enabled ? t("organizerOn") : t("organizerOff")}
      </AppText>
      {setting.enabled ? (
        <Button
          title={t("turnOff")}
          variant="outline"
          loading={save.isPending}
          disabled={save.isPending}
          onPress={() => toggle(false)}
        />
      ) : setting.available ? (
        <Button
          title={t("turnOn")}
          loading={save.isPending}
          disabled={save.isPending}
          onPress={() => toggle(true)}
        />
      ) : (
        <AppText variant="small" tone="muted">
          {t("organizerUnavailable")}
        </AppText>
      )}
      {setting.openPlans > 0 || setting.completedPlans > 0 ? (
        <View className="gap-1 border-t border-border pt-3">
          <AppText variant="small">
            {t("organizerStats", {
              open: setting.openPlans,
              held: setting.ticketsHeld,
              done: setting.completedPlans,
            })}
          </AppText>
          {setting.paidTowards.map((p) => (
            <AppText key={p.currency} variant="small">
              {t("paidSoFarAmount", {
                amount: formatMoney(
                  { amountMinor: p.amountMinor, currency: p.currency },
                  { locale },
                ),
              })}
            </AppText>
          ))}
        </View>
      ) : null}
    </View>
  );
}
