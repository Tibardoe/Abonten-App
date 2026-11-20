"use client";

import addShowPass from "@/actions/addShowPass";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/useToast";
import { actionUnreachable } from "@/utils/actionUnreachable";
import { formatMoney } from "@abonten/core/formatMoney";
import type { ManagedEvent } from "@abonten/types/managedEventType";
import { useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

/**
 * Manage › Details, on a run of shows: sell a pass for several shows
 * (docs/architecture/show-passes.md). The pass goes on sale on every show
 * still to come; the ticket bought admits to its show and lets its holder
 * choose the others from the ticket.
 */
export default function ManageEventPassCard({
  event,
}: {
  event: ManagedEvent;
}) {
  const t = useTranslations("events");
  const locale = useLocale();
  const toast = useToast();
  const router = useRouter();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [shows, setShows] = useState("3");
  const [price, setPrice] = useState("");
  const [quantity, setQuantity] = useState("");
  const [pending, start] = useTransition();

  if (!event.series_id) return null;
  const currency = event.currency ?? event.ticket_type?.[0]?.currency ?? null;
  const passes = (event.ticket_type ?? []).filter((x) => x.pass_shows != null);

  const priceLabel = (amount: number | null) =>
    formatMoney(currency, amount, { locale });

  const save = () =>
    start(async () => {
      const res = await addShowPass({
        eventId: event.id,
        name: name.trim(),
        shows: Number(shows),
        price: Number(price),
        quantity: quantity.trim() ? Number(quantity) : null,
      }).catch(actionUnreachable);
      if (res.status === 200) {
        toast.success(res.message);
        setName("");
        setPrice("");
        setQuantity("");
        qc.invalidateQueries({ queryKey: ["event-shows", event.id] });
        router.refresh();
      } else {
        toast.error(res.message ?? t("couldNotSellPass"));
      }
    });

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-4 text-card-foreground">
      <div>
        <h2 className="font-semibold text-lg">{t("passesTitle")}</h2>
        <p className="text-sm text-muted-foreground">{t("passesIntro")}</p>
      </div>

      {passes.length > 0 ? (
        <ul className="space-y-1 text-sm">
          {passes.map((p) => (
            <li key={p.id} className="flex justify-between gap-2">
              <span className="font-medium">{p.type}</span>
              <span className="text-muted-foreground">
                {t("passSummary", {
                  shows: p.pass_shows ?? 0,
                  price: priceLabel(p.price),
                  limited: p.quantity == null ? "no" : "yes",
                  left: p.quantity ?? 0,
                })}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <label htmlFor="pass-name" className="text-sm text-muted-foreground">
            {t("passName")}
          </label>
          <Input
            id="pass-name"
            value={name}
            maxLength={60}
            placeholder={t("passNamePlaceholder")}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="pass-shows" className="text-sm text-muted-foreground">
            {t("passShows")}
          </label>
          <Input
            id="pass-shows"
            type="number"
            min={2}
            max={30}
            value={shows}
            onChange={(e) => setShows(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="pass-price" className="text-sm text-muted-foreground">
            {currency ? t("passPriceIn", { currency }) : t("passPrice")}
          </label>
          <Input
            id="pass-price"
            type="number"
            min={0}
            step="any"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="pass-qty" className="text-sm text-muted-foreground">
            {t("passesPerShow")}
          </label>
          <Input
            id="pass-qty"
            type="number"
            min={1}
            value={quantity}
            placeholder={t("noLimit")}
            onChange={(e) => setQuantity(e.target.value)}
          />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{t("passesHowItWorks")}</p>
      <Button
        type="button"
        disabled={
          pending || !name.trim() || Number(shows) < 2 || !(Number(price) > 0)
        }
        onClick={save}
      >
        {t("sellPass")}
      </Button>
    </div>
  );
}
