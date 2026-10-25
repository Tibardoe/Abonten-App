"use client";

import { formatPercent } from "@abonten/core/i18n/format";
import { formatMoney } from "@abonten/core/money/formatMoney";
import { planMomentText } from "@abonten/core/ticketPlans/display";
import { planMinimums } from "@abonten/core/ticketPlans/rules";
import type { TicketPlanOffer } from "@abonten/types/ticketPlanType";
import { useLocale, useTranslations } from "next-intl";

export type PayMode = "full" | "plan";

type AvailableOffer = Extract<TicketPlanOffer, { available: true }>;

/**
 * In the checkout: pay the whole price now, or pay small small — lock the
 * price, hold the tickets, pay in parts until the deadline. The terms are
 * spelled out before anything starts, including what happens if the plan
 * is not finished.
 */
export default function PaySmallSmallChoice({
  offer,
  mode,
  onModeChange,
  totalMinor,
  ticketCount,
}: {
  offer: AvailableOffer;
  mode: PayMode;
  onModeChange: (mode: PayMode) => void;
  /** The order's total (tickets + fee), in minor units. */
  totalMinor: number;
  ticketCount: number;
}) {
  const t = useTranslations("ticketPlans");
  const locale = useLocale();
  const deadline = planMomentText(offer.deadlineAt, offer.timezone, locale);
  const minimums = planMinimums(totalMinor, offer);
  const say = (amountMinor: number) =>
    formatMoney({ amountMinor, currency: offer.currency }, { locale });
  const tooMany = ticketCount > offer.maxTickets;

  const option = (value: PayMode, title: string, line: string) => (
    <label
      className={`flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 text-sm ${
        mode === value ? "border-primary bg-primary/5" : "border-border"
      }`}
    >
      <input
        type="radio"
        name="pay-mode"
        className="mt-1"
        checked={mode === value}
        onChange={() => onModeChange(value)}
      />
      <span className="flex flex-col gap-0.5">
        <span className="font-semibold">{title}</span>
        <span className="text-muted-foreground">{line}</span>
      </span>
    </label>
  );

  return (
    <fieldset className="space-y-2">
      <legend className="mb-1 text-sm font-semibold">
        {t("howDoYouWantToPay")}
      </legend>
      {option("full", t("payInFull"), t("payInFullLine"))}
      {option("plan", t("paySmallSmall"), t("paySmallSmallLine", { deadline }))}

      {mode === "plan" ? (
        <ul className="list-disc space-y-1 rounded-xl bg-muted px-8 py-3 text-xs text-muted-foreground">
          <li>
            {totalMinor > 0
              ? t("termFirstPart", {
                  amount: say(minimums.firstPartMinMinor),
                  pct: formatPercent(offer.firstPartMinBps / 100, locale),
                })
              : t("termFirstPartShare", {
                  pct: formatPercent(offer.firstPartMinBps / 100, locale),
                })}
          </li>
          <li>
            {t("termLaterParts", {
              pct: formatPercent(offer.partMinBps / 100, locale),
            })}
          </li>
          <li>{t("termTicketsWhenPaid")}</li>
          <li>
            {offer.keepFeeOnRefund
              ? t("termNotFinishedKeepsFee", { deadline })
              : t("termNotFinishedFullRefund", { deadline })}
          </li>
          <li>{t("termHold", { minutes: offer.holdMinutes })}</li>
          {tooMany ? (
            <li className="font-semibold text-destructive">
              {t("termMaxTickets", { count: offer.maxTickets })}
            </li>
          ) : null}
        </ul>
      ) : null}
    </fieldset>
  );
}
