"use client";

import { getEventTicketTransferSetting } from "@/actions/ticketTransfers/getEventTicketTransferSetting";
import { setEventTicketTransferSetting } from "@/actions/ticketTransfers/setEventTicketTransferSetting";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/useToast";
import { actionUnreachable } from "@/utils/actionUnreachable";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useTransition } from "react";

/**
 * The organizer's switch for one event (decision X1): guests may send its
 * tickets to friends unless it is turned off, for example when guests must
 * be named in advance. Hidden while sending is not open to this organizer.
 */
export default function TicketTransferOrganizerCard({
  eventId,
}: {
  eventId: string;
}) {
  const t = useTranslations("tickets");
  const toast = useToast();
  const qc = useQueryClient();
  const key = ["event-ticket-transfers", eventId];
  const { data } = useQuery({
    queryKey: key,
    queryFn: () => getEventTicketTransferSetting({ eventId }),
    staleTime: 30_000,
  });
  const [pending, start] = useTransition();

  const setting = data?.status === 200 && "data" in data ? data.data : null;
  if (!setting?.programEnabled) return null;

  const save = (enabled: boolean) =>
    start(async () => {
      const res = await setEventTicketTransferSetting({
        eventId,
        enabled,
      }).catch(actionUnreachable);
      if (res.status === 200 && "data" in res && res.data) {
        qc.setQueryData(key, {
          status: 200,
          data: { ...setting, enabled: res.data.enabled },
        });
        toast.success(t("organizerSaved"));
      } else {
        toast.error(res.message ?? t("organizerCouldNotSave"));
      }
    });

  return (
    <section className="mt-6 rounded-xl border border-border bg-card p-5 space-y-4">
      <div>
        <h2 className="font-semibold">{t("organizerCardTitle")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("organizerCardBody")}
        </p>
        {setting.enabled && (
          <p className="mt-1 text-sm text-muted-foreground">
            {t("organizerOffClosesOffers")}
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-medium">
          {setting.enabled ? t("organizerSendingOn") : t("organizerSendingOff")}
        </span>
        <Button
          variant={setting.enabled ? "outline" : "default"}
          disabled={pending}
          onClick={() => save(!setting.enabled)}
        >
          {setting.enabled ? t("organizerTurnOff") : t("organizerTurnOn")}
        </Button>
      </div>
    </section>
  );
}
