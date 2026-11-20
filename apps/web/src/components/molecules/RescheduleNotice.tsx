"use client";

import getEventReschedule from "@/actions/getEventReschedule";
import keepTicketsAfterReschedule from "@/actions/keepTicketsAfterReschedule";
import refundAfterReschedule from "@/actions/refundAfterReschedule";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/hooks/useConfirm";
import { useToast } from "@/hooks/useToast";
import { actionUnreachable } from "@/utils/actionUnreachable";
import { answerOrThrow } from "@abonten/core/envelopeFailure";
import { formatMoney } from "@abonten/core/money/formatMoney";
import { formatInTimeZone } from "@abonten/core/time/timeZone";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { useTransition } from "react";

const WHEN: Intl.DateTimeFormatOptions = {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
};

/**
 * On a ticket for an event the organizer moved or postponed
 * (docs/architecture/event-reschedule.md): what changed (the date, the
 * venue, one date of several, or no date yet), their message, and the
 * choice — keep the ticket, or give it back for the ticket price and the
 * service fee while the window is open (while postponed: until the new
 * date is set). Renders nothing for an event that never moved.
 */
export default function RescheduleNotice({
  eventId,
  ticketsQueryKey,
}: {
  eventId: string;
  /** The tickets list to refresh after giving tickets back. */
  ticketsQueryKey: unknown[];
}) {
  const t = useTranslations("tickets");
  const locale = useLocale();
  const toast = useToast();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const key = ["event-reschedule", eventId];
  const { data: move } = useQuery({
    queryKey: key,
    queryFn: async () => {
      const res = answerOrThrow(await getEventReschedule(eventId));
      return res.status === 200 ? res.data : null;
    },
    staleTime: 60_000,
  });
  const [pending, start] = useTransition();
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

  function keep() {
    start(async () => {
      const res =
        await keepTicketsAfterReschedule(eventId).catch(actionUnreachable);
      if (res.status === 200) {
        toast.success(res.message);
        qc.invalidateQueries({ queryKey: key });
      } else {
        toast.error(res.message);
      }
    });
  }

  async function giveBack() {
    if (!move) return;
    const ok = await confirm({
      title: t("rescheduleRefundConfirmTitle", { count: move.activeTickets }),
      message: amount
        ? t("rescheduleRefundConfirmPaid", { amount })
        : t("rescheduleRefundConfirmFree"),
      confirmLabel: amount
        ? t("rescheduleRefundAmount", { amount })
        : t("rescheduleGiveBack", { count: move.activeTickets }),
    });
    if (!ok) return;
    start(async () => {
      const res = await refundAfterReschedule(eventId).catch(actionUnreachable);
      if (res.status === 200) {
        toast.success(res.message);
        qc.invalidateQueries({ queryKey: key });
        qc.invalidateQueries({ queryKey: ticketsQueryKey });
        qc.invalidateQueries({ queryKey: ["attending-events-counts"] });
      } else {
        toast.error(res.message);
      }
    });
  }

  // Keeping is not final: until the window closes the holder may still
  // give the tickets back.
  const canChoose = move.refundOpen && move.activeTickets > 0;
  const postponed = move.kind === "postpone";
  const dateChanged =
    !postponed && !!move.startsAt && move.startsAt !== move.previousStartsAt;
  const venueOnly = !!move.venue && !dateChanged && !postponed;
  const heading = postponed
    ? t("rescheduleBannerTitlePostponed")
    : move.occurrenceId
      ? t("rescheduleBannerTitleOneDate")
      : venueOnly
        ? t("rescheduleBannerTitleVenue")
        : t("rescheduleBannerTitle");

  return (
    <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-700 dark:bg-amber-950/40">
      <p className="font-semibold">{heading}</p>
      {postponed ? (
        <p>
          {t("rescheduleBannerPostponed", {
            previous: when(move.previousStartsAt),
          })}
        </p>
      ) : (
        dateChanged &&
        move.startsAt && (
          <p>
            {t("rescheduleBannerDates", {
              previous: when(move.previousStartsAt),
              now: when(move.startsAt),
            })}
          </p>
        )
      )}
      {move.venue && (
        <p>
          {move.previousVenue
            ? t("rescheduleBannerVenues", {
                previous: move.previousVenue,
                venue: move.venue,
              })
            : t("rescheduleBannerVenue", { venue: move.venue })}
        </p>
      )}
      <div className="space-y-0.5">
        <p className="text-xs text-muted-foreground">
          {t("rescheduleBannerMessageLabel")}
        </p>
        <p className="whitespace-pre-line">{move.message}</p>
      </div>
      {move.activeTickets > 0 &&
        (move.choice === "keep" ? (
          <p className="text-muted-foreground">
            {venueOnly ? t("rescheduleKeptNoteVenue") : t("rescheduleKeptNote")}
          </p>
        ) : move.refundOpen ? (
          <p className="text-muted-foreground">
            {postponed || !move.refundUntil
              ? t("rescheduleBannerChoicePostponed")
              : venueOnly
                ? t("rescheduleBannerChoiceVenue", {
                    refundUntil: when(move.refundUntil),
                  })
                : t("rescheduleBannerChoice", {
                    refundUntil: when(move.refundUntil),
                  })}
          </p>
        ) : (
          move.refundUntil && (
            <p className="text-muted-foreground">
              {t("rescheduleClosedNote", {
                refundUntil: when(move.refundUntil),
              })}
            </p>
          )
        ))}
      {canChoose && move.refundBlocked && (
        <p className="text-muted-foreground">{move.refundBlocked}</p>
      )}
      {canChoose && (
        <div className="flex flex-wrap gap-2 pt-1">
          {move.choice !== "keep" && (
            <Button size="sm" onClick={keep} disabled={pending}>
              {t("rescheduleKeep", { count: move.activeTickets })}
            </Button>
          )}
          {!move.refundBlocked && (
            <Button
              size="sm"
              variant="outline"
              onClick={giveBack}
              disabled={pending}
            >
              {amount
                ? t("rescheduleRefundAmount", { amount })
                : t("rescheduleGiveBack", { count: move.activeTickets })}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
