import type { EventDetail } from "@/features/discovery/useEventDetail";
import { formatDateWithSuffix } from "@abonten/core/dateFormatter";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
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

export function TicketPicker({ event }: { event: EventDetail }) {
  const router = useRouter();
  const validate = useValidateCheckout();
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
    // A promo was entered and validate rejected — most likely the code.
    // Keep the sheet open and surface it inline rather than aborting.
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
    <View className="gap-4">
      {occurrences.length > 1 ? (
        <View className="gap-2">
          <Text className="text-sm font-semibold text-foreground">Date</Text>
          <View className="flex-row flex-wrap gap-2">
            {occurrences.map((o) => {
              const selected = o.id === occurrenceId;
              return (
                <Pressable
                  key={o.id}
                  onPress={() => setOccurrenceId(o.id)}
                  className={`rounded-full border px-3 py-1.5 ${
                    selected
                      ? "border-primary bg-primary"
                      : "border-border bg-card"
                  }`}
                >
                  <Text
                    className={`text-xs ${
                      selected ? "text-primary-foreground" : "text-foreground"
                    }`}
                  >
                    {formatDateWithSuffix(o.starts_at)}
                  </Text>
                </Pressable>
              );
            })}
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
              className="flex-row items-center justify-between rounded-xl border border-border bg-card p-3"
            >
              <View className="flex-1">
                <Text className="text-sm font-medium text-foreground">
                  {t.type}
                </Text>
                <Text className="text-xs text-muted-foreground">
                  {t.price === 0 ? "Free" : `${t.currency} ${t.price}`}
                  {soldOut
                    ? " · Sold out"
                    : !onSale
                      ? " · Not on sale"
                      : t.quantity != null
                        ? ` · ${t.quantity} left`
                        : ""}
                </Text>
              </View>

              <View className="flex-row items-center gap-3">
                <Pressable
                  disabled={disabled || qty === 0}
                  onPress={() => step(t.id, -1, cap)}
                  className={`h-8 w-8 items-center justify-center rounded-full border ${
                    disabled || qty === 0
                      ? "border-border opacity-40"
                      : "border-primary"
                  }`}
                >
                  <Text className="text-base text-foreground">−</Text>
                </Pressable>
                <Text className="w-5 text-center text-sm text-foreground">
                  {qty}
                </Text>
                <Pressable
                  disabled={disabled || qty >= cap}
                  onPress={() => step(t.id, 1, cap)}
                  className={`h-8 w-8 items-center justify-center rounded-full border ${
                    disabled || qty >= cap
                      ? "border-border opacity-40"
                      : "border-primary"
                  }`}
                >
                  <Text className="text-base text-foreground">+</Text>
                </Pressable>
              </View>
            </View>
          );
        })}
      </View>

      <View className="gap-1.5">
        <Text className="text-sm font-semibold text-foreground">
          Promo code
        </Text>
        <TextInput
          value={promoCode}
          onChangeText={(v) => {
            setPromoCode(v);
            if (promoError) setPromoError(null);
          }}
          placeholder="Enter code (optional)"
          autoCapitalize="characters"
          autoCorrect={false}
          className="rounded-lg border border-border bg-background px-3 py-2 text-foreground"
          placeholderTextColor="#999"
        />
        {promoError ? (
          <Text className="text-[11px] text-destructive">{promoError}</Text>
        ) : (
          <Text className="text-[11px] text-muted-foreground">
            Applied when you continue to checkout.
          </Text>
        )}
      </View>

      <View className="flex-row items-center justify-between">
        <Text className="text-sm text-muted-foreground">
          {totalCount} ticket{totalCount === 1 ? "" : "s"}
        </Text>
        <Text className="text-sm font-semibold text-foreground">
          {currency} {subtotal}
        </Text>
      </View>
      <Text className="text-[11px] text-muted-foreground">
        A service fee is added at checkout.
      </Text>

      <Pressable
        disabled={totalCount === 0 || validate.isPending}
        onPress={onGetTickets}
        className={`items-center rounded-xl px-4 py-3 ${
          totalCount === 0 || validate.isPending ? "bg-muted" : "bg-primary"
        }`}
      >
        {validate.isPending ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text
            className={`text-sm font-semibold ${
              totalCount === 0
                ? "text-muted-foreground"
                : "text-primary-foreground"
            }`}
          >
            Get tickets
          </Text>
        )}
      </Pressable>
    </View>
  );
}
