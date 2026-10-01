import { api } from "@/lib/api";
import { settleEnvelope } from "@/lib/envelope";
import { formatCredit } from "@abonten/core/rewards/creditAmount";
import {
  AppText,
  Button,
  Field,
  Input,
  Overline,
  useToast,
} from "@abonten/ui-native";
import { useLocale, useTranslations } from "@abonten/ui-native/i18n";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { View } from "react-native";

const pct = (bps: number) => Number((bps / 100).toFixed(2));

// Organizer-funded promoter commission on one event (Rewards Phase 8), the
// native echo of the web Promotion-tab card: whoever's share link sells a
// ticket gets this share of the price as Abonten Credit after the event,
// and it comes off the organizer's payout for that sale. Hidden while
// commissions aren't switched on (and the event has no offer).
export function PromoterCommissionSection({ eventId }: { eventId: string }) {
  const { locale } = useLocale();
  const t = useTranslations("rewards");

  const toast = useToast();
  const qc = useQueryClient();
  const key = ["mobile", "organizer", "promoter-commission", eventId];
  const { data } = useQuery({
    queryKey: key,
    queryFn: async () => {
      const res = settleEnvelope(
        await api.organizer.eventPromoterCommission(eventId),
      );
      return res.status === 200 ? (res.data ?? null) : null;
    },
    staleTime: 30_000,
  });
  const [rate, setRate] = useState("");
  const save = useMutation({
    mutationFn: (rateBps: number | null) =>
      api.organizer.setEventPromoterCommission(eventId, rateBps),
    onSuccess: (res, rateBps) => {
      if (res.status === 200 && res.data) {
        qc.setQueryData(key, res.data);
        setRate("");
        toast.success(
          rateBps === null
            ? t("commissionStopped")
            : t("promotersNowEarnOfEachTicket", { pct: pct(rateBps) }),
        );
      } else {
        toast.error(t("couldnTSaveTheCommission"), {
          description: res.message ?? t("pleaseTryAgain"),
        });
      }
    },
    onError: () =>
      toast.error(t("couldnTSaveTheCommission"), {
        description: t("pleaseTryAgain"),
      }),
  });

  if (!data || (!data.available && data.rateBps === null)) return null;

  const typed = Number(rate.replace(",", "."));
  const typedBps = Math.round(typed * 100);
  const valid =
    rate.trim() !== "" &&
    Number.isFinite(typed) &&
    typedBps >= data.minRateBps &&
    typedBps <= data.maxRateBps;
  const s = data.stats;

  return (
    <View className="gap-3 rounded-2xl border border-border bg-card p-4">
      <Overline>{t("promoterCommission")}</Overline>
      <AppText variant="small">{t("rewardPeopleWhoSellYourTickets")}</AppText>
      {data.rateBps !== null ? (
        <AppText variant="bodyStrong">
          {t("promotersEarnOfEachTicket", { pct: pct(data.rateBps) })}
        </AppText>
      ) : null}
      {data.available ? (
        <View className="gap-2">
          <Field
            label={
              data.rateBps !== null
                ? t("changeToRange", {
                    min: pct(data.minRateBps),
                    max: pct(data.maxRateBps),
                  })
                : t("commissionRange", {
                    min: pct(data.minRateBps),
                    max: pct(data.maxRateBps),
                  })
            }
          >
            <Input
              value={rate}
              onChangeText={setRate}
              keyboardType="decimal-pad"
              placeholder="10"
              accessibilityLabel={t("commissionPercent")}
            />
          </Field>
          <View className="flex-row gap-2">
            <Button
              title={data.rateBps !== null ? t("update") : t("offerCommission")}
              className="flex-1"
              disabled={!valid}
              loading={save.isPending}
              onPress={() => save.mutate(typedBps)}
            />
            {data.rateBps !== null ? (
              <Button
                title={t("stop")}
                variant="outline"
                disabled={save.isPending}
                onPress={() => save.mutate(null)}
              />
            ) : null}
          </View>
        </View>
      ) : (
        <AppText variant="small" tone="muted">
          {t("promoterCommissionsArePausedOnAbonten")}
        </AppText>
      )}
      {s.sales > 0 ? (
        <View className="gap-1 border-t border-border pt-3">
          <AppText variant="small">
            {t("order", { sales: s.sales })}{" "}
            {t("byPromoter", { promoters: s.promoters })}{" "}
            {t("inTicketSales", {
              formatCredit: formatCredit(s.revenueMinor, data.currency, locale),
            })}
          </AppText>
          <AppText variant="small" tone="muted">
            {t("commissionPendingPaid", {
              formatCredit: formatCredit(s.pendingMinor, data.currency, locale),
              formatCredit2: formatCredit(s.paidMinor, data.currency, locale),
            })}
          </AppText>
        </View>
      ) : null}
    </View>
  );
}
