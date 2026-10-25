"use client";

import { getEventTicketPlanSetting } from "@/actions/ticketPlans/getEventTicketPlanSetting";
import { setEventTicketPlanSetting } from "@/actions/ticketPlans/setEventTicketPlanSetting";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/useToast";
import { actionUnreachable } from "@/utils/actionUnreachable";
import { formatMoney } from "@abonten/core/money/formatMoney";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { useTransition } from "react";

/**
 * The organizer's Pay small small switch for one event: buyers lock the
 * price, hold their tickets and pay in parts before a deadline; the
 * organizer is paid for each ticket when its plan is finished. Hidden while
 * the programme is not open to this organizer and the event has no plans.
 */
export default function PaySmallSmallCard({ eventId }: { eventId: string }) {
  const t = useTranslations("ticketPlans");
  const locale = useLocale();
  const toast = useToast();
  const qc = useQueryClient();
  const key = ["event-ticket-plans", eventId];
  const { data } = useQuery({
    queryKey: key,
    queryFn: () => getEventTicketPlanSetting({ eventId }),
    staleTime: 30_000,
  });
  const [pending, start] = useTransition();

  const setting = data?.status === 200 && "data" in data ? data.data : null;
  if (!setting) return null;
  if (!setting.available && !setting.enabled && setting.openPlans === 0) {
    return null;
  }

  const save = (enabled: boolean) =>
    start(async () => {
      const res = await setEventTicketPlanSetting({ eventId, enabled }).catch(
        actionUnreachable,
      );
      if (res.status === 200 && "data" in res && res.data) {
        qc.setQueryData(key, { status: 200, data: res.data });
        toast.success(res.message ?? t("saved"));
      } else {
        toast.error(res.message ?? t("couldNotSave"));
      }
    });

  return (
    <section className="mt-6 rounded-xl border border-border bg-card p-5 space-y-4">
      <div>
        <h2 className="font-semibold">{t("paySmallSmall")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("organizerCardBody")}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-medium">
          {setting.enabled ? t("organizerOn") : t("organizerOff")}
        </span>
        {setting.enabled ? (
          <Button
            variant="outline"
            disabled={pending}
            onClick={() => save(false)}
          >
            {t("turnOff")}
          </Button>
        ) : setting.available ? (
          <Button disabled={pending} onClick={() => save(true)}>
            {t("turnOn")}
          </Button>
        ) : (
          <span className="text-sm text-muted-foreground">
            {t("organizerUnavailable")}
          </span>
        )}
      </div>

      {setting.openPlans > 0 || setting.completedPlans > 0 ? (
        <dl className="grid grid-cols-2 gap-3 border-t border-border pt-3 text-sm md:grid-cols-4">
          <div>
            <dt className="text-muted-foreground">{t("openPlans")}</dt>
            <dd className="font-semibold tabular-nums">{setting.openPlans}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{t("ticketsHeld")}</dt>
            <dd className="font-semibold tabular-nums">
              {setting.ticketsHeld}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{t("paidSoFar")}</dt>
            <dd className="font-semibold tabular-nums">
              {setting.paidTowards.length === 0
                ? "—"
                : setting.paidTowards
                    .map((p) =>
                      formatMoney(
                        { amountMinor: p.amountMinor, currency: p.currency },
                        { locale },
                      ),
                    )
                    .join(" · ")}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{t("finishedPlans")}</dt>
            <dd className="font-semibold tabular-nums">
              {setting.completedPlans}
            </dd>
          </div>
        </dl>
      ) : null}
    </section>
  );
}
