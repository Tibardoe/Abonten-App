"use client";

import { getEventPromoterCommission } from "@/actions/getEventPromoterCommission";
import { setEventPromoterCommission } from "@/actions/setEventPromoterCommission";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/useToast";
import { actionUnreachable } from "@/utils/actionUnreachable";
import { formatCredit } from "@abonten/core/rewards/creditAmount";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";

const pct = (bps: number) => Number((bps / 100).toFixed(2));

/**
 * Organizer-funded promoter commission on one event (Rewards Phase 8):
 * whoever's share link sells a ticket gets this share of the price as
 * Abonten Credit after the event, and it comes off the organizer's payout
 * for that sale. Hidden while commissions aren't switched on.
 */
export default function PromoterCommissionCard({
  eventId,
}: {
  eventId: string;
}) {
  const locale = useLocale();
  const t = useTranslations("events");

  const toast = useToast();
  const qc = useQueryClient();
  const key = ["promoter-commission", eventId];
  const { data } = useQuery({
    queryKey: key,
    queryFn: () => getEventPromoterCommission(eventId),
    staleTime: 30_000,
  });
  const [rate, setRate] = useState<string>("");
  const [pending, start] = useTransition();

  const offer = data?.status === 200 ? data.data : undefined;
  if (!offer || (!offer.available && offer.rateBps === null)) return null;

  const save = (rateBps: number | null) =>
    start(async () => {
      const res = await setEventPromoterCommission({ eventId, rateBps }).catch(
        actionUnreachable,
      );
      if (res.status === 200 && res.data) {
        qc.setQueryData(key, res);
        setRate("");
        toast.success(
          rateBps === null
            ? t("commissionStoppedTicketsSoldFromNow")
            : t("promotersNowEarnOfEachTicket", { pct: pct(rateBps) }),
        );
      } else {
        toast.error(res.message ?? t("couldnTSaveTheCommission"));
      }
    });

  const typed = Number(rate);
  const typedBps = Math.round(typed * 100);
  const valid =
    rate.trim() !== "" &&
    Number.isFinite(typed) &&
    typedBps >= offer.minRateBps &&
    typedBps <= offer.maxRateBps;
  const s = offer.stats;

  return (
    <section className="mt-6 rounded-xl border border-border bg-card p-5 space-y-4">
      <div>
        <h2 className="font-semibold">{t("promoterCommission")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("rewardPeopleWhoSellYourTickets")}
        </p>
      </div>

      {offer.rateBps !== null ? (
        <p className="text-sm">
          {t.rich("promotersEarnRate", {
            rate: pct(offer.rateBps),
            strong: (chunks) => <span className="font-semibold">{chunks}</span>,
          })}
        </p>
      ) : null}

      {offer.available ? (
        <div className="flex flex-wrap items-end gap-2">
          <div className="text-sm">
            <label
              htmlFor={`promoter-rate-${eventId}`}
              className="block text-muted-foreground"
            >
              {t(offer.rateBps !== null ? "changeToRange" : "commissionRange", {
                min: pct(offer.minRateBps),
                max: pct(offer.maxRateBps),
              })}
            </label>
            <span className="mt-1 flex items-center gap-1">
              <Input
                id={`promoter-rate-${eventId}`}
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                inputMode="decimal"
                placeholder="10"
                className="w-24"
                aria-label={t("commissionPercent")}
              />
              <span className="text-sm text-muted-foreground">%</span>
            </span>
          </div>
          <Button disabled={pending || !valid} onClick={() => save(typedBps)}>
            {offer.rateBps !== null ? t("update") : t("offerCommission")}
          </Button>
          {offer.rateBps !== null ? (
            <Button
              variant="outline"
              disabled={pending}
              onClick={() => save(null)}
            >
              {t("stop")}
            </Button>
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          {t("promoterCommissionsArePausedOnAbonten")}
        </p>
      )}

      {s.sales > 0 ? (
        <dl className="grid grid-cols-2 gap-3 border-t border-border pt-3 text-sm md:grid-cols-4">
          <div>
            <dt className="text-muted-foreground">{t("ordersByPromoters")}</dt>
            <dd className="font-semibold tabular-nums">{s.sales}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{t("ticketSales")}</dt>
            <dd className="font-semibold tabular-nums">
              {formatCredit(s.revenueMinor, offer.currency, locale)}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{t("commissionPending")}</dt>
            <dd className="font-semibold tabular-nums">
              {formatCredit(s.pendingMinor, offer.currency, locale)}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{t("commissionPaid")}</dt>
            <dd className="font-semibold tabular-nums">
              {formatCredit(s.paidMinor, offer.currency, locale)}
            </dd>
          </div>
        </dl>
      ) : null}
    </section>
  );
}
