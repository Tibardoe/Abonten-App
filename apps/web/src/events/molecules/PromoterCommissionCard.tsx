"use client";

import { getEventPromoterCommission } from "@/actions/getEventPromoterCommission";
import { setEventPromoterCommission } from "@/actions/setEventPromoterCommission";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/useToast";
import { formatCredit } from "@abonten/core/rewards/creditAmount";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
      const res = await setEventPromoterCommission({ eventId, rateBps });
      if (res.status === 200 && res.data) {
        qc.setQueryData(key, res);
        setRate("");
        toast.success(
          rateBps === null
            ? "Commission stopped. Tickets sold from now on don't earn it."
            : `Promoters now earn ${pct(rateBps)}% of each ticket they sell.`,
        );
      } else {
        toast.error(res.message ?? "Couldn't save the commission.");
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
        <h2 className="font-semibold">Promoter commission</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Reward people who sell your tickets. Anyone who shares this event and
          sells a ticket through their link gets your chosen share of the ticket
          price as Abonten Credit once the event is over. It comes off your
          payout for that sale, and nothing is paid on refunded or cancelled
          tickets.
        </p>
      </div>

      {offer.rateBps !== null ? (
        <p className="text-sm">
          Promoters earn{" "}
          <span className="font-semibold">{pct(offer.rateBps)}%</span> of each
          ticket they sell.
        </p>
      ) : null}

      {offer.available ? (
        <div className="flex flex-wrap items-end gap-2">
          <div className="text-sm">
            <label
              htmlFor={`promoter-rate-${eventId}`}
              className="block text-muted-foreground"
            >
              {offer.rateBps !== null ? "Change to" : "Commission"} (
              {pct(offer.minRateBps)}–{pct(offer.maxRateBps)}%)
            </label>
            <span className="mt-1 flex items-center gap-1">
              <Input
                id={`promoter-rate-${eventId}`}
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                inputMode="decimal"
                placeholder="10"
                className="w-24"
                aria-label="Commission percent"
              />
              <span className="text-sm text-muted-foreground">%</span>
            </span>
          </div>
          <Button disabled={pending || !valid} onClick={() => save(typedBps)}>
            {offer.rateBps !== null ? "Update" : "Offer commission"}
          </Button>
          {offer.rateBps !== null ? (
            <Button
              variant="outline"
              disabled={pending}
              onClick={() => save(null)}
            >
              Stop
            </Button>
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Promoter commissions are paused on Abonten, so tickets sold now
          don&apos;t earn one.
        </p>
      )}

      {s.sales > 0 ? (
        <dl className="grid grid-cols-2 gap-3 border-t border-border pt-3 text-sm md:grid-cols-4">
          <div>
            <dt className="text-muted-foreground">Orders by promoters</dt>
            <dd className="font-semibold tabular-nums">{s.sales}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Ticket sales</dt>
            <dd className="font-semibold tabular-nums">
              {formatCredit(s.revenueMinor)}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Commission pending</dt>
            <dd className="font-semibold tabular-nums">
              {formatCredit(s.pendingMinor)}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Commission paid</dt>
            <dd className="font-semibold tabular-nums">
              {formatCredit(s.paidMinor)}
            </dd>
          </div>
        </dl>
      ) : null}
    </section>
  );
}
