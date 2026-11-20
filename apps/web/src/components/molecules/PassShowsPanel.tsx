"use client";

import claimShowPass from "@/actions/claimShowPass";
import getShowPass from "@/actions/getShowPass";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/useToast";
import { answerOrThrow } from "@abonten/core/envelopeFailure";
import {
  type PassShow,
  passChoicesLeft,
  passShowChoosable,
} from "@abonten/core/showPasses";
import { formatInTimeZone } from "@abonten/core/time/timeZone";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";

/**
 * On a pass ticket: the run's shows, which ones the pass holds a ticket
 * for, and a button to choose another (docs/architecture/show-passes.md).
 * Each choice is a ticket of its own, in the holder's tickets.
 */
export default function PassShowsPanel({ ticketId }: { ticketId: string }) {
  const t = useTranslations("tickets");
  const locale = useLocale();
  const toast = useToast();
  const qc = useQueryClient();
  const key = ["show-pass", ticketId];
  const { data: state, isError } = useQuery({
    queryKey: key,
    queryFn: async () => {
      const res = answerOrThrow(await getShowPass(ticketId));
      return res.status === 200 ? res.data : null;
    },
  });
  const choose = useMutation({
    mutationFn: (eventId: string) => claimShowPass({ ticketId, eventId }),
    onSuccess: (res) => {
      if (res.status === 200) {
        toast.success(res.message);
        qc.invalidateQueries({ queryKey: key });
        qc.invalidateQueries({ queryKey: ["attending-events"] });
        qc.invalidateQueries({ queryKey: ["attending-events-counts"] });
      } else {
        toast.error(res.message ?? t("couldNotChooseShow"));
      }
    },
    onError: () => toast.error(t("couldNotChooseShow")),
  });

  if (isError) {
    return (
      <p className="text-sm text-muted-foreground">{t("passCouldNotLoad")}</p>
    );
  }
  if (!state) return null;

  const left = passChoicesLeft(state);
  const when = (show: PassShow) =>
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
    <section className="space-y-3 rounded-2xl border border-border p-4">
      <div>
        <h2 className="font-semibold">{t("passYourShows")}</h2>
        <p className="text-sm text-muted-foreground">
          {t("passShowsLeft", { left, total: state.showsTotal })}
        </p>
      </div>
      <ul className="space-y-2">
        {state.shows.map((show) => {
          const held =
            show.ticketId &&
            (show.ticketStatus === "active" || show.ticketStatus === "used");
          return (
            <li
              key={show.eventId}
              className="flex items-center justify-between gap-3 text-sm"
            >
              <span className={held ? "font-semibold" : undefined}>
                {when(show)}
              </span>
              {held ? (
                <span className="text-muted-foreground">
                  {show.isBoughtShow ? t("passBoughtShow") : t("passChosen")}
                </span>
              ) : passShowChoosable(state, show) ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={choose.isPending}
                  onClick={() => choose.mutate(show.eventId)}
                >
                  {t("passChoose")}
                </Button>
              ) : (
                <span className="text-muted-foreground">
                  {show.status === "canceled"
                    ? t("passShowCancelled")
                    : show.started
                      ? t("passShowStarted")
                      : !show.hasPass || show.passesLeft === 0
                        ? t("passShowFull")
                        : "—"}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
