import type { EventWizard } from "@/features/events/useEventWizard";
import { uuidv4 } from "@/lib/uuid";
import { AppText, Button, Field, Input } from "@abonten/ui-native";
import { Pressable, View } from "react-native";

// Step 5 of the event wizard — free, a single paid tier, or multiple named
// tiers. Mirrors the web TicketType + TicketInputs.
export function EventWizardTickets({ w }: { w: EventWizard }) {
  function addTier() {
    w.setTiers((prev) => [
      ...prev,
      { id: uuidv4(), name: "", price: "", quantity: "" },
    ]);
  }
  function patchTier(i: number, patch: Partial<(typeof w.tiers)[number]>) {
    w.setTiers((prev) =>
      prev.map((t, idx) => (idx === i ? { ...t, ...patch } : t)),
    );
  }

  return (
    <View className="gap-4">
      <View className="flex-row gap-2">
        {(["free", "single", "multiple"] as const).map((m) => {
          const label =
            m === "free"
              ? "Free"
              : m === "single"
                ? "One price"
                : "Multiple types";
          const active = w.ticketMode === m;
          return (
            <Pressable
              key={m}
              onPress={() => w.setTicketMode(m)}
              className={
                active
                  ? "rounded-full bg-primary px-4 py-1.5"
                  : "rounded-full border border-border px-4 py-1.5"
              }
            >
              <AppText
                className={
                  active
                    ? "text-[13px] font-semibold text-primary-foreground"
                    : "text-[13px] font-medium text-muted-foreground"
                }
              >
                {label}
              </AppText>
            </Pressable>
          );
        })}
      </View>

      {w.ticketMode === "free" ? (
        <AppText variant="muted">
          Attendees reserve a free ticket. Capacity (Basics step) caps the
          total.
        </AppText>
      ) : null}

      {w.ticketMode === "single" ? (
        <View className="flex-row gap-3">
          <View className="flex-1">
            <Field label={`Price (${w.currency})`}>
              <Input
                value={w.ticketPrice}
                onChangeText={w.setTicketPrice}
                keyboardType="decimal-pad"
                placeholder="0.00"
              />
            </Field>
          </View>
          <View className="flex-1">
            <Field label="Quantity" hint="Optional">
              <Input
                value={w.ticketQuantity}
                onChangeText={w.setTicketQuantity}
                keyboardType="number-pad"
                placeholder="Unlimited"
              />
            </Field>
          </View>
        </View>
      ) : null}

      {w.ticketMode === "multiple" ? (
        <View className="gap-3">
          {w.tiers.map((t, i) => (
            <View
              key={t.id}
              className="gap-2 rounded-xl border border-border bg-card p-3"
            >
              <View className="flex-row items-center justify-between">
                <AppText variant="small" className="font-semibold">
                  Ticket type {i + 1}
                </AppText>
                <Pressable
                  onPress={() =>
                    w.setTiers((prev) => prev.filter((_, idx) => idx !== i))
                  }
                >
                  <AppText variant="small" tone="error">
                    Remove
                  </AppText>
                </Pressable>
              </View>
              <Input
                value={t.name}
                onChangeText={(v) => patchTier(i, { name: v })}
                placeholder="e.g. VIP"
              />
              <View className="flex-row gap-3">
                <View className="flex-1">
                  <Input
                    value={t.price}
                    onChangeText={(v) => patchTier(i, { price: v })}
                    keyboardType="decimal-pad"
                    placeholder={`Price (${w.currency})`}
                  />
                </View>
                <View className="flex-1">
                  <Input
                    value={t.quantity}
                    onChangeText={(v) => patchTier(i, { quantity: v })}
                    keyboardType="number-pad"
                    placeholder="Qty (optional)"
                  />
                </View>
              </View>
            </View>
          ))}
          <Button
            title="Add ticket type"
            variant="outline"
            size="sm"
            onPress={addTier}
          />
        </View>
      ) : null}
    </View>
  );
}
