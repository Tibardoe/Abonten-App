import { sortGroupDiscountTiers } from "@abonten/core/groupPricing";
import { formatPercent } from "@abonten/core/i18n/format";
import { getLocale, getTranslations } from "next-intl/server";
import { MdGroups } from "react-icons/md";

/**
 * The event's automatic group prices ("10+ tickets: 10% off"), on the event
 * page so a church group or a company sees them before choosing tickets.
 * The checkout applies them by itself; nothing to type.
 */
export default async function GroupPricesNote({
  tiers,
}: {
  tiers: { min_tickets: number; percent_off: number }[] | null | undefined;
}) {
  const sorted = sortGroupDiscountTiers(
    (tiers ?? []).map((row) => ({
      minTickets: row.min_tickets,
      percentOff: row.percent_off,
    })),
  );
  if (sorted.length === 0) return null;
  const t = await getTranslations("events");
  const locale = await getLocale();

  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3 text-sm">
      <p className="flex items-center gap-2 font-semibold">
        <MdGroups className="text-lg text-primary" aria-hidden />
        {t("groupPricesTitle")}
      </p>
      <ul className="mt-1 space-y-0.5 text-muted-foreground">
        {sorted.map((tier) => (
          <li key={tier.minTickets}>
            {t("groupPriceTier", {
              count: tier.minTickets,
              percent: formatPercent(tier.percentOff, locale, {
                maximumFractionDigits: 0,
              }),
            })}
          </li>
        ))}
      </ul>
      <p className="mt-1 text-xs text-muted-foreground">
        {t("groupPricesAppliedAtCheckout")}
      </p>
    </div>
  );
}
