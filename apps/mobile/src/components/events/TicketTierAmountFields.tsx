import {
  type TicketTier,
  tierAmountProblem,
} from "@/features/events/useEventWizard";
import { AppText, Chip, Field, Input } from "@abonten/ui-native";
import { useTranslations } from "@abonten/ui-native/i18n";
import { View } from "react-native";

/**
 * How a ticket type is priced, in the event wizard and Edit event: a fixed
 * price, or "Buyer chooses the amount" with the lowest amount, the highest
 * amount and the step (docs/architecture/open-amount-tickets.md). Offered
 * when the organizer's switch is on, or the type is already open. The price
 * field itself stays with the screen and is hidden for an open type.
 */
export function TicketTierAmountFields({
  tier,
  enabled,
  currency,
  onPatch,
}: {
  tier: TicketTier;
  /** tickets.open_amount is on for the organizer. */
  enabled: boolean;
  currency: string | null;
  onPatch: (patch: Partial<TicketTier>) => void;
}) {
  const tCommon = useTranslations("common");
  const tc = useTranslations("core");
  const open = tier.amountMode === "open";
  if (!enabled && !open) return null;

  // Say what is wrong once all three are typed, not while typing.
  const complete =
    !!tier.minAmount?.trim() &&
    !!tier.maxAmount?.trim() &&
    !!tier.amountStep?.trim();
  const problem =
    open && complete ? tierAmountProblem(tc, tier, currency) : null;
  const fields = [
    { key: "minAmount", label: tCommon("openAmountMinLabel") },
    { key: "maxAmount", label: tCommon("openAmountMaxLabel") },
    { key: "amountStep", label: tCommon("openAmountStepLabel") },
  ] as const;

  return (
    <View className="gap-2">
      <AppText variant="small" tone="muted">
        {tCommon("priceModeLabel")}
      </AppText>
      <View className="flex-row flex-wrap gap-2">
        <Chip
          label={tCommon("priceModeFixed")}
          selected={!open}
          onPress={() => onPatch({ amountMode: "fixed" })}
        />
        <Chip
          label={tCommon("priceModeOpen")}
          selected={open}
          onPress={() =>
            onPatch({
              amountMode: "open",
              // A sensible first step; the organizer can change it.
              amountStep: tier.amountStep?.trim() ? tier.amountStep : "1",
            })
          }
        />
      </View>
      {open ? (
        <View className="gap-2">
          <View className="flex-row gap-2">
            {fields.map((field) => (
              <View key={field.key} className="flex-1">
                <Field label={field.label} hint={currency ?? undefined}>
                  <Input
                    value={tier[field.key] ?? ""}
                    onChangeText={(v) => onPatch({ [field.key]: v })}
                    keyboardType="decimal-pad"
                    accessibilityLabel={field.label}
                  />
                </Field>
              </View>
            ))}
          </View>
          {problem ? (
            <AppText
              variant="small"
              tone="error"
              accessibilityLiveRegion="polite"
            >
              {problem}
            </AppText>
          ) : (
            <AppText variant="meta">{tCommon("openAmountEditorHint")}</AppText>
          )}
        </View>
      ) : null}
    </View>
  );
}
