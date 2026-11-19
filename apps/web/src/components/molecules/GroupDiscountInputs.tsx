import type { GroupDiscountTier } from "@abonten/core/checkoutPricing";
import {
  MAX_GROUP_DISCOUNT_TIERS,
  MAX_GROUP_PERCENT,
  MAX_GROUP_TICKETS,
  MIN_GROUP_TICKETS,
  groupDiscountTiersProblem,
  groupPricingProblemMessage,
  sortGroupDiscountTiers,
} from "@abonten/core/groupPricing";
import { formatPercent } from "@abonten/core/i18n/format";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { LiaTimesSolid } from "react-icons/lia";
import { Button } from "../ui/button";
import { Input } from "../ui/input";

type GroupDiscountInputsProps = {
  tiers: GroupDiscountTier[];
  onChange: (tiers: GroupDiscountTier[]) => void;
  disabled?: boolean;
};

const readInt = (e: React.ChangeEvent<HTMLInputElement>): number | null => {
  const value = e.target.valueAsNumber;
  return Number.isFinite(value) ? Math.floor(value) : null;
};

/**
 * An event's automatic group prices ("10 or more tickets: 10% off"), up to
 * three. Checked with the same rule the server applies
 * (@abonten/core/groupPricing); docs/architecture/group-tickets-and-prices.md.
 */
export default function GroupDiscountInputs({
  tiers,
  onChange,
  disabled = false,
}: GroupDiscountInputsProps) {
  const locale = useLocale();
  const t = useTranslations("common");
  const tc = useTranslations("core");

  const [minTickets, setMinTickets] = useState<number | null>(null);
  const [percentOff, setPercentOff] = useState<number | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const sorted = sortGroupDiscountTiers(tiers);
  const full = sorted.length >= MAX_GROUP_DISCOUNT_TIERS;

  const add = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    if (minTickets === null || percentOff === null) return;
    const next = sortGroupDiscountTiers([
      ...sorted,
      { minTickets, percentOff },
    ]);
    const found = groupDiscountTiersProblem(next);
    if (found) {
      setProblem(groupPricingProblemMessage(tc, found));
      return;
    }
    onChange(next);
    setMinTickets(null);
    setPercentOff(null);
    setProblem(null);
  };

  const remove = (min: number) => {
    onChange(sorted.filter((tier) => tier.minTickets !== min));
    setProblem(null);
  };

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">{t("groupPricesHint")}</p>

      {sorted.length > 0 && (
        <ul className="space-y-2">
          {sorted.map((tier) => (
            <li
              key={tier.minTickets}
              className="flex items-center justify-between rounded-md border border-border bg-card p-3 text-sm"
            >
              <span>
                {t("groupPriceLine", {
                  count: tier.minTickets,
                  percent: formatPercent(tier.percentOff, locale, {
                    maximumFractionDigits: 0,
                  }),
                })}
              </span>
              <button
                type="button"
                onClick={() => remove(tier.minTickets)}
                disabled={disabled}
                aria-label={t("removeGroupPrice")}
              >
                <LiaTimesSolid className="text-xl" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {!full && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-1">
            <label
              htmlFor="group-min-tickets"
              className="text-sm text-muted-foreground"
            >
              {t("groupPriceFromTickets")}
            </label>
            <Input
              id="group-min-tickets"
              type="number"
              min={MIN_GROUP_TICKETS}
              max={MAX_GROUP_TICKETS}
              value={minTickets ?? ""}
              onChange={(e) => {
                setMinTickets(readInt(e));
                setProblem(null);
              }}
              disabled={disabled}
            />
          </div>
          <div className="flex-1 space-y-1">
            <label
              htmlFor="group-percent-off"
              className="text-sm text-muted-foreground"
            >
              {t("groupPricePercentOff")}
            </label>
            <Input
              id="group-percent-off"
              type="number"
              min={1}
              max={MAX_GROUP_PERCENT}
              value={percentOff ?? ""}
              onChange={(e) => {
                setPercentOff(readInt(e));
                setProblem(null);
              }}
              disabled={disabled}
            />
          </div>
          <Button
            onClick={add}
            disabled={disabled || minTickets === null || percentOff === null}
          >
            {t("add")}
          </Button>
        </div>
      )}

      {problem && (
        <p role="alert" className="text-sm text-destructive">
          {problem}
        </p>
      )}
    </div>
  );
}
