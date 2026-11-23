"use client";

import checkInTicket from "@/actions/checkInTicket";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { actionUnreachable } from "@/utils/actionUnreachable";
import type { CheckedInTicket } from "@abonten/services/tickets/checkInTicketCore";
import { useTranslations } from "next-intl";
import { useState } from "react";
import CheckedInTicketPanel from "./CheckedInTicketPanel";

/**
 * Door staff check people in by the code under their QR (a hardware
 * scanner types it here too). They see whether it worked, never the
 * attendee list. Only this event's tickets are accepted.
 */
export default function CheckInByCodeCard({ eventId }: { eventId: string }) {
  const t = useTranslations("teams");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{
    ok: boolean;
    text: string;
    /** The ticket just admitted: its type, note and any amount paid. */
    ticket?: CheckedInTicket;
  } | null>(null);

  const submit = async () => {
    const value = code.trim().toUpperCase().replace(/\s+/g, "");
    if (!value) return;
    setBusy(true);
    const res = await checkInTicket(value, true, eventId).catch(
      actionUnreachable,
    );
    setBusy(false);
    setResult({
      ok: res.status === 200,
      text:
        res.message ?? (res.status === 200 ? t("checkedIn") : t("couldNotDo")),
      ticket: res.status === 200 && "ticket" in res ? res.ticket : undefined,
    });
    if (res.status === 200) setCode("");
  };

  return (
    <section className="space-y-4 rounded-xl border border-border bg-card p-5">
      <div className="space-y-1">
        <h2 className="font-semibold">{t("checkInTitle")}</h2>
        <p className="text-sm text-muted-foreground">{t("checkInBody")}</p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="check-in-code">{t("ticketCodeLabel")}</Label>
        <div className="flex gap-2">
          <Input
            id="check-in-code"
            value={code}
            autoFocus
            autoComplete="off"
            placeholder={t("codePlaceholder")}
            onChange={(e) => {
              setCode(e.target.value);
              setResult(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") void submit();
            }}
          />
          <Button disabled={busy || !code.trim()} onClick={() => void submit()}>
            {t("checkIn")}
          </Button>
        </div>
      </div>
      {result ? (
        <output
          className={
            result.ok
              ? "block rounded-lg bg-emerald-500/15 p-3 text-sm font-medium text-emerald-700 dark:text-emerald-300"
              : "block rounded-lg bg-destructive/10 p-3 text-sm font-medium text-destructive"
          }
        >
          {result.text}
          {result.ticket ? (
            <div className="mt-3">
              <CheckedInTicketPanel ticket={result.ticket} />
            </div>
          ) : null}
        </output>
      ) : null}
    </section>
  );
}
