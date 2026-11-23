"use client";

import { Select } from "@/components/ui/select";
import {
  SALES_CLOSE_CHOICES,
  type SalesClose,
  salesCloseChoice,
  salesCloseLabel,
} from "@abonten/core/eventPurchaseEligibility";
import { useTranslations } from "next-intl";
import { useId } from "react";

// When online ticket sales close for each date of an event
// (@abonten/core/eventPurchaseEligibility), on the create and the edit
// form: at the start (the default), or while it's on until some minutes
// before it ends. It only changes sales still to come, so it stays
// editable after the first sale.

export function useSalesCloseText() {
  const t = useTranslations("events");
  return (setting: SalesClose) => {
    const label = salesCloseLabel(setting);
    switch (label.kind) {
      case "at_start":
        return t("salesClose.atStart");
      case "until_end":
        return t("salesClose.untilEnd");
      case "minutes_before_end":
        return t("salesClose.minutesBeforeEnd", { minutes: label.minutes });
      case "hours_before_end":
        return t("salesClose.hoursBeforeEnd", { hours: label.hours });
    }
  };
}

export default function SalesCloseSelect({
  value,
  onChange,
}: {
  /** The choice, as salesCloseChoice writes it ("before_end:60"). */
  value: string;
  onChange: (choice: string) => void;
}) {
  const t = useTranslations("events");
  const text = useSalesCloseText();
  const id = useId();
  const helpId = `${id}-help`;

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {t("salesClose.label")}
      </label>
      <Select
        id={id}
        value={value}
        aria-describedby={helpId}
        onChange={(event) => onChange(event.target.value)}
      >
        {SALES_CLOSE_CHOICES.map((setting) => {
          const choice = salesCloseChoice(setting);
          return (
            <option key={choice} value={choice}>
              {text(setting)}
            </option>
          );
        })}
      </Select>
      <p id={helpId} className="text-xs text-muted-foreground">
        {t("salesClose.help")}
      </p>
    </div>
  );
}
