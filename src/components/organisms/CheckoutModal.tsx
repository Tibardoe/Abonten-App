import getPromoCode from "@/actions/getPromoCode";
import { getTickets } from "@/actions/getTickets";
import validateCheckout from "@/actions/validateCheckout";
import CheckoutOrderTotals from "@/components/molecules/CheckoutOrderTotals";
import CheckoutPromoCodeBox from "@/components/molecules/CheckoutPromoCodeBox";
import CheckoutTicketRow from "@/components/molecules/CheckoutTicketRow";
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";
import { useTimedMessage } from "@/hooks/useTimedMessage";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { MdOutlineCancel } from "react-icons/md";
import Notification from "../atoms/Notification";

type CheckoutProp = {
  handleCheckoutModal: (state: boolean) => void;
  eventId: string;
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
  // btnText,
  eventTitle,
  time,
  date,
}: CheckoutProp) {
  useBodyScrollLock(true);

  const [promoCodeInput, setPromoCodeInput] = useState("");

  const [appliedPromo, setAppliedPromo] = useState<AppliedPromo | null>(null);

  const [isProceeding, setIsProceeding] = useState(false);

  const [quantities, setQuantities] = useState<{
    [ticketTypeId: string]: number;
  }>({});

  const { message: error, showMessage: setError } = useTimedMessage();

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
        if (ticket.quantity !== null && selected > ticket.quantity) {
          next[ticket.id] = Math.max(ticket.quantity, 0);
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
        setError(response.message ?? "Failed to apply promo code");
        setAppliedPromo(null);
        return;
      }

      setAppliedPromo({
        code: promoCodeInput,
        discountPercentage: response.discountPercentage,
        remainingUses: response.remainingUses ?? null,
      });
    },
    onError: (mutationError) => {
      setError(
        mutationError instanceof Error
          ? mutationError.message
          : "Failed to apply promo code. Please try again.",
      );
      setAppliedPromo(null);
    },
  });

  const removePromoCode = () => {
    setAppliedPromo(null);
    setPromoCodeInput("");
    promoMutation.reset();
  };

  // How many of the selected ticket units the applied promo actually covers.
  // Filled first-come across ticket types (in display order) so this matches
  // the same rule validateCheckout enforces server-side when max_uses is
  // smaller than the total quantity selected.
  const promoEligibility = useMemo(() => {
    if (!appliedPromo) return null;

    const totalQuantity = ticketList.reduce(
      (sum, ticket) => sum + (quantities[ticket.id] || 0),
      0,
    );

    const eligibleTotal =
      appliedPromo.remainingUses === null
        ? totalQuantity
        : Math.min(totalQuantity, appliedPromo.remainingUses);

    let unitsLeft = eligibleTotal;
    const eligibleUnitsByTicket: { [ticketTypeId: string]: number } = {};

    for (const ticket of ticketList) {
      const selected = quantities[ticket.id] || 0;
      const eligible = Math.min(selected, unitsLeft);
      eligibleUnitsByTicket[ticket.id] = eligible;
      unitsLeft -= eligible;
    }

    return {
      totalQuantity,
      eligibleTotal,
      eligibleUnitsByTicket,
      isPartial: eligibleTotal < totalQuantity,
    };
  }, [appliedPromo, ticketList, quantities]);

  const subTotal = ticketList.reduce((acc, ticket) => {
    const qty = quantities[ticket.id] || 0;
    if (qty === 0) return acc;

    const eligibleUnits =
      promoEligibility?.eligibleUnitsByTicket[ticket.id] ?? 0;
    const discountPerUnit = appliedPromo
      ? (appliedPromo.discountPercentage / 100) * ticket.price
      : 0;

    const lineTotal = qty * ticket.price - eligibleUnits * discountPerUnit;

    return acc + Math.max(0, lineTotal);
  }, 0);

  const hasSelectedTickets = Object.values(quantities).some((qty) => qty > 0);

  const hasUnavailableSelection = ticketList.some(
    (ticket) =>
      ticket.quantity !== null &&
      (quantities[ticket.id] || 0) > ticket.quantity,
  );

  const fee = subTotal > 0 ? subTotal * 0.02 : 0;

  const total = subTotal + fee;

  const handleProceed = async () => {
    setIsProceeding(true);

    const response = await validateCheckout({
      eventId,
      quantities,
      promoCode: appliedPromo?.code ?? null,
    });

    if (
      response?.status !== 200 &&
      response.message ===
        "You already have a pending ticket checkout for this event"
    ) {
      setError(response?.message ?? "Something ocurred");
      router.push(`/wallet/${response.checkoutId}?type=ticket`);

      setIsProceeding(false);
      return;
    }

    if (
      response?.status !== 200 &&
      response.message === "Ticket for this event already bought"
    ) {
      setError(response?.message ?? "Something ocurred");
      router.push("/manage/my-events");

      setIsProceeding(false);
      return;
    }

    if (response?.status !== 200) {
      setError(response?.message ?? "Something ocurred");
      setIsProceeding(false);
      return;
    }

    if (response?.status === 200 && response.checkoutSessionId) {
      router.push(`/wallet/${response.checkoutSessionId}?type=ticket`);
    }
  };

  const ticketsErrorMessage = isTicketsError
    ? (ticketsResponseMessage ?? "Failed to load tickets. Please try again.")
    : null;

  return (
    <div className="fixed top-0 left-0 w-full h-dvh bg-overlay/50 flex justify-center items-center z-30">
      <div className="w-full h-full bg-card text-card-foreground md:w-[60%] md:h-[90%] lg:w-[40%] md:rounded-xl py-5 space-y-5">
        {/* Header */}
        <div className="space-y-5">
          <div className="flex justify-between px-5">
            <div className="text-muted-foreground flex flex-col items-center md:gap-2 w-full">
              <h1 className="text-xl md:text-2xl">
                {eventTitle.toUpperCase()}
              </h1>
              <p className="text-xs md:text-sm">
                {date} {time}
              </p>
            </div>

            <button
              type="button"
              onClick={() => handleCheckoutModal(false)}
              className="self-start"
            >
              <MdOutlineCancel className="text-2xl" />
            </button>
          </div>

          <hr className="border-border" />
        </div>

        <div className="flex flex-col gap-5 overflow-y-scroll h-[80%] px-5">
          <CheckoutPromoCodeBox
            promoCodeInput={promoCodeInput}
            onPromoCodeInputChange={setPromoCodeInput}
            appliedPromo={appliedPromo}
            isApplying={promoMutation.isPending}
            onApply={() => promoMutation.mutate(promoCodeInput)}
            onRemove={removePromoCode}
            promoEligibility={promoEligibility}
          />

          {/* Display tickets */}
          {isTicketsLoading ? (
            <p className="font-bold">Loading Tickets...</p>
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
                Retry
              </button>
            </div>
          ) : ticketList.length === 0 ? (
            <p className="font-bold">No tickets available for this event.</p>
          ) : (
            <>
              {ticketList.map((ticket) => {
                const qty = quantities[ticket.id] ?? 0;
                const eligibleUnits =
                  promoEligibility?.eligibleUnitsByTicket[ticket.id] ?? 0;
                const discountedUnitPrice = appliedPromo
                  ? +(
                      ticket.price -
                      (appliedPromo.discountPercentage / 100) * ticket.price
                    ).toFixed(2)
                  : null;

                return (
                  <CheckoutTicketRow
                    key={ticket.id}
                    ticket={ticket}
                    quantity={qty}
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

          <CheckoutOrderTotals
            currency={ticketList[0]?.currency}
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
              hasUnavailableSelection
            }
            className="rounded-md p-4 font-bold text-primary-foreground bg-primary text-center mt-5 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isProceeding ? "Loading..." : "Proceed to Payment"}
          </button>
        </div>
      </div>

      {error && <Notification notification={error} />}
    </div>
  );
}
