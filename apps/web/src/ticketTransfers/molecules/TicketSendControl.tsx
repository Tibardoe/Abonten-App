"use client";

import { cancelTicketTransfer } from "@/actions/ticketTransfers/cancelTicketTransfer";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/useToast";
import { actionUnreachable } from "@/utils/actionUnreachable";
import { formatDateTime } from "@abonten/core/i18n/format";
import { personName } from "@abonten/core/personName";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import {
  useRefreshAfterTransfer,
  useTicketTransfers,
} from "../useTicketTransfers";
import SendTicketDialog from "./SendTicketDialog";

/**
 * On a ticket card: "Send to a friend", or, while an offer is open, who it
 * is waiting for and "Take it back". Shown only for a live ticket and only
 * while the programme is open to the person (the server re-checks every
 * rule when sending).
 */
export default function TicketSendControl({
  ticketId,
  eventTitle,
  live,
}: {
  ticketId: string;
  eventTitle: string;
  /** Active, not checked in, the event neither over nor cancelled. */
  live: boolean;
}) {
  const t = useTranslations("tickets");
  const tc = useTranslations("core");
  const locale = useLocale();
  const toast = useToast();
  const refresh = useRefreshAfterTransfer();
  const { data } = useTicketTransfers();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const pending = data?.outgoing.find((o) => o.ticketId === ticketId) ?? null;

  if (pending) {
    const who = pending.to
      ? (personName(tc, {
          full_name: pending.to.name,
          username: pending.to.username,
        }) ?? "")
      : (pending.toPhoneMasked ?? "");
    const takeBack = async () => {
      setBusy(true);
      const res = await cancelTicketTransfer({ transferId: pending.id }).catch(
        actionUnreachable,
      );
      setBusy(false);
      if (res.status === 200) toast.success(t("takenBackToast"));
      else toast.error(res.message ?? t("couldNotSend"));
      refresh();
    };
    return (
      <div className="w-full rounded-lg bg-muted/60 p-2.5 space-y-1.5">
        <p className="text-sm font-medium">{t("waitingFor", { name: who })}</p>
        <p className="text-xs text-muted-foreground">
          {t("acceptByThem", {
            date: formatDateTime(pending.expiresAt, locale),
          })}
        </p>
        {pending.toPhoneTexted === false && (
          <p className="text-xs text-amber-700 dark:text-amber-300">
            {t("notTextedHint")}
          </p>
        )}
        <Button size="sm" variant="outline" disabled={busy} onClick={takeBack}>
          {t("takeBack")}
        </Button>
      </div>
    );
  }

  if (!live || !data?.program.enabled) return null;

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        {t("sendTicket")}
      </Button>
      <SendTicketDialog
        open={open}
        onOpenChange={setOpen}
        ticketId={ticketId}
        eventTitle={eventTitle}
      />
    </>
  );
}
