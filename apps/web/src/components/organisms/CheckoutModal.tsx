import getPromoCode from "@/actions/getPromoCode";
import { getTickets } from "@/actions/getTickets";
import { getTicketPlanOffer } from "@/actions/ticketPlans/getTicketPlanOffer";
import { startTicketPlan } from "@/actions/ticketPlans/startTicketPlan";
import validateCheckout from "@/actions/validateCheckout";
import ModalShell from "@/components/atoms/ModalShell";
import CheckoutOrderTotals from "@/components/molecules/CheckoutOrderTotals";
import CheckoutPromoCodeBox from "@/components/molecules/CheckoutPromoCodeBox";
import CheckoutTicketRow from "@/components/molecules/CheckoutTicketRow";
import { useServiceFeeRate } from "@/hooks/useServiceFeeRate";
import { useToast } from "@/hooks/useToast";
import PaySmallSmallChoice, {
  type PayMode,
} from "@/ticketPlans/molecules/PaySmallSmallChoice";
import { actionUnreachable } from "@/utils/actionUnreachable";
import {
  computeCheckoutFee,
  priceOrder,
  purchasesLeft,
} from "@abonten/core/checkoutPricing";
import { formatPercent } from "@abonten/core/i18n/format";
import { tryFromMajor } from "@abonten/core/money/money";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { MdOutlineCancel } from "react-icons/md";

type CheckoutProp = {
  handleCheckoutModal: (state: boolean) => void;
  eventId: string;
  occurrenceId: string | null;
  btnText: string;
  eventTitle: string;
  date: string;
  time: string;
};

type AppliedPromo = {
  code: string;
  discountPercentage: number;
  remainingUses: number | null;
};

export default function CheckoutModal({
  handleCheckoutModal,
  eventId,
  occurrenceId,
  // btnText,
  eventTitle,
  time,
  date,
}: CheckoutProp) {
  const t = useTranslations("common");
  const tp = useTranslations("ticketPlans");
  const locale = useLocale();

  const [promoCodeInput, setPromoCodeInput] = useState("");

  // Pay small small: offered only when the organizer allows it, the
  // programme is open to this buyer and the deadline is far enough away.
  const [payMode, setPayMode] = useState<PayMode>("full");
  const { data: offerResponse } = useQuery({
    queryKey: ["ticket-plan-offer", eventId, occurrenceId],
    queryFn: () => getTicketPlanOffer({ eventId, occurrenceId }),
    staleTime: 60_000,
    retry: 0,
  });
  const offer =
    offerResponse?.status === 200 && "data" in offerResponse
      ? offerResponse.data
      : undefined;
  const planOffer = offer?.available ? offer : null;
  const paySmallSmall = payMode === "plan" && !!planOffer;

  const [appliedPromo, setAppliedPromo] = useState<AppliedPromo | null>(null);

  const [isProceeding, setIsProceeding] = useState(false);

  const [quantities, setQuantities] = useState<{
    [ticketTypeId: string]: number;
  }>({});

  const toast = useToast();

  const router = useRouter();

  const {
    data: ticketsResponse,
    isLoading: isTicketsLoading,
    isError: isTicketsQueryError,
    refetch: refetchTickets,
  } = useQuery({
    queryKey: ["eventTickets", eventId],
    enabled: !!eventId,
    queryFn: () => getTickets(eventId),
    staleTime: 30_000,
    // Keep quantities fresh while the checkout modal is open so a sellout or
    // stock change from another buyer surfaces without the user doing anything.
    refetchInterval: 20_000,
    retry: 1,
  });

  // getTickets returns { status, message } on failure instead of throwing —
  // a thrown error here gets redacted to a generic "Minified React error"
  // digest in production (Next.js strips messages from errors thrown out of
  // a Server Action the same way it does for Server Component render
  // errors), which left users with no useful message and only "Retry".
  const ticketData =
    ticketsResponse?.status === 200 ? ticketsResponse : undefined;
  const isTicketsError =
    isTicketsQueryError ||
    (!!ticketsResponse && ticketsResponse.status !== 200);
  const ticketsResponseMessage =
    ticketsResponse && ticketsResponse.status !== 200
      ? ticketsResponse.message
      : null;

  const ticketList = useMemo(() => ticketData?.tickets ?? [], [ticketData]);
  const groupTiers = useMemo(
    () => ticketData?.groupDiscounts ?? [],
    [ticketData],
  );
  // Stock is places (people); a Couple ticket takes two.
  const purchasesLeftOf = (ticket: (typeof ticketList)[number]) =>
    purchasesLeft(ticket.quantity, ticket.admits);

  // If a live refetch drops a ticket type's availability below what the user
  // already selected, clamp the selection down instead of letting them try to
  // check out with more than is actually available.
  useEffect(() => {
    if (ticketList.length === 0) return;

    setQuantities((prev) => {
      let changed = false;
      const next = { ...prev };

      for (const ticket of ticketList) {
        const selected = next[ticket.id] || 0;
        const left = purchasesLeft(ticket.quantity, ticket.admits);
        if (left !== null && selected > left) {
          next[ticket.id] = Math.max(left, 0);
          changed = true;
        }
      }

      return changed ? next : prev;
    });
  }, [ticketList]);

  const promoMutation = useMutation({
    mutationFn: (code: string) => getPromoCode(code, eventId),
    onSuccess: (response) => {
      if (response.status !== 200) {
        toast.error(response.message ?? t("thatPromoCodeCouldnTBe"));
        setAppliedPromo(null);
        return;
      }

      setAppliedPromo({
        code: promoCodeInput,
        discountPercentage: response.discountPercentage,
        remainingUses: response.remainingUses ?? null,
      });
    },
    onError: () => {
      toast.error(t("weCouldnTApplyThatPromo"));
      setAppliedPromo(null);
    },
  });

  const removePromoCode = () => {
    setAppliedPromo(null);
    setPromoCodeInput("");
    promoMutation.reset();
  };

  // The whole order, priced by the same rule the server applies at
  // "Continue to payment" (@abonten/core/checkoutPricing priceOrder): group
  // tickets, the event's group price and the promo code, never added
  // together. A live preview only; the server recomputes and stores it.
  const order = useMemo(
    () =>
      priceOrder(
        ticketList
          .filter((ticket) => (quantities[ticket.id] || 0) > 0)
          .map((ticket) => ({
            id: ticket.id,
            purchases: quantities[ticket.id] || 0,
            admits: ticket.admits,
            unitPrice: ticket.price ?? 0,
            currency: ticket.currency,
          })),
        {
          promo: appliedPromo
            ? {
                percent: appliedPromo.discountPercentage,
                remainingUses: appliedPromo.remainingUses,
              }
            : null,
          groupTiers,
        },
      ),
    [ticketList, quantities, appliedPromo, groupTiers],
  );

  const promoEligibility = useMemo(() => {
    if (!appliedPromo) return null;
    const eligibleTotal = order.lines.reduce(
      (sum, line) => sum + line.discountedUnits,
      0,
    );
    return {
      totalQuantity: order.tickets,
      eligibleTotal,
      eligibleUnitsByTicket: Object.fromEntries(
        order.lines.map((line) => [line.id, line.discountedUnits]),
      ),
      isPartial: eligibleTotal < order.tickets,
    };
  }, [appliedPromo, order]);

  const subTotal = order.lines.reduce((acc, line) => acc + line.amount, 0);
  // The code is not used when the group price is at least as good.
  const groupBeatsPromo =
    !!appliedPromo && order.tickets > 0 && !order.promoApplied;
  // "3 more tickets for 10% off": the next group price the order can reach.
  const nextGroupTier =
    [...groupTiers]
      .filter((tier) => tier.minTickets > order.tickets)
      .sort((a, b) => a.minTickets - b.minTickets)[0] ?? null;

  const hasSelectedTickets = Object.values(quantities).some((qty) => qty > 0);

  const hasUnavailableSelection = ticketList.some((ticket) => {
    const left = purchasesLeftOf(ticket);
    return left !== null && (quantities[ticket.id] || 0) > left;
  });

  const serviceFeeRate = useServiceFeeRate(
    ticketList[0]?.currency ?? undefined,
  );
  const fee = computeCheckoutFee(
    subTotal,
    serviceFeeRate,
    ticketList[0]?.currency,
  );

  const total = subTotal + fee;
  // Tickets, as a plan counts them: a Couple purchase is two.
  const ticketCount = order.tickets;
  const totalMinor = ticketList[0]?.currency
    ? (tryFromMajor(total, ticketList[0].currency)?.amountMinor ?? 0)
    : 0;

  const handleStartPlan = async () => {
    setIsProceeding(true);
    const response = await startTicketPlan({
      eventId,
      occurrenceId,
      quantities,
    }).catch(actionUnreachable);
    if (response.status === 200 && "data" in response && response.data) {
      router.push(`/ticket-plans/${response.data.planId}`);
      return;
    }
    if (response.status === 409 && "planId" in response && response.planId) {
      toast.info(response.message ?? tp("youReAlreadyPayingForThisEvent"));
      router.push(`/ticket-plans/${response.planId}`);
      setIsProceeding(false);
      return;
    }
    toast.error(
      ("message" in response && response.message) || tp("couldNotStartPlan"),
    );
    setIsProceeding(false);
  };

  const handleProceed = async () => {
    if (paySmallSmall) {
      await handleStartPlan();
      return;
    }
    setIsProceeding(true);

    const response = await validateCheckout({
      eventId,
      quantities,
      promoCode: appliedPromo?.code ?? null,
      occurrenceId,
    }).catch(actionUnreachable);

    if (
      response.status !== 200 &&
      "reason" in response &&
      response.reason === "pending_checkout"
    ) {
      toast.info(response.message ?? t("youAlreadyHaveAPendingCheckout"));
      router.push(`/checkout/${response.checkoutId}?type=ticket`);

      setIsProceeding(false);
      return;
    }

    if (response.status !== 200 || !response.checkoutSessionId) {
      toast.error(response.message ?? t("weCouldnTStartCheckoutPlease"));
      setIsProceeding(false);
      return;
    }

    router.push(`/checkout/${response.checkoutSessionId}?type=ticket`);
  };

  const ticketsErrorMessage = isTicketsError
    ? (ticketsResponseMessage ?? t("failedToLoadTicketsPleaseTry"))
    : null;

  return (
    <ModalShell
      open
      onClose={() => handleCheckoutModal(false)}
      title={t("checkout2", { eventTitle: eventTitle })}
    >
      <div className="w-full h-full bg-card text-card-foreground md:w-[60%] md:h-[90%] lg:w-[40%] md:rounded-xl py-5 space-y-5">
        {/* Header */}
        <div className="space-y-5">
          <div className="flex justify-between gap-4 px-5">
            <div className="flex min-w-0 flex-col gap-0.5">
              <h1 className="text-lg font-semibold text-foreground md:text-xl text-balance">
                {eventTitle}
              </h1>
              <p className="text-sm text-muted-foreground">
                {date} · {time}
              </p>
            </div>

            <button
              type="button"
              onClick={() => handleCheckoutModal(false)}
              className="self-start"
              aria-label={t("closeCheckout")}
            >
              <MdOutlineCancel className="text-2xl" aria-hidden />
            </button>
          </div>

          <hr className="border-border" />
        </div>

        <div className="flex flex-col gap-5 overflow-y-scroll h-[80%] px-5">
          {/* Display tickets */}
          {isTicketsLoading ? (
            <p className="text-muted-foreground">{t("loadingTickets")}</p>
          ) : isTicketsError ? (
            <div className="flex flex-col items-start gap-2">
              <p className="font-bold text-destructive">
                {ticketsErrorMessage}
              </p>
              <button
                type="button"
                onClick={() => refetchTickets()}
                className="font-bold border border-border rounded-md px-4 py-2"
              >
                {t("retry")}
              </button>
            </div>
          ) : ticketList.length === 0 ? (
            <p className="font-bold">{t("noTicketsAvailableForThisEvent")}</p>
          ) : (
            <>
              {ticketList.map((ticket) => {
                const qty = quantities[ticket.id] ?? 0;
                const eligibleUnits =
                  promoEligibility?.eligibleUnitsByTicket[ticket.id] ?? 0;
                const ticketPrice = ticket.price ?? 0;
                // One purchase at the code's price, rounded like the server
                // (the ticket's own currency's minor units). Not shown when
                // the group price wins.
                const discountedUnitPrice =
                  appliedPromo && ticket.currency && !groupBeatsPromo
                    ? priceOrder(
                        [
                          {
                            id: ticket.id,
                            purchases: 1,
                            admits: ticket.admits,
                            unitPrice: ticketPrice,
                            currency: ticket.currency,
                          },
                        ],
                        {
                          promo: {
                            percent: appliedPromo.discountPercentage,
                            remainingUses: null,
                          },
                        },
                      ).lines[0].amount
                    : null;

                return (
                  <CheckoutTicketRow
                    key={ticket.id}
                    ticket={ticket}
                    quantity={qty}
                    purchasesLeft={purchasesLeftOf(ticket)}
                    eligibleUnits={eligibleUnits}
                    discountedUnitPrice={discountedUnitPrice}
                    hasAppliedPromo={!!appliedPromo}
                    onDecrement={() =>
                      setQuantities((prev) => ({
                        ...prev,
                        [ticket.id]: Math.max((prev[ticket.id] || 0) - 1, 0),
                      }))
                    }
                    onIncrement={() =>
                      setQuantities((prev) => ({
                        ...prev,
                        [ticket.id]: (prev[ticket.id] || 0) + 1,
                      }))
                    }
                  />
                );
              })}
            </>
          )}

          {/* Group price: what the order gets, or how close the next is. */}
          {order.groupDiscountPercent > 0 ? (
            <p className="text-sm font-medium text-primary">
              {t("groupPriceApplied", {
                percent: formatPercent(order.groupDiscountPercent, locale, {
                  maximumFractionDigits: 0,
                }),
              })}
            </p>
          ) : null}
          {nextGroupTier && !paySmallSmall ? (
            <p className="text-sm text-muted-foreground">
              {t("groupPriceNextTier", {
                count: nextGroupTier.minTickets - order.tickets,
                percent: formatPercent(nextGroupTier.percentOff, locale, {
                  maximumFractionDigits: 0,
                }),
              })}
            </p>
          ) : null}
          {groupBeatsPromo ? (
            <p className="text-xs text-muted-foreground">
              {t("groupPriceBeatsPromo")}
            </p>
          ) : null}

          {planOffer ? (
            <PaySmallSmallChoice
              offer={planOffer}
              mode={payMode}
              onModeChange={(mode) => {
                setPayMode(mode);
                // A plan's price is the ticket price: no promo codes (v1).
                if (mode === "plan") removePromoCode();
              }}
              totalMinor={totalMinor}
              ticketCount={ticketCount}
            />
          ) : null}

          {/* After the tickets, beside the totals it changes: people pick
              what they want first, then apply a code. */}
          {paySmallSmall ? null : (
            <CheckoutPromoCodeBox
              promoCodeInput={promoCodeInput}
              onPromoCodeInputChange={setPromoCodeInput}
              appliedPromo={appliedPromo}
              isApplying={promoMutation.isPending}
              onApply={() => promoMutation.mutate(promoCodeInput)}
              onRemove={removePromoCode}
              promoEligibility={promoEligibility}
            />
          )}

          <CheckoutOrderTotals
            currency={ticketList[0]?.currency ?? undefined}
            subTotal={subTotal}
            fee={fee}
            total={total}
          />

          <button
            type="button"
            onClick={handleProceed}
            disabled={
              isProceeding ||
              promoMutation.isPending ||
              isTicketsLoading ||
              isTicketsError ||
              !hasSelectedTickets ||
              hasUnavailableSelection ||
              (paySmallSmall && ticketCount > (planOffer?.maxTickets ?? 0))
            }
            className="h-12 rounded-lg font-semibold text-primary-foreground bg-primary text-center mt-2 transition-colors hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isProceeding
              ? t("oneMoment")
              : paySmallSmall
                ? tp("startPayingSmallSmall")
                : t("continueToPayment")}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
