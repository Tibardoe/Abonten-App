import { api } from "@/lib/api";
import { formatCredit } from "@abonten/core/rewards/creditAmount";
import {
  AppText,
  Button,
  Field,
  Input,
  Overline,
  useToast,
} from "@abonten/ui-native";
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
  const toast = useToast();
  const qc = useQueryClient();
  const key = ["mobile", "organizer", "promoter-commission", eventId];
  const { data } = useQuery({
    queryKey: key,
    queryFn: async () => {
      const res = await api.organizer.eventPromoterCommission(eventId);
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
            ? "Commission stopped"
            : `Promoters now earn ${pct(rateBps)}% of each ticket`,
        );
      } else {
        toast.error("Couldn't save the commission", {
          description: res.message ?? "Please try again.",
        });
      }
    },
    onError: () =>
      toast.error("Couldn't save the commission", {
        description: "Please try again.",
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
      <Overline>Promoter commission</Overline>
      <AppText variant="small">
        Reward people who sell your tickets. Anyone who shares this event and
        sells a ticket through their link gets your chosen share of the ticket
        price as Abonten Credit once the event is over. It comes off your payout
        for that sale; refunded or cancelled tickets earn nothing.
      </AppText>
      {data.rateBps !== null ? (
        <AppText variant="bodyStrong">
          Promoters earn {pct(data.rateBps)}% of each ticket.
        </AppText>
      ) : null}
      {data.available ? (
        <View className="gap-2">
          <Field
            label={`${data.rateBps !== null ? "Change to" : "Commission"} (${pct(data.minRateBps)}–${pct(data.maxRateBps)}%)`}
          >
            <Input
              value={rate}
              onChangeText={setRate}
              keyboardType="decimal-pad"
              placeholder="10"
              accessibilityLabel="Commission percent"
            />
          </Field>
          <View className="flex-row gap-2">
            <Button
              title={data.rateBps !== null ? "Update" : "Offer commission"}
              className="flex-1"
              disabled={!valid}
              loading={save.isPending}
              onPress={() => save.mutate(typedBps)}
            />
            {data.rateBps !== null ? (
              <Button
                title="Stop"
                variant="outline"
                disabled={save.isPending}
                onPress={() => save.mutate(null)}
              />
            ) : null}
          </View>
        </View>
      ) : (
        <AppText variant="small" tone="muted">
          Promoter commissions are paused on Abonten, so tickets sold now don't
          earn one.
        </AppText>
      )}
      {s.sales > 0 ? (
        <View className="gap-1 border-t border-border pt-3">
          <AppText variant="small">
            {s.sales} order{s.sales === 1 ? "" : "s"} by {s.promoters} promoter
            {s.promoters === 1 ? "" : "s"} · {formatCredit(s.revenueMinor)} in
            ticket sales
          </AppText>
          <AppText variant="small" tone="muted">
            {formatCredit(s.pendingMinor)} commission pending ·{" "}
            {formatCredit(s.paidMinor)} paid
          </AppText>
        </View>
      ) : null}
    </View>
  );
}
