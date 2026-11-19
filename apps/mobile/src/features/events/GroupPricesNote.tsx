import { sortGroupDiscountTiers } from "@abonten/core/groupPricing";
import { formatPercent } from "@abonten/core/i18n/format";
import { AppText, Icon } from "@abonten/ui-native";
import { useLocale, useTranslations } from "@abonten/ui-native/i18n";
import { View } from "react-native";

/**
 * The event's automatic group prices ("10+ tickets: 10% off"), on the event
 * screen so a church group or a company sees them before choosing tickets.
 * The checkout applies them by itself
 * (docs/architecture/group-tickets-and-prices.md).
 */
export function GroupPricesNote({
  tiers,
}: {
  tiers: { min_tickets: number; percent_off: number }[] | null | undefined;
}) {
  const { locale } = useLocale();
  const t = useTranslations("events");
  const sorted = sortGroupDiscountTiers(
    (tiers ?? []).map((row) => ({
      minTickets: row.min_tickets,
      percentOff: row.percent_off,
    })),
  );
  if (sorted.length === 0) return null;

  return (
    <View className="flex-row items-start gap-3 rounded-xl border border-border bg-card p-3">
      <Icon name="people-outline" size={20} tone="primary" />
      <View className="flex-1 gap-0.5">
        <AppText variant="small" className="font-semibold">
          {t("groupPricesTitle")}
        </AppText>
        {sorted.map((tier) => (
          <AppText key={tier.minTickets} variant="small" tone="muted">
            {t("groupPriceTier", {
              count: tier.minTickets,
              percent: formatPercent(tier.percentOff, locale, {
                maximumFractionDigits: 0,
              }),
            })}
          </AppText>
        ))}
        <AppText variant="caption" tone="muted">
          {t("groupPricesAppliedAtCheckout")}
        </AppText>
      </View>
    </View>
  );
}
