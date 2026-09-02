import { DateRangeField } from "@/components/explore/DateRangeField";
import type { EventWizard } from "@/features/events/useEventWizard";
import { prettyDate } from "@/lib/datetime";
import { uuidv4 } from "@/lib/uuid";
import { AppText, Button, Input } from "@abonten/ui-native";
import { useState } from "react";
import { Pressable, View } from "react-native";

// Step 6 of the event wizard — optional promo codes, applied at checkout.
// Mirrors the web PromoCodeInputs (code / discount % / max uses / expiry).
export function EventWizardPromos({ w }: { w: EventWizard }) {
  const [code, setCode] = useState("");
  const [discount, setDiscount] = useState("");
  const [maxUses, setMaxUses] = useState("");
  const [expiry, setExpiry] = useState<string | null>(null);

  const canAdd =
    code.trim().length > 0 &&
    Number(discount) > 0 &&
    Number(discount) <= 100 &&
    Number(maxUses) > 0 &&
    !!expiry;

  function add() {
    if (!canAdd || !expiry) return;
    w.setPromos((prev) => [
      ...prev,
      {
        id: uuidv4(),
        promoCode: code.trim().toUpperCase(),
        discount,
        maximumUse: maxUses,
        expiryIso: expiry,
      },
    ]);
    setCode("");
    setDiscount("");
    setMaxUses("");
    setExpiry(null);
  }

  return (
    <View className="gap-4">
      <AppText variant="muted">
        Promo codes are optional. Add one or more discounts buyers can apply at
        checkout, or skip this step.
      </AppText>

      {w.promos.map((p, i) => (
        <View
          key={p.id}
          className="flex-row items-center justify-between rounded-xl border border-border bg-card p-3"
        >
          <View>
            <AppText variant="small" className="font-semibold">
              {p.promoCode}
            </AppText>
            <AppText variant="meta">
              {p.discount}% off · {p.maximumUse} uses · until{" "}
              {prettyDate(p.expiryIso)}
            </AppText>
          </View>
          <Pressable
            onPress={() =>
              w.setPromos((prev) => prev.filter((_, idx) => idx !== i))
            }
          >
            <AppText variant="small" tone="error">
              Remove
            </AppText>
          </Pressable>
        </View>
      ))}

      <View className="gap-3 rounded-xl border border-border border-dashed p-3">
        <AppText variant="label">Add a promo code</AppText>
        <Input
          value={code}
          onChangeText={setCode}
          autoCapitalize="characters"
          autoCorrect={false}
          placeholder="e.g. EARLYBIRD"
        />
        <View className="flex-row gap-3">
          <View className="flex-1">
            <Input
              value={discount}
              onChangeText={setDiscount}
              keyboardType="number-pad"
              placeholder="Discount %"
            />
          </View>
          <View className="flex-1">
            <Input
              value={maxUses}
              onChangeText={setMaxUses}
              keyboardType="number-pad"
              placeholder="Max uses"
            />
          </View>
        </View>
        <AppText variant="caption">Expiry date</AppText>
        <DateRangeField
          start={expiry}
          end={null}
          onChange={(r) => setExpiry(r.start)}
        />
        <Button
          title="Add promo code"
          variant="outline"
          size="sm"
          disabled={!canAdd}
          onPress={add}
        />
      </View>
    </View>
  );
}
