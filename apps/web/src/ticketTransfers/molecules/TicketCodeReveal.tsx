"use client";

import { formatTicketCodeForReading } from "@abonten/core/ticketTransfers/ticketCode";
import { useTranslations } from "next-intl";
import { useState } from "react";

/**
 * The ticket's code, hidden until the holder taps "Show code" (decision
 * X16): a photo or screenshot of the ticket no longer gives the code away.
 * The QR above it still scans; the code is for reading out at a help desk.
 */
export default function TicketCodeReveal({ code }: { code: string | null }) {
  const t = useTranslations("tickets");
  const [shown, setShown] = useState(false);
  if (!code) return null;
  return (
    <div className="mb-2 text-sm text-muted-foreground">
      <div className="flex flex-wrap items-center gap-2">
        <span>{t("ticketCodeLabel")}</span>
        {shown ? (
          <span className="font-mono tracking-wider text-foreground">
            {formatTicketCodeForReading(code)}
          </span>
        ) : null}
        <button
          type="button"
          className="text-primary underline-offset-2 hover:underline"
          aria-expanded={shown}
          onClick={() => setShown((v) => !v)}
        >
          {shown ? t("hideCode") : t("showCode")}
        </button>
      </div>
      {shown ? <p className="mt-1 text-xs">{t("keepCodePrivate")}</p> : null}
    </div>
  );
}
