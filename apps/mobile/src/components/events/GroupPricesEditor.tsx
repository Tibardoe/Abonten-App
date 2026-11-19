import type { GroupPriceDraft } from "@/features/events/useEventWizard";
import { uuidv4 } from "@/lib/uuid";
import { MAX_GROUP_DISCOUNT_TIERS } from "@abonten/core/groupPricing";
import { AppText, Button, Field, Input } from "@abonten/ui-native";
import { useTranslations } from "@abonten/ui-native/i18n";
import { Pressable, View } from "react-native";

/**
 * An event's automatic group prices ("10 or more tickets: 10% off"), up to
 * three. Used by the event wizard and the edit screen; the rule
 * (@abonten/core/groupPricing) is checked by the caller and by the server
 * (docs/architecture/group-tickets-and-prices.md).
 */
export function GroupPricesEditor({
  value,
  onChange,
  problem,
}: {
  value: GroupPriceDraft[];
  onChange: (next: GroupPriceDraft[]) => void;
  /** Why the tiers can't be saved, already worded; null when they can. */
  problem: string | null;
}) {
  const t = useTranslations("events");
  const tCommon = useTranslations("common");

  function patch(i: number, next: Partial<GroupPriceDraft>) {
    onChange(value.map((g, idx) => (idx === i ? { ...g, ...next } : g)));
  }

  return (
    <View className="gap-3">
      <View className="gap-1">
        <AppText variant="small" className="font-semibold">
          {t("groupPricesTitle")}
        </AppText>
        <AppText variant="meta">{tCommon("groupPricesHint")}</AppText>
      </View>

      {value.map((g, i) => (
        <View
          key={g.id}
          className="flex-row items-end gap-3 rounded-xl border border-border bg-card p-3"
        >
          <View className="flex-1">
            <Field label={tCommon("groupPriceFromTickets")}>
              <Input
                value={g.minTickets}
                onChangeText={(v) => patch(i, { minTickets: v })}
                keyboardType="number-pad"
                placeholder="10"
              />
            </Field>
          </View>
          <View className="flex-1">
            <Field label={tCommon("groupPricePercentOff")}>
              <Input
                value={g.percentOff}
                onChangeText={(v) => patch(i, { percentOff: v })}
                keyboardType="number-pad"
                placeholder="10"
              />
            </Field>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={tCommon("removeGroupPrice")}
            onPress={() => onChange(value.filter((_, idx) => idx !== i))}
            className="pb-3"
          >
            <AppText variant="small" tone="error">
              {t("remove")}
            </AppText>
          </Pressable>
        </View>
      ))}

      {value.length < MAX_GROUP_DISCOUNT_TIERS ? (
        <Button
          title={tCommon("addGroupPrice")}
          variant="outline"
          size="sm"
          onPress={() =>
            onChange([
              ...value,
              { id: uuidv4(), minTickets: "", percentOff: "" },
            ])
          }
        />
      ) : null}

      {problem ? (
        <AppText variant="small" tone="error" accessibilityLiveRegion="polite">
          {problem}
        </AppText>
      ) : null}
    </View>
  );
}
