import type { EventDetail } from "@/features/discovery/useEventDetail";
import { formatDateWithSuffix } from "@abonten/core/dateFormatter";
import { AppText, Button, Chip, Icon } from "@abonten/ui-native";
import { useThemeColors } from "@abonten/ui-native/theme";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Alert, Pressable, TextInput, View } from "react-native";
import { useValidateCheckout } from "./useCheckout";

const MAX_PER_TYPE = 10;

function isOnSale(t: EventDetail["ticket_type"][number], now: number): boolean {
  if (t.available_from && new Date(t.available_from).getTime() > now) {
    return false;
  }
  if (t.available_until && new Date(t.available_until).getTime() < now) {
    return false;
  }
  return true;
}

function StepButton({
  icon,
  disabled,
  onPress,
  label,
}: {
  icon: "remove" | "add";
  disabled: boolean;
  onPress: () => void;
  label: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      hitSlop={6}
      className={`h-9 w-9 items-center justify-center rounded-full border ${
        disabled ? "border-border opacity-40" : "border-primary"
      }`}
    >
      <Icon name={icon} size={18} tone={disabled ? "muted" : "primary"} />
    </Pressable>
  );
}

// The mobile checkout entry: pick an occurrence, choose ticket quantities
// (capped per type by MAX_PER_TYPE and remaining stock), optionally add a
// promo code, then start a checkout session. The actual charge happens on
// the checkout screen — this screen never moves money, which keeps it
// resistant to accidental purchases. Business rules unchanged from the
// previous version.
export function TicketPicker({ event }: { event: EventDetail }) {
  const router = useRouter();
  const validate = useValidateCheckout();
  const c = useThemeColors();
  const now = Date.now();

  const occurrences = event.event_occurrence ?? [];
  const [occurrenceId, setOccurrenceId] = useState<string | null>(
    occurrences[0]?.id ?? null,
  );
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [promoCode, setPromoCode] = useState("");
  const [promoError, setPromoError] = useState<string | null>(null);

  const currency = event.ticket_type[0]?.currency ?? "GHS";
  const subtotal = useMemo(
    () =>
      event.ticket_type.reduce(
        (sum, t) => sum + (quantities[t.id] ?? 0) * t.price,
        0,
      ),
    [event.ticket_type, quantities],
  );
  const totalCount = useMemo(
    () => Object.values(quantities).reduce((a, b) => a + b, 0),
    [quantities],
  );

  function step(ticketTypeId: string, delta: number, cap: number) {
    setQuantities((prev) => {
      const next = Math.max(
        0,
        Math.min(cap, (prev[ticketTypeId] ?? 0) + delta),
      );
      return { ...prev, [ticketTypeId]: next };
    });
  }

  async function onGetTickets() {
    if (totalCount === 0) return;
    setPromoError(null);
    const trimmedPromo = promoCode.trim();
    const res = await validate.mutateAsync({
      eventId: event.id,
      quantities,
      occurrenceId,
      promoCode: trimmedPromo || null,
    });

    if (res.status === 200 && res.checkoutSessionId) {
      router.push(`/(app)/checkout/${res.checkoutSessionId}`);
      return;
    }
    if (
      res.status === 300 &&
      res.reason === "pending_checkout" &&
      res.checkoutId
    ) {
      router.push(`/(app)/checkout/${res.checkoutId}`);
      return;
    }
    if (trimmedPromo) {
      setPromoError(res.message ?? "That promo code couldn't be applied.");
      return;
    }
    Alert.alert(
      "Can't start checkout",
      res.message ?? "Please try again in a moment.",
    );
  }

  return (
    <View className="gap-4 rounded-xl border border-border bg-card p-4">
      {occurrences.length > 1 ? (
        <View className="gap-2">
          <AppText variant="small" className="font-semibold">
            Date
          </AppText>
          <View className="flex-row flex-wrap gap-2">
            {occurrences.map((o) => (
              <Chip
                key={o.id}
                label={formatDateWithSuffix(o.starts_at)}
                selected={o.id === occurrenceId}
                onPress={() => setOccurrenceId(o.id)}
              />
            ))}
          </View>
        </View>
      ) : null}

      <View className="gap-2">
        {event.ticket_type.map((t) => {
          const onSale = isOnSale(t, now);
          const soldOut = t.quantity != null && t.quantity <= 0;
          const cap = Math.min(MAX_PER_TYPE, t.quantity ?? MAX_PER_TYPE);
          const qty = quantities[t.id] ?? 0;
          const disabled = !onSale || soldOut;

          return (
            <View
              key={t.id}
              className="flex-row items-center justify-between gap-3 rounded-xl border border-border bg-background p-3"
            >
              <View className="flex-1">
                <AppText variant="body" className="font-medium">
                  {t.type}
                </AppText>
                <AppText variant="meta">
                  {t.price === 0 ? "Free" : `${t.currency} ${t.price}`}
                  {soldOut
                    ? " · Sold out"
                    : !onSale
                      ? " · Not on sale"
                      : t.quantity != null
                        ? ` · ${t.quantity} left`
                        : ""}
                </AppText>
              </View>

              <View className="flex-row items-center gap-3">
                <StepButton
                  icon="remove"
                  label={`Remove one ${t.type} ticket`}
                  disabled={disabled || qty === 0}
                  onPress={() => step(t.id, -1, cap)}
                />
                <AppText
                  variant="body"
                  className="w-5 text-center font-semibold"
                >
                  {qty}
                </AppText>
                <StepButton
                  icon="add"
                  label={`Add one ${t.type} ticket`}
                  disabled={disabled || qty >= cap}
                  onPress={() => step(t.id, 1, cap)}
                />
              </View>
            </View>
          );
        })}
      </View>

      <View className="gap-1.5">
        <AppText variant="small" className="font-semibold">
          Promo code
        </AppText>
        <TextInput
          value={promoCode}
          onChangeText={(v) => {
            setPromoCode(v);
            if (promoError) setPromoError(null);
          }}
          placeholder="Enter code (optional)"
          autoCapitalize="characters"
          autoCorrect={false}
          className="rounded-lg border border-input bg-background px-3 py-2.5 text-[14px] text-foreground"
          placeholderTextColor={c["muted-foreground"]}
        />
        {promoError ? (
          <AppText variant="caption" tone="error">
            {promoError}
          </AppText>
        ) : (
          <AppText variant="caption">
            Applied when you continue to checkout.
          </AppText>
        )}
      </View>

      <View className="gap-1 border-t border-border pt-3">
        <View className="flex-row items-center justify-between">
          <AppText variant="muted">
            {totalCount} ticket{totalCount === 1 ? "" : "s"}
          </AppText>
          <AppText variant="cardTitle">
            {currency} {subtotal}
          </AppText>
        </View>
        <AppText variant="caption">
          An Abonten service fee is added at checkout.
        </AppText>
      </View>

      <Button
        title="Get tickets"
        fullWidth
        loading={validate.isPending}
        disabled={totalCount === 0 || validate.isPending}
        onPress={onGetTickets}
      />
    </View>
  );
}
