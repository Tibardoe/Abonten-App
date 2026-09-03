import { useSession } from "@/auth/SessionProvider";
import { AppHeader } from "@/components/app/AppHeader";
import {
  usePromoPreview,
  useValidateCheckout,
} from "@/features/checkout/useCheckout";
import { useEventDetail } from "@/features/discovery/useEventDetail";
import { setPendingRedirect } from "@/lib/authRedirect";
import {
  allocatePromoEligibility,
  computeCheckoutFee,
  computeLineAmount,
} from "@abonten/core/checkoutPricing";
import { formatDateWithSuffix } from "@abonten/core/dateFormatter";
import { getEventStatus } from "@abonten/core/eventStatus";
import { getEventSoldOutStatus } from "@abonten/core/getEventSoldOutStatus";
import {
  AppText,
  Button,
  Chip,
  Icon,
  Input,
  ScreenError,
  Spinner,
  Stepper,
} from "@abonten/ui-native";
import { useLocalSearchParams, usePathname, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, View } from "react-native";

const MAX_PER_TYPE = 10;

type AppliedPromo = {
  code: string;
  discountPercentage: number;
  remainingUses: number | null;
};

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

function money(currency: string, n: number): string {
  return `${currency} ${n.toFixed(2)}`;
}

// The mobile "Buy tickets" screen: pick an occurrence + quantities, optionally
// apply a promo code (previewed live via api.checkout.promoPreview — the same
// getPromoCodeCore the web CheckoutPromoCodeBox uses), review the order, then
// Proceed. No money moves here — the code is claimed + the fee finalised by
// api.checkout.validate on /checkout/[sessionId].
export default function BuyTicketsScreen() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const router = useRouter();
  const pathname = usePathname();
  const { session } = useSession();
  const { data, isLoading, isError, refetch } = useEventDetail(eventId);
  const validate = useValidateCheckout();
  const promoPreview = usePromoPreview();

  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [occurrenceId, setOccurrenceId] = useState<string | null>(null);
  const [promoOpen, setPromoOpen] = useState(false);
  const [promoInput, setPromoInput] = useState("");
  const [promoError, setPromoError] = useState<string | null>(null);
  const [applied, setApplied] = useState<AppliedPromo | null>(null);

  const event = data?.event;
  const now = Date.now();
  const occurrences = event?.event_occurrence ?? [];
  // A multi-date event where some dates have already passed: only the future
  // ones are selectable, and the default selection is the first future one
  // (never a past date the buyer would otherwise checkout against).
  const isOccurrencePast = (o: { ends_at: string | null }) =>
    !!o.ends_at && new Date(o.ends_at).getTime() < now;
  const firstFutureOccurrenceId =
    occurrences.find((o) => !isOccurrencePast(o))?.id ?? null;
  const activeOccurrenceId = occurrenceId ?? firstFutureOccurrenceId;
  const currency = event?.ticket_type[0]?.currency ?? "GHS";

  const lines = useMemo(
    () =>
      (event?.ticket_type ?? [])
        .map((t) => ({
          id: t.id,
          quantity: quantities[t.id] ?? 0,
          price: t.price,
        }))
        .filter((l) => l.quantity > 0),
    [event, quantities],
  );

  const totalCount = useMemo(
    () => lines.reduce((a, l) => a + l.quantity, 0),
    [lines],
  );
  const subtotal = useMemo(
    () => lines.reduce((sum, l) => sum + l.quantity * l.price, 0),
    [lines],
  );

  // Live discount preview — mirrors the web CheckoutModal: allocate the code's
  // remaining uses across the selected lines, discount only the eligible units.
  const { discount, eligibleUnits } = useMemo(() => {
    if (!applied || applied.discountPercentage <= 0)
      return { discount: 0, eligibleUnits: 0 };
    const eligibleByLine = allocatePromoEligibility(
      lines,
      applied.remainingUses,
    );
    let d = 0;
    let units = 0;
    for (const l of lines) {
      const elig = eligibleByLine[l.id] ?? 0;
      units += elig;
      d += computeLineAmount(
        l.quantity,
        l.price,
        applied.discountPercentage,
        elig,
      ).discount;
    }
    return { discount: d, eligibleUnits: units };
  }, [applied, lines]);

  const discountedSubtotal = Math.max(0, subtotal - discount);
  const feePreview = computeCheckoutFee(discountedSubtotal);
  const totalPreview = discountedSubtotal + feePreview;
  const partialPromo =
    applied != null && eligibleUnits > 0 && eligibleUnits < totalCount;

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
  const ended =
    getEventStatus(event.starts_at, event.ends_at, event.event_occurrence) ===
    "ended";
  const soldOut = getEventSoldOutStatus({
    capacity: event.capacity,
    attendeeCount: data.attendanceCount,
    ticketTypes: event.ticket_type,
  });

  if (canceled || ended || soldOut || event.ticket_type.length === 0) {
    return (
      <View className="flex-1 bg-background">
        {header}
        <View className="flex-1 items-center justify-center gap-3 p-8">
          <Icon name="ticket-outline" size={28} tone="muted" />
          <AppText variant="muted" className="text-center">
            {canceled
              ? "This event was canceled."
              : ended
                ? "Ticket sales for this event have closed — it has ended."
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

  async function applyPromo() {
    const code = promoInput.trim().toUpperCase();
    if (!code) return;
    setPromoError(null);
    const res = await promoPreview.mutateAsync({ eventId, code });
    if (res.status === 200) {
      setApplied({
        code,
        discountPercentage: res.discountPercentage,
        remainingUses: res.remainingUses,
      });
      setPromoOpen(false);
      setPromoInput("");
      return;
    }
    setPromoError(res.message ?? "That promo code couldn't be applied.");
  }

  function removePromo() {
    setApplied(null);
    setPromoError(null);
    setPromoInput("");
  }

  async function proceed() {
    if (totalCount === 0) return;
    if (!session) {
      if (pathname) setPendingRedirect(pathname);
      router.push("/(auth)/sign-in");
      return;
    }
    const res = await validate.mutateAsync({
      eventId,
      quantities,
      occurrenceId: activeOccurrenceId,
      promoCode: applied?.code ?? null,
    });

    if (res.status === 200 && res.checkoutSessionId) {
      router.replace(`/(app)/checkout/${res.checkoutSessionId}`);
      return;
    }
    if (res.status === 300 && res.checkoutId) {
      router.replace(`/(app)/checkout/${res.checkoutId}`);
      return;
    }
    // 409 = an availability problem the client's cached view didn't know
    // about (event ended/canceled while open, date passed, ticket just sold
    // out). Re-pull the event so the screen re-renders its ended/sold-out
    // gate instead of leaving a dead "Proceed" button.
    if (res.status === 409) {
      refetch();
      Alert.alert(
        "Can't start checkout",
        res.message ?? "This event is no longer available.",
      );
      return;
    }
    if (applied) {
      // The code passed preview but failed the authoritative claim — surface
      // it against the promo row and drop it so Proceed can succeed without.
      setApplied(null);
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
        contentContainerClassName="gap-6 p-4 pb-8"
        keyboardShouldPersistTaps="handled"
      >
        <View className="gap-1">
          <AppText variant="sectionHeading">{event.title}</AppText>
          {occurrences.length <= 1 && occurrences[0]?.starts_at ? (
            <AppText variant="meta">
              {formatDateWithSuffix(occurrences[0].starts_at)}
            </AppText>
          ) : null}
        </View>

        {occurrences.length > 1 ? (
          <View className="gap-2">
            <AppText variant="overline">Date</AppText>
            <View className="flex-row flex-wrap gap-2">
              {occurrences.map((o) => {
                const past = isOccurrencePast(o);
                return past ? (
                  <View
                    key={o.id}
                    className="opacity-40"
                    accessibilityLabel={`${formatDateWithSuffix(o.starts_at)} — this date has passed`}
                    accessibilityState={{ disabled: true }}
                  >
                    <Chip
                      label={`${formatDateWithSuffix(o.starts_at)} · past`}
                    />
                  </View>
                ) : (
                  <Chip
                    key={o.id}
                    label={formatDateWithSuffix(o.starts_at)}
                    selected={o.id === activeOccurrenceId}
                    onPress={() => setOccurrenceId(o.id)}
                  />
                );
              })}
            </View>
            {firstFutureOccurrenceId == null ? (
              <AppText variant="caption" tone="error">
                All dates for this event have passed.
              </AppText>
            ) : null}
          </View>
        ) : null}

        {/* Ticket types + quantity */}
        <View className="gap-2">
          <AppText variant="overline">Tickets</AppText>
          {event.ticket_type.map((t) => {
            const onSale = isOnSale(t, now);
            const stockOut = t.quantity != null && t.quantity <= 0;
            const cap = Math.min(MAX_PER_TYPE, t.quantity ?? MAX_PER_TYPE);
            const qty = quantities[t.id] ?? 0;
            const disabled = !onSale || stockOut;
            return (
              <View
                key={t.id}
                className="flex-row items-center justify-between gap-3 rounded-xl border border-border bg-card p-3.5"
              >
                <View className="flex-1">
                  <AppText variant="body" className="font-medium">
                    {t.type}
                  </AppText>
                  <AppText variant="meta">
                    {t.price === 0 ? "Free" : money(t.currency, t.price)}
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
          {applied ? (
            <View className="gap-1.5 rounded-xl border border-primary/40 bg-primary/5 p-3.5">
              <View className="flex-row items-center justify-between">
                <View className="flex-row items-center gap-2">
                  <Icon name="pricetag" size={15} tone="primary" />
                  <AppText variant="body" className="font-semibold">
                    {applied.code}
                  </AppText>
                  <AppText variant="meta" tone="brand">
                    {applied.discountPercentage}% off
                  </AppText>
                </View>
                <Pressable onPress={removePromo} hitSlop={8}>
                  <AppText
                    variant="small"
                    tone="brand"
                    className="font-semibold"
                  >
                    Remove
                  </AppText>
                </Pressable>
              </View>
              {partialPromo ? (
                <AppText variant="caption">
                  Applies to {eligibleUnits} of {totalCount} tickets.
                </AppText>
              ) : null}
            </View>
          ) : promoOpen ? (
            <View className="gap-2">
              <AppText variant="overline">Promo code</AppText>
              <View className="flex-row gap-2">
                <Input
                  value={promoInput}
                  onChangeText={(v) => {
                    setPromoInput(v);
                    if (promoError) setPromoError(null);
                  }}
                  placeholder="Enter code"
                  autoCapitalize="characters"
                  autoCorrect={false}
                  className="flex-1"
                  onSubmitEditing={applyPromo}
                  returnKeyType="done"
                />
                <Button
                  title="Apply"
                  onPress={applyPromo}
                  loading={promoPreview.isPending}
                  disabled={promoPreview.isPending || !promoInput.trim()}
                />
              </View>
              {promoError ? (
                <AppText variant="caption" tone="error">
                  {promoError}
                </AppText>
              ) : null}
            </View>
          ) : (
            <Pressable
              onPress={() => setPromoOpen(true)}
              className="flex-row items-center gap-2 py-1 active:opacity-60"
            >
              <Icon name="pricetag-outline" size={15} tone="primary" />
              <AppText variant="small" tone="brand" className="font-semibold">
                Have a promo code?
              </AppText>
            </Pressable>
          )}
          {applied && promoError ? (
            <AppText variant="caption" tone="error">
              {promoError}
            </AppText>
          ) : null}
        </View>

        {/* Order summary */}
        <View className="gap-2 rounded-xl border border-border bg-card p-4">
          <AppText variant="overline">Order summary</AppText>
          <SummaryLine
            label={`Subtotal · ${totalCount} ticket${totalCount === 1 ? "" : "s"}`}
            value={money(currency, subtotal)}
          />
          {discount > 0 ? (
            <SummaryLine
              label="Discount"
              value={`− ${money(currency, discount)}`}
              tone="brand"
            />
          ) : null}
          <SummaryLine
            label="Service fee (est.)"
            value={money(currency, feePreview)}
          />
          <View className="my-1 h-px bg-border" />
          <SummaryLine
            label="Estimated total"
            value={money(currency, totalPreview)}
            strong
          />
          <AppText variant="caption">
            The final total is confirmed on the next screen before you pay.
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
          disabled={
            validate.isPending ||
            totalCount === 0 ||
            (occurrences.length > 1 && activeOccurrenceId == null)
          }
          onPress={proceed}
        />
      </View>
    </View>
  );
}

function SummaryLine({
  label,
  value,
  strong,
  tone,
}: {
  label: string;
  value: string;
  strong?: boolean;
  tone?: "brand";
}) {
  return (
    <View className="flex-row items-center justify-between">
      <AppText
        variant={strong ? "body" : "small"}
        tone={tone}
        className={strong ? "font-semibold" : undefined}
      >
        {label}
      </AppText>
      <AppText
        variant={strong ? "body" : "small"}
        tone={tone}
        className={strong ? "font-semibold" : "font-medium"}
      >
        {value}
      </AppText>
    </View>
  );
}
