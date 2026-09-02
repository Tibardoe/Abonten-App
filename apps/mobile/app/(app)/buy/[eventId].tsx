import { useSession } from "@/auth/SessionProvider";
import { AppHeader } from "@/components/app/AppHeader";
import { useValidateCheckout } from "@/features/checkout/useCheckout";
import { useEventDetail } from "@/features/discovery/useEventDetail";
import { setPendingRedirect } from "@/lib/authRedirect";
import { formatDateWithSuffix } from "@abonten/core/dateFormatter";
import { getEventSoldOutStatus } from "@abonten/core/getEventSoldOutStatus";
import {
  AppText,
  Button,
  Chip,
  Icon,
  ScreenError,
  Spinner,
  Stepper,
} from "@abonten/ui-native";
import { useThemeColors } from "@abonten/ui-native/theme";
import { useLocalSearchParams, usePathname, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Alert, ScrollView, TextInput, View } from "react-native";

const MAX_PER_TYPE = 10;

function isOnSale(
  t: { available_from: string | null; available_until: string | null },
  now: number,
): boolean {
  if (t.available_from && new Date(t.available_from).getTime() > now)
    return false;
  if (t.available_until && new Date(t.available_until).getTime() < now)
    return false;
  return true;
}

// The mobile "Buy tickets" screen — one scroll, like the web checkout modal:
// pick an occurrence + quantities, add a promo code, see the running
// subtotal, then Proceed. The promo code is validated + claimed server-side
// by api.checkout.validate on Proceed; a bad code surfaces its message here.
// No money moves on this screen — that happens on /checkout/[sessionId].
export default function BuyTicketsScreen() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const router = useRouter();
  const pathname = usePathname();
  const c = useThemeColors();
  const { session } = useSession();
  const { data, isLoading, isError, refetch } = useEventDetail(eventId);
  const validate = useValidateCheckout();

  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [occurrenceId, setOccurrenceId] = useState<string | null>(null);
  const [promo, setPromo] = useState("");
  const [promoError, setPromoError] = useState<string | null>(null);

  const event = data?.event;
  const now = Date.now();
  const occurrences = event?.event_occurrence ?? [];
  const activeOccurrenceId = occurrenceId ?? occurrences[0]?.id ?? null;

  const currency = event?.ticket_type[0]?.currency ?? "GHS";
  const subtotal = useMemo(() => {
    if (!event) return 0;
    return event.ticket_type.reduce(
      (sum, t) => sum + (quantities[t.id] ?? 0) * t.price,
      0,
    );
  }, [event, quantities]);
  const totalCount = useMemo(
    () => Object.values(quantities).reduce((a, b) => a + b, 0),
    [quantities],
  );

  const header = (
    <AppHeader variant="title" title="Buy tickets" backFallback="/(app)" />
  );

  if (isLoading) {
    return (
      <View className="flex-1 bg-background">
        {header}
        <View className="flex-1 items-center justify-center">
          <Spinner />
        </View>
      </View>
    );
  }
  if (isError || !event) {
    return (
      <View className="flex-1 bg-background">
        {header}
        <ScreenError
          message="This event could not be loaded."
          onRetry={() => refetch()}
        />
      </View>
    );
  }

  const canceled = event.status === "canceled";
  const soldOut = getEventSoldOutStatus({
    capacity: event.capacity,
    attendeeCount: data.attendanceCount,
    ticketTypes: event.ticket_type,
  });

  if (canceled || soldOut || event.ticket_type.length === 0) {
    return (
      <View className="flex-1 bg-background">
        {header}
        <View className="flex-1 items-center justify-center gap-3 p-8">
          <Icon name="ticket-outline" size={28} tone="muted" />
          <AppText variant="muted" className="text-center">
            {canceled
              ? "This event was canceled."
              : soldOut
                ? "This event is sold out."
                : "No tickets are available for this event."}
          </AppText>
          <Button title="Back to event" onPress={() => router.back()} />
        </View>
      </View>
    );
  }

  function setQty(id: string, next: number, cap: number) {
    setQuantities((prev) => ({
      ...prev,
      [id]: Math.max(0, Math.min(cap, next)),
    }));
  }

  async function proceed() {
    if (totalCount === 0) return;
    if (!session) {
      if (pathname) setPendingRedirect(pathname);
      router.push("/(auth)/sign-in");
      return;
    }
    setPromoError(null);
    const trimmed = promo.trim();
    const res = await validate.mutateAsync({
      eventId,
      quantities,
      occurrenceId: activeOccurrenceId,
      promoCode: trimmed || null,
    });

    if (res.status === 200 && res.checkoutSessionId) {
      router.replace(`/(app)/checkout/${res.checkoutSessionId}`);
      return;
    }
    if (res.status === 300 && res.checkoutId) {
      router.replace(`/(app)/checkout/${res.checkoutId}`);
      return;
    }
    if (trimmed) {
      setPromoError(res.message ?? "That promo code couldn't be applied.");
      return;
    }
    Alert.alert(
      "Can't start checkout",
      res.message ?? "Please try again in a moment.",
    );
  }

  return (
    <View className="flex-1 bg-background">
      {header}
      <ScrollView
        className="flex-1"
        contentContainerClassName="gap-5 p-4 pb-8"
        keyboardShouldPersistTaps="handled"
      >
        <AppText variant="sectionHeading">{event.title}</AppText>

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
                  selected={o.id === activeOccurrenceId}
                  onPress={() => setOccurrenceId(o.id)}
                />
              ))}
            </View>
          </View>
        ) : null}

        {/* Ticket types + quantity */}
        <View className="gap-2">
          <AppText variant="small" className="font-semibold">
            Tickets
          </AppText>
          {event.ticket_type.map((t) => {
            const onSale = isOnSale(t, now);
            const stockOut = t.quantity != null && t.quantity <= 0;
            const cap = Math.min(MAX_PER_TYPE, t.quantity ?? MAX_PER_TYPE);
            const qty = quantities[t.id] ?? 0;
            const disabled = !onSale || stockOut;
            return (
              <View
                key={t.id}
                className="flex-row items-center justify-between gap-3 rounded-xl border border-border bg-card p-3"
              >
                <View className="flex-1">
                  <AppText variant="body" className="font-medium">
                    {t.type}
                  </AppText>
                  <AppText variant="meta">
                    {t.price === 0 ? "Free" : `${t.currency} ${t.price}`}
                    {stockOut
                      ? " · Sold out"
                      : !onSale
                        ? " · Not on sale"
                        : t.quantity != null
                          ? ` · ${t.quantity} left`
                          : ""}
                  </AppText>
                </View>
                {disabled ? (
                  <AppText variant="caption" tone="muted">
                    Unavailable
                  </AppText>
                ) : (
                  <Stepper
                    value={qty}
                    min={0}
                    max={cap}
                    onChange={(n) => setQty(t.id, n, cap)}
                  />
                )}
              </View>
            );
          })}
        </View>

        {/* Promo code */}
        <View className="gap-2">
          <AppText variant="small" className="font-semibold">
            Promo code
          </AppText>
          <TextInput
            value={promo}
            onChangeText={(v) => {
              setPromo(v);
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
              Checked when you continue. Any discount shows on the next screen.
            </AppText>
          )}
        </View>

        {/* Summary */}
        <View className="gap-2 rounded-xl border border-border bg-card p-4">
          <View className="flex-row items-center justify-between">
            <AppText variant="muted">
              {totalCount} ticket{totalCount === 1 ? "" : "s"}
            </AppText>
            <AppText variant="cardTitle">
              {currency} {subtotal}
            </AppText>
          </View>
          <AppText variant="caption">
            An Abonten service fee is added at checkout, where you'll confirm
            the final total before paying.
          </AppText>
        </View>
      </ScrollView>

      <View className="border-t border-border p-4">
        <Button
          title={
            validate.isPending ? "Starting checkout…" : "Proceed to checkout"
          }
          fullWidth
          loading={validate.isPending}
          disabled={validate.isPending || totalCount === 0}
          onPress={proceed}
        />
      </View>
    </View>
  );
}
