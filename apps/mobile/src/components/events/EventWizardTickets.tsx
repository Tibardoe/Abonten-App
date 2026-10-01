import type { EventWizard } from "@/features/events/useEventWizard";
import { uuidv4 } from "@/lib/uuid";
import { AppText, Button, Chip, Field, Input } from "@abonten/ui-native";
import { useTranslations } from "@abonten/ui-native/i18n";
import { Pressable, View } from "react-native";

// Step 5 of the event wizard — free, a single paid tier, or multiple named
// tiers. Mirrors the web TicketType + TicketInputs.
export function EventWizardTickets({ w }: { w: EventWizard }) {
  const t = useTranslations("events");

  function addTier() {
    w.setTiers((prev) => [
      ...prev,
      { id: uuidv4(), name: "", price: "", quantity: "" },
    ]);
  }
  function patchTier(i: number, patch: Partial<(typeof w.tiers)[number]>) {
    w.setTiers((prev) =>
      prev.map((tier, idx) => (idx === i ? { ...tier, ...patch } : tier)),
    );
  }

  return (
    <View className="gap-4">
      <View className="flex-row gap-2">
        {(["free", "single", "multiple"] as const).map((m) => (
          <Chip
            key={m}
            label={
              m === "free"
                ? t("free")
                : m === "single"
                  ? t("onePrice")
                  : t("multipleTypes")
            }
            selected={w.ticketMode === m}
            onPress={() => w.setTicketMode(m)}
          />
        ))}
      </View>

      {w.ticketMode === "free" ? (
        <AppText variant="muted">
          {t("attendeesReserveAFreeTicketCapacity")}
        </AppText>
      ) : null}

      {w.ticketMode === "single" ? (
        <View className="flex-row gap-3">
          <View className="flex-1">
            <Field label={t("price", { currency: w.currency ?? "" })}>
              <Input
                value={w.ticketPrice}
                onChangeText={w.setTicketPrice}
                keyboardType="decimal-pad"
                placeholder="0.00"
              />
            </Field>
          </View>
          <View className="flex-1">
            <Field label={t("quantity")} hint={t("optional")}>
              <Input
                value={w.ticketQuantity}
                onChangeText={w.setTicketQuantity}
                keyboardType="number-pad"
                placeholder={t("unlimited")}
              />
            </Field>
          </View>
        </View>
      ) : null}

      {w.ticketMode === "multiple" ? (
        <View className="gap-3">
          {w.tiers.map((tier, i) => (
            <View
              key={tier.id}
              className="gap-2 rounded-xl border border-border bg-card p-3"
            >
              <View className="flex-row items-center justify-between">
                <AppText variant="small" className="font-semibold">
                  {t("ticketType")} {i + 1}
                </AppText>
                <Pressable
                  accessibilityRole="button"
                  onPress={() =>
                    w.setTiers((prev) => prev.filter((_, idx) => idx !== i))
                  }
                >
                  <AppText variant="small" tone="error">
                    {t("remove")}
                  </AppText>
                </Pressable>
              </View>
              <Input
                value={tier.name}
                onChangeText={(v) => patchTier(i, { name: v })}
                placeholder={t("eGVip")}
              />
              <View className="flex-row gap-3">
                <View className="flex-1">
                  <Input
                    value={tier.price}
                    onChangeText={(v) => patchTier(i, { price: v })}
                    keyboardType="decimal-pad"
                    placeholder={t("price", { currency: w.currency ?? "" })}
                  />
                </View>
                <View className="flex-1">
                  <Input
                    value={tier.quantity}
                    onChangeText={(v) => patchTier(i, { quantity: v })}
                    keyboardType="number-pad"
                    placeholder={t("qtyOptional")}
                  />
                </View>
              </View>
            </View>
          ))}
          <Button
            title={t("addTicketType")}
            variant="outline"
            size="sm"
            onPress={addTier}
          />
        </View>
      ) : null}

      {/* Capacity vs quantities, live (@abonten/core/ticketCapacity): the
          quantities that are set must fit the capacity from the Basics
          step; types without one share what is left. */}
      {w.capacityProblem ? (
        <AppText variant="small" tone="error" accessibilityLiveRegion="polite">
          {w.capacityProblem}
        </AppText>
      ) : w.capacityHint ? (
        <AppText variant="meta">{w.capacityHint}</AppText>
      ) : null}
    </View>
  );
}
