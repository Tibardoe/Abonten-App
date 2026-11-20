"use client";

import giveComplimentaryTickets from "@/actions/giveComplimentaryTickets";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/useToast";
import { actionUnreachable } from "@/utils/actionUnreachable";
import { ticketTypeLabel } from "@abonten/core/ticketTiers";
import { formatInTimeZone } from "@abonten/core/time/timeZone";
import type { ManagedEvent } from "@abonten/types/managedEventType";
import { useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";

/**
 * Manage › Details: give free tickets to a named person (cast, press,
 * sponsors; docs/architecture/complimentary-tickets.md). They are real
 * tickets on that person's account, counted against the seats, seated and
 * checked in like any other, never refundable.
 */
export default function GiveComplimentaryCard({
  event,
}: { event: ManagedEvent }) {
  const t = useTranslations("events");
  const tc = useTranslations("core");
  const locale = useLocale();
  const toast = useToast();
  const qc = useQueryClient();
  const types = event.ticket_type ?? [];
  // Dates still to come (a ticket for a date that has started can't be given).
  const occurrences = [...(event.event_occurrence ?? [])]
    .filter((o) => new Date(o.ends_at).getTime() > Date.now())
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));

  const [typeId, setTypeId] = useState(types[0]?.id ?? "");
  const [quantity, setQuantity] = useState("1");
  const [who, setWho] = useState("");
  const [note, setNote] = useState("");
  const [occurrenceId, setOccurrenceId] = useState(occurrences[0]?.id ?? "");
  const [pending, start] = useTransition();

  if (types.length === 0) return null;

  const give = () =>
    start(async () => {
      const raw = who.trim();
      const target = /^[+\d][\d\s-]{5,}$/.test(raw)
        ? { kind: "phone" as const, phone: raw }
        : { kind: "username" as const, username: raw.replace(/^@/, "") };
      const res = await giveComplimentaryTickets({
        eventId: event.id,
        ticketTypeId: typeId,
        quantity: Number(quantity),
        occurrenceId: occurrences.length > 0 ? occurrenceId : null,
        target,
        note: note.trim() || null,
      }).catch(actionUnreachable);
      if (res.status === 200) {
        toast.success(res.message);
        setWho("");
        setNote("");
        setQuantity("1");
        qc.invalidateQueries();
      } else {
        toast.error(res.message ?? t("couldNotGiveTickets"));
      }
    });

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-4 text-card-foreground">
      <div>
        <h2 className="font-semibold text-lg">{t("giveFreeTickets")}</h2>
        <p className="text-sm text-muted-foreground">
          {t("giveFreeTicketsIntro")}
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <label htmlFor="comp-who" className="text-sm text-muted-foreground">
            {t("giveTo")}
          </label>
          <Input
            id="comp-who"
            value={who}
            placeholder={t("giveToPlaceholder")}
            onChange={(e) => setWho(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="comp-type" className="text-sm text-muted-foreground">
            {t("ticketType")}
          </label>
          <select
            id="comp-type"
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={typeId}
            onChange={(e) => setTypeId(e.target.value)}
          >
            {types.map((type) => (
              <option key={type.id} value={type.id}>
                {ticketTypeLabel(tc, type.type)}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor="comp-qty" className="text-sm text-muted-foreground">
            {t("howMany")}
          </label>
          <Input
            id="comp-qty"
            type="number"
            min={1}
            max={40}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
        </div>
        {occurrences.length > 0 && (
          <div className="space-y-1">
            <label
              htmlFor="comp-date"
              className="text-sm text-muted-foreground"
            >
              {t("forDate")}
            </label>
            <select
              id="comp-date"
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={occurrenceId}
              onChange={(e) => setOccurrenceId(e.target.value)}
            >
              {occurrences.map((o) => (
                <option key={o.id} value={o.id}>
                  {formatInTimeZone(
                    o.starts_at,
                    event.timezone,
                    {
                      weekday: "short",
                      day: "numeric",
                      month: "short",
                      hour: "numeric",
                      minute: "2-digit",
                    },
                    locale,
                  )}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
      <div className="space-y-1">
        <label htmlFor="comp-note" className="text-sm text-muted-foreground">
          {t("noteOptional")}
        </label>
        <Input
          id="comp-note"
          value={note}
          maxLength={200}
          placeholder={t("compNotePlaceholder")}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>
      <Button
        type="button"
        disabled={pending || !who.trim() || !typeId || Number(quantity) < 1}
        onClick={give}
      >
        {t("giveTickets")}
      </Button>
    </div>
  );
}
