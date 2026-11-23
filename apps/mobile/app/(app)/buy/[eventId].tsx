import { useSession } from "@/auth/SessionProvider";
import { AppHeader } from "@/components/app/AppHeader";
import { QueryUnavailable } from "@/components/app/QueryUnavailable";
import {
  useCancelCheckout,
  usePromoPreview,
  useValidateCheckout,
} from "@/features/checkout/useCheckout";
import { useEventDetail } from "@/features/discovery/useEventDetail";
import { useMarket } from "@/features/markets/MarketProvider";
import {
  type PayMode,
  PaySmallSmallChoice,
} from "@/features/ticketPlans/PaySmallSmallChoice";
import {
  useStartTicketPlan,
  useTicketPlanOffer,
} from "@/features/ticketPlans/useTicketPlans";
import { setPendingRedirect } from "@/lib/authRedirect";
import { isNotFoundError } from "@/lib/queryErrors";
import { useNowTick } from "@/lib/useNowTick";
import { useQueryView } from "@/lib/useQueryView";
import { MAX_TICKETS_PER_TICKET_TYPE } from "@abonten/core/checkoutLimits";
import {
  computeCheckoutFee,
  priceOrder,
  purchasesLeft,
} from "@abonten/core/checkoutPricing";
import { formatDateWithSuffix } from "@abonten/core/dateFormatter";
import {
  isSessionOnSale,
  resolveOccurrenceState,
  salesCloseClock,
} from "@abonten/core/eventPurchaseEligibility";
import { formatMoney } from "@abonten/core/formatMoney";
import { getEventSoldOutStatus } from "@abonten/core/getEventSoldOutStatus";
import { formatPercent } from "@abonten/core/i18n/format";
import { tryFromMajor } from "@abonten/core/money/money";
import {
  hasFreeRegistration,
  ticketTypeLabel,
} from "@abonten/core/ticketTiers";
import {
  AppText,
  BottomBar,
  Button,
  Chip,
  Icon,
  Input,
  KeyboardAwareScrollView,
  ScreenError,
  Spinner,
  Stepper,
  useToast,
} from "@abonten/ui-native";
import {
  getCurrentLocale,
  useLocale,
  useTranslations,
} from "@abonten/ui-native/i18n";
import { useLocalSearchParams, usePathname, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, View } from "react-native";

const MAX_PER_TYPE = 10;

type AppliedPromo = {
  code: string;
  discountPercentage: number;
  remainingUses: number | null;
};

function isOnSale(
  tier: { available_from: string | null; available_until: string | null },
  now: number,
): boolean {
  if (tier.available_from && new Date(tier.available_from).getTime() > now)
    return false;
  if (tier.available_until && new Date(tier.available_until).getTime() < now)
    return false;
  return true;
}

function money(currency: string, n: number): string {
  return formatMoney(currency, n, { locale: getCurrentLocale() });
}

// The mobile "Buy tickets" screen: pick an occurrence + quantities, optionally
// apply a promo code (previewed live via api.checkout.promoPreview — the same
// getPromoCodeCore the web CheckoutPromoCodeBox uses), review the order, then
// Proceed. No money moves here — the code is claimed + the fee finalised by
// api.checkout.validate on /checkout/[sessionId].
export default function BuyTicketsScreen() {
  const { locale } = useLocale();

  const t = useTranslations("checkout");
  const tc = useTranslations("core");
  const tp = useTranslations("ticketPlans");
  const tCommon = useTranslations("common");
  const te = useTranslations("events");

  const toast = useToast();
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const router = useRouter();
  const pathname = usePathname();
  const { session } = useSession();
  const detailQuery = useEventDetail(eventId);
  const { markets } = useMarket();
  const { data, isError, error, refetch } = detailQuery;
  // Loading, offline and failed are told apart from "no such event".
  const detailView = useQueryView(detailQuery);
  const validate = useValidateCheckout();
  const cancel = useCancelCheckout();
  const promoPreview = usePromoPreview();
  const startPlan = useStartTicketPlan();
  const [payMode, setPayMode] = useState<PayMode>("full");

  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [occurrenceId, setOccurrenceId] = useState<string | null>(null);
  const [promoInput, setPromoInput] = useState("");
  const [promoError, setPromoError] = useState<string | null>(null);
  const [applied, setApplied] = useState<AppliedPromo | null>(null);

  const event = data?.event;
  // Recomputed every 30s / on foreground so a checkout left open across an
  // occurrence's start time can't proceed against a date that has since
  // begun (issue §4 / §5).
  const now = useNowTick();
  const occurrences = event?.event_occurrence ?? [];
  // A ticket may only be bought for a date still on sale: one still to
  // come, or one on now until its cut-off when the organizer keeps selling
  // while it's on. A finished date is never selectable, and the default
  // selection is the first one on sale.
  const salesCloseBeforeEndMinutes =
    event?.sales_close_before_end_minutes ?? null;
  const occurrenceState = resolveOccurrenceState(
    event?.starts_at,
    event?.ends_at,
    occurrences,
    { now, salesCloseBeforeEndMinutes },
  );
  const isOccurrenceSelectable = (o: {
    starts_at: string | Date;
    ends_at: string | Date;
  }) => isSessionOnSale(o, salesCloseBeforeEndMinutes, now);
  const firstFutureOccurrenceId = occurrenceState.nextPurchasable?.id ?? null;
  // If the tick advanced past the date the buyer had picked, drop back to
  // the next selectable one rather than carrying a now-started id.
  const activeOccurrenceId =
    occurrenceId &&
    occurrences.some((o) => o.id === occurrenceId && isOccurrenceSelectable(o))
      ? occurrenceId
      : firstFutureOccurrenceId;
  const currency = event?.currency ?? event?.ticket_type[0]?.currency ?? "";
  // Pay small small: offered only when the organizer allows it, the
  // programme is open to this buyer and the deadline is far enough away.
  const offerQuery = useTicketPlanOffer(eventId, activeOccurrenceId);
  const offerData =
    offerQuery.data?.status === 200 ? offerQuery.data.data : undefined;
  const planOffer = offerData?.available ? offerData : null;
  const paySmallSmall = payMode === "plan" && !!planOffer;

  // The whole order, priced by the server's own rule (@abonten/core/
  // checkoutPricing priceOrder): quantities are purchases (a Couple counts
  // once and is two tickets), the event's group price applies to the whole
  // order and a promo code never adds to it. A preview; the server prices
  // the order again at checkout.
  const groupTiers = useMemo(
    () =>
      (event?.event_group_discount ?? []).map((row) => ({
        minTickets: row.min_tickets,
        percentOff: row.percent_off,
      })),
    [event],
  );
  const order = useMemo(
    () =>
      priceOrder(
        (event?.ticket_type ?? [])
          .filter((tier) => (quantities[tier.id] ?? 0) > 0)
          .map((tier) => ({
            id: tier.id,
            purchases: quantities[tier.id] ?? 0,
            admits: tier.admits,
            unitPrice: tier.price,
            currency: tier.currency || currency,
          })),
        {
          promo:
            applied && applied.discountPercentage > 0
              ? {
                  percent: applied.discountPercentage,
                  remainingUses: applied.remainingUses,
                }
              : null,
          groupTiers,
        },
      ),
    [event, quantities, applied, groupTiers, currency],
  );

  // Tickets (people): a Couple purchase is two.
  const totalCount = order.tickets;
  const subtotal = useMemo(
    () => order.lines.reduce((sum, l) => sum + l.purchases * l.unitPrice, 0),
    [order],
  );
  const discount = useMemo(
    () => order.lines.reduce((sum, l) => sum + l.discount, 0),
    [order],
  );
  const eligibleUnits = useMemo(
    () => order.lines.reduce((sum, l) => sum + l.discountedUnits, 0),
    [order],
  );
  // The code is not used when the group price is at least as good.
  const groupBeatsPromo = !!applied && totalCount > 0 && !order.promoApplied;
  const nextGroupTier =
    [...groupTiers]
      .filter((tier) => tier.minTickets > totalCount)
      .sort((a, b) => a.minTickets - b.minTickets)[0] ?? null;

  const discountedSubtotal = Math.max(0, subtotal - discount);
  // The event market's own service fee (from the markets API), so a market
  // with its own rate is not previewed at the platform default. The charged
  // amount is computed on the server either way.
  const eventMarket = markets.find(
    (m) =>
      m.countryCode ===
      (event as { country_code?: string | null } | undefined)?.country_code,
  );
  const feePreview = computeCheckoutFee(
    discountedSubtotal,
    eventMarket?.serviceFeeRate ?? undefined,
    currency || null,
  );
  const totalPreview = discountedSubtotal + feePreview;
  const partialPromo =
    applied != null && eligibleUnits > 0 && eligibleUnits < totalCount;

  const header = (
    <AppHeader variant="title" title={t("buyTickets")} backFallback="/(app)" />
  );

  if (isError && isNotFoundError(error)) {
    return (
      <View className="flex-1 bg-background">
        {header}
        <ScreenError message={t("thisEventCouldNotBeFound")} />
      </View>
    );
  }
  if (!event) {
    return (
      <View className="flex-1 bg-background">
        {header}
        {detailView.kind === "content" || detailView.kind === "empty" ? (
          <ScreenError message={t("thisEventCouldNotBeFound")} />
        ) : (
          <QueryUnavailable
            view={detailView}
            subject={t("thisEvent")}
            onRetry={() => refetch()}
            loading={
              <View className="flex-1 items-center justify-center">
                <Spinner />
              </View>
            }
          />
        )}
      </View>
    );
  }

  const canceled = event.status === "canceled";
  // No strictly-future occurrence -> nothing can be sold. Covers a fully
  // ended event and a single-/multi-date event that is mid-occurrence with
  // no upcoming date (the server enforces the same rule).
  const salesClosed =
    occurrenceState.blockReason === "ended" ||
    occurrenceState.blockReason === "ongoing_no_future";
  const soldOut = getEventSoldOutStatus({
    capacity: event.capacity,
    attendeeCount: data.attendanceCount,
    ticketTypes: event.ticket_type,
  });

  if (canceled || salesClosed || soldOut || event.ticket_type.length === 0) {
    return (
      <View className="flex-1 bg-background">
        {header}
        <View className="flex-1 items-center justify-center gap-3 p-8">
          <Icon name="ticket-outline" size={28} tone="muted" />
          <AppText variant="muted" className="text-center">
            {canceled
              ? t("thisEventWasCanceled")
              : salesClosed
                ? occurrenceState.blockReason === "ended"
                  ? t("ticketSalesForThisEventHave")
                  : t("thisEventIsInProgressTicket")
                : soldOut
                  ? t("thisEventIsSoldOut")
                  : t("noTicketsAreAvailableForThis")}
          </AppText>
          <Button title={t("backToEvent")} onPress={() => router.back()} />
        </View>
      </View>
    );
  }

  // The date being bought is on now and still sells: say until when.
  const buyingOnNow =
    occurrenceState.onNow &&
    (occurrences.length === 0 ||
      activeOccurrenceId === (occurrenceState.nextPurchasable?.id ?? null));
  const onNowClock =
    buyingOnNow && occurrenceState.salesCloseAt
      ? salesCloseClock(
          occurrenceState.salesCloseAt,
          event.timezone,
          locale,
          now,
        )
      : null;

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
      setPromoInput("");
      return;
    }
    setPromoError(res.message ?? t("thatPromoCodeCouldnTBe"));
  }

  function removePromo() {
    setApplied(null);
    setPromoError(null);
    setPromoInput("");
  }

  async function startPlanFlow() {
    const res = await startPlan.mutateAsync({
      eventId,
      occurrenceId: activeOccurrenceId,
      quantities,
    });
    if (res.status === 200) {
      router.push(`/(app)/ticket-plans/${res.data.planId}`);
      return;
    }
    if (res.status === 409 && "planId" in res && res.planId) {
      toast.info(res.message ?? tp("youReAlreadyPayingForThisEvent"));
      router.push(`/(app)/ticket-plans/${res.planId}`);
      return;
    }
    toast.error(tp("couldNotStartPlan"), {
      description: "message" in res ? res.message : undefined,
    });
  }

  async function proceed() {
    if (totalCount === 0) return;
    if (!session) {
      if (pathname) setPendingRedirect(pathname);
      router.push("/(auth)/sign-in");
      return;
    }
    if (paySmallSmall) {
      await startPlanFlow();
      return;
    }

    const input = {
      eventId,
      quantities,
      occurrenceId: activeOccurrenceId,
      promoCode: applied?.code ?? null,
    };
    let res = await validate.mutateAsync(input);

    // 300 = the server already has a pending checkout for this event (it
    // allows only one in flight at a time). That session was priced from an
    // EARLIER selection, so resuming it would silently ignore a quantity /
    // ticket-type / promo change the buyer just made after coming back here.
    // Release the stale reservation and re-run checkout with what's on
    // screen now, so the current selection is what they pay for.
    if (res.status === 300 && res.checkoutId) {
      try {
        await cancel.mutateAsync(res.checkoutId);
        res = await validate.mutateAsync(input);
      } catch {
        // Couldn't release it — fall through and resume the existing one
        // rather than dead-ending the buyer.
      }
      if (res.status === 300 && res.checkoutId) {
        router.push(`/(app)/checkout/${res.checkoutId}`);
        return;
      }
    }

    // push (not replace) so the hardware / gesture back from the checkout
    // screen returns HERE with the ticket selection, occurrence and promo
    // still intact — changing your mind about quantity shouldn't mean
    // starting the whole order over.
    if (res.status === 200 && res.checkoutSessionId) {
      router.push(`/(app)/checkout/${res.checkoutSessionId}`);
      return;
    }
    // 409 = an availability problem the client's cached view didn't know
    // about (event ended/canceled while open, date passed, ticket just sold
    // out). Re-pull the event so the screen re-renders its ended/sold-out
    // gate instead of leaving a dead "Proceed" button.
    if (res.status === 409) {
      refetch();
      toast.error(t("canTStartCheckout"), {
        description: res.message ?? t("thisEventIsNoLongerAvailable"),
      });
      return;
    }
    if (applied) {
      // The code passed preview but failed the authoritative claim — surface
      // it against the promo row and drop it so Proceed can succeed without.
      setApplied(null);
      setPromoError(res.message ?? t("thatPromoCodeCouldnTBe"));
      return;
    }
    toast.error(t("canTStartCheckout"), {
      description: res.message ?? t("pleaseTryAgainInAMoment"),
    });
  }

  return (
    <View className="flex-1 bg-background">
      {header}
      <KeyboardAwareScrollView
        className="flex-1"
        contentContainerClassName="gap-6 p-4 pb-8"
        keyboardShouldPersistTaps="handled"
      >
        <View className="gap-1">
          <AppText variant="sectionHeading">{event.title}</AppText>
          {occurrences.length <= 1 && occurrences[0]?.starts_at ? (
            <AppText variant="meta">
              {formatDateWithSuffix(
                occurrences[0].starts_at,
                undefined,
                locale,
              )}
            </AppText>
          ) : null}
          {onNowClock ? (
            <AppText variant="small" tone="success">
              {onNowClock.day
                ? te("salesClose.onNowDay", {
                    day: onNowClock.day,
                    time: onNowClock.time,
                  })
                : te("salesClose.onNow", { time: onNowClock.time })}
            </AppText>
          ) : null}
        </View>

        {occurrences.length > 1 ? (
          <View className="gap-2">
            <AppText variant="overline">{t("date")}</AppText>
            <View className="flex-row flex-wrap gap-2">
              {occurrences.map((o) => {
                const selectable = isOccurrenceSelectable(o);
                const inProgress =
                  !selectable && new Date(o.ends_at).getTime() > now;
                return !selectable ? (
                  <View
                    key={o.id}
                    className="opacity-40"
                    accessibilityLabel={
                      inProgress
                        ? t("dateInProgress", {
                            date: formatDateWithSuffix(
                              o.starts_at,
                              undefined,
                              locale,
                            ),
                          })
                        : t("dateHasPassed", {
                            date: formatDateWithSuffix(
                              o.starts_at,
                              undefined,
                              locale,
                            ),
                          })
                    }
                    accessibilityState={{ disabled: true }}
                  >
                    <Chip
                      label={
                        inProgress
                          ? t("dateChipInProgress", {
                              date: formatDateWithSuffix(
                                o.starts_at,
                                undefined,
                                locale,
                              ),
                            })
                          : t("dateChipPast", {
                              date: formatDateWithSuffix(
                                o.starts_at,
                                undefined,
                                locale,
                              ),
                            })
                      }
                    />
                  </View>
                ) : (
                  <Chip
                    key={o.id}
                    label={formatDateWithSuffix(o.starts_at, undefined, locale)}
                    selected={o.id === activeOccurrenceId}
                    onPress={() => setOccurrenceId(o.id)}
                  />
                );
              })}
            </View>
            {firstFutureOccurrenceId == null ? (
              <AppText variant="caption" tone="error">
                {t("allDatesForThisEventHave")}
              </AppText>
            ) : null}
          </View>
        ) : null}

        {/* Ticket types + quantity */}
        <View className="gap-2">
          <AppText variant="overline">{t("tickets")}</AppText>
          {event.ticket_type.map((tier) => {
            const onSale = isOnSale(tier, now);
            // Stock is places (people); a Couple purchase takes two.
            const admits = Math.max(1, tier.admits ?? 1);
            const left = purchasesLeft(tier.quantity, admits);
            const stockOut = left != null && left <= 0;
            // The server allows 50 tickets of a type per order.
            const cap = Math.min(
              MAX_PER_TYPE,
              Math.floor(MAX_TICKETS_PER_TICKET_TYPE / admits),
              left ?? MAX_PER_TYPE,
            );
            const qty = quantities[tier.id] ?? 0;
            const disabled = !onSale || stockOut;
            return (
              <View
                key={tier.id}
                className="flex-row items-center justify-between gap-3 rounded-xl border border-border bg-card p-3.5"
              >
                <View className="flex-1">
                  <AppText variant="body" className="font-medium">
                    {ticketTypeLabel(tc, tier.type)}
                  </AppText>
                  <AppText variant="meta">
                    {tier.price === 0
                      ? t("free")
                      : money(tier.currency, tier.price)}
                    {stockOut
                      ? t("soldOut")
                      : !onSale
                        ? t("notOnSale")
                        : left != null
                          ? t("left", { quantity: left })
                          : ""}
                  </AppText>
                  {admits > 1 ? (
                    <AppText variant="caption" tone="muted">
                      {tCommon("admitsPeopleEachOwnTicket", { count: admits })}
                    </AppText>
                  ) : null}
                  {tier.pass_shows ? (
                    <AppText variant="caption" tone="muted">
                      {tCommon("passForShows", { shows: tier.pass_shows })}
                    </AppText>
                  ) : null}
                </View>
                {disabled ? (
                  <AppText variant="caption" tone="muted">
                    {t("unavailable")}
                  </AppText>
                ) : (
                  <Stepper
                    value={qty}
                    min={0}
                    max={cap}
                    onChange={(n) => setQty(tier.id, n, cap)}
                  />
                )}
              </View>
            );
          })}
        </View>

        {/* Group price: what the order gets, or how close the next is. */}
        {order.groupDiscountPercent > 0 ? (
          <AppText variant="body" tone="brand" className="font-medium">
            {tCommon("groupPriceApplied", {
              percent: formatPercent(order.groupDiscountPercent, locale, {
                maximumFractionDigits: 0,
              }),
            })}
          </AppText>
        ) : null}
        {nextGroupTier && !paySmallSmall ? (
          <AppText variant="meta">
            {tCommon("groupPriceNextTier", {
              count: nextGroupTier.minTickets - totalCount,
              percent: formatPercent(nextGroupTier.percentOff, locale, {
                maximumFractionDigits: 0,
              }),
            })}
          </AppText>
        ) : null}
        {groupBeatsPromo ? (
          <AppText variant="caption" tone="muted">
            {tCommon("groupPriceBeatsPromo")}
          </AppText>
        ) : null}

        {planOffer ? (
          <PaySmallSmallChoice
            offer={planOffer}
            mode={payMode}
            onModeChange={(mode) => {
              setPayMode(mode);
              // A plan's price is the ticket price: no promo codes (v1).
              if (mode === "plan") removePromo();
            }}
            totalMinor={tryFromMajor(totalPreview, currency)?.amountMinor ?? 0}
            ticketCount={totalCount}
          />
        ) : null}

        {/* Promo code: an open field, not a "Have a promo code?" link, which
            pilot testers looked past (2026-10-30). A free event has none. */}
        <View
          className={
            paySmallSmall || hasFreeRegistration(event.ticket_type)
              ? "hidden"
              : "gap-2"
          }
        >
          {applied ? (
            <View className="gap-1.5 rounded-xl border border-primary/40 bg-primary/5 p-3.5">
              <View className="flex-row items-center justify-between">
                <View className="flex-row items-center gap-2">
                  <Icon name="pricetag" size={15} tone="primary" />
                  <AppText variant="body" className="font-semibold">
                    {applied.code}
                  </AppText>
                  <AppText variant="meta" tone="brand">
                    {t("off", {
                      discountPercentage: applied.discountPercentage,
                    })}
                  </AppText>
                </View>
                <Pressable
                  accessibilityRole="button"
                  onPress={removePromo}
                  hitSlop={8}
                >
                  <AppText
                    variant="small"
                    tone="brand"
                    className="font-semibold"
                  >
                    {t("remove")}
                  </AppText>
                </Pressable>
              </View>
              {partialPromo ? (
                <AppText variant="caption">
                  {t("appliesToOfTickets", {
                    eligibleUnits: eligibleUnits,
                    totalCount: totalCount,
                  })}
                </AppText>
              ) : null}
            </View>
          ) : (
            <View className="gap-2">
              <AppText variant="overline">{t("promoCode")}</AppText>
              <View className="flex-row gap-2">
                <Input
                  value={promoInput}
                  onChangeText={(v) => {
                    setPromoInput(v);
                    if (promoError) setPromoError(null);
                  }}
                  placeholder={t("enterCode")}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  className="flex-1"
                  onSubmitEditing={applyPromo}
                  returnKeyType="done"
                />
                <Button
                  title={t("apply")}
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
          )}
          {applied && promoError ? (
            <AppText variant="caption" tone="error">
              {promoError}
            </AppText>
          ) : null}
        </View>

        {/* Order summary */}
        <View className="gap-2 rounded-xl border border-border bg-card p-4">
          <AppText variant="overline">{t("orderSummary2")}</AppText>
          <SummaryLine
            label={t("subtotalTicket", { totalCount })}
            value={money(currency, subtotal)}
          />
          {discount > 0 ? (
            <SummaryLine
              label={t("discount")}
              value={`− ${money(currency, discount)}`}
              tone="brand"
            />
          ) : null}
          <SummaryLine
            label={t("serviceFeeEst")}
            value={money(currency, feePreview)}
          />
          <View className="my-1 h-px bg-border" />
          <SummaryLine
            label={t("estimatedTotal")}
            value={money(currency, totalPreview)}
            strong
          />
          <AppText variant="caption">{t("theFinalTotalIsConfirmedOn")}</AppText>
        </View>
      </KeyboardAwareScrollView>

      <BottomBar className="border-t border-border bg-background px-4 pt-4">
        <Button
          title={
            validate.isPending || cancel.isPending || startPlan.isPending
              ? t("startingCheckout")
              : paySmallSmall
                ? tp("startPayingSmallSmall")
                : t("proceedToCheckout")
          }
          fullWidth
          loading={
            validate.isPending || cancel.isPending || startPlan.isPending
          }
          disabled={
            validate.isPending ||
            cancel.isPending ||
            startPlan.isPending ||
            totalCount === 0 ||
            (occurrences.length > 1 && activeOccurrenceId == null) ||
            (paySmallSmall && totalCount > (planOffer?.maxTickets ?? 0))
          }
          onPress={proceed}
        />
      </BottomBar>
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
