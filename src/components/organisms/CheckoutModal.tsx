import getPromoCode from "@/actions/getPromoCode";
import { getTickets } from "@/actions/getTickets";
import validateCheckout from "@/actions/validateCheckout";
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";
import { formatSingleDateTime } from "@/utils/dateFormatter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { IoAddSharp } from "react-icons/io5";
import { MdDiscount, MdOutlineCancel } from "react-icons/md";
import { TfiMinus } from "react-icons/tfi";
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

  const [error, setError] = useState<string | null>(null);

  const router = useRouter();

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => {
        setError(null);
      }, 3000);

      return () => clearTimeout(timer);
    }
  }, [error]);

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
          <div className="flex flex-col text-sm gap-2">
            <span>Promo Code</span>

            <div className="space-y-2 flex flex-col">
              <div className="flex gap-5 justify-between items-center border border-border p-4 rounded-md">
                <input
                  type="text"
                  className="outline-none w-full h-full bg-transparent"
                  placeholder="Enter code"
                  value={promoCodeInput}
                  disabled={!!appliedPromo}
                  onChange={(e) => setPromoCodeInput(e.target.value)}
                />

                <button
                  type="button"
                  className="font-bold disabled:opacity-50"
                  disabled={
                    promoMutation.isPending || !promoCodeInput || !!appliedPromo
                  }
                  onClick={() => promoMutation.mutate(promoCodeInput)}
                >
                  {promoMutation.isPending ? "Loading..." : "Apply"}
                </button>
              </div>

              {appliedPromo && (
                <button
                  type="button"
                  onClick={removePromoCode}
                  className="self-end font-bold border border-border rounded-md p-2"
                >
                  Remove
                </button>
              )}

              {promoEligibility?.isPartial && (
                <p className="text-xs text-muted-foreground">
                  Promo code applies to {promoEligibility.eligibleTotal} of{" "}
                  {promoEligibility.totalQuantity} selected tickets — its usage
                  limit has been reached. The remaining{" "}
                  {promoEligibility.totalQuantity -
                    promoEligibility.eligibleTotal}{" "}
                  ticket(s) are charged at full price.
                </p>
              )}
            </div>
          </div>

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
                  <div
                    key={ticket.id}
                    className={`border-2 rounded-md py-4 space-y-4 ${
                      qty > 0 ? "border-primary" : "border-border"
                    }`}
                  >
                    <div className="flex items-center justify-between px-4">
                      <p>{ticket.type}</p>

                      <div className="flex items-center gap-4">
                        <button
                          type="button"
                          disabled={qty <= 0}
                          onClick={() =>
                            setQuantities((prev) => ({
                              ...prev,
                              [ticket.id]: Math.max(
                                (prev[ticket.id] || 0) - 1,
                                0,
                              ),
                            }))
                          }
                          className="w-8 h-8 grid place-items-center text-xl md:text-2xl bg-muted border border-border text-foreground rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <TfiMinus />
                        </button>

                        <span>{qty}</span>

                        <button
                          type="button"
                          disabled={
                            ticket.quantity !== null &&
                            qty >= (ticket.quantity ?? 0)
                          }
                          onClick={() =>
                            setQuantities((prev) => ({
                              ...prev,
                              [ticket.id]: (prev[ticket.id] || 0) + 1,
                            }))
                          }
                          className="w-8 h-8 grid place-items-center text-xl md:text-2xl bg-primary text-primary-foreground rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <IoAddSharp />
                        </button>
                      </div>
                    </div>

                    <hr className="border-border" />

                    <div className="flex flex-col items-start gap-2 px-4">
                      <div className="flex justify-between items-center w-full font-bold">
                        <div className="flex flex-col">
                          <p className="flex items-center gap-2">
                            {ticket.currency} {""}
                            {discountedUnitPrice !== null ? (
                              <span className="flex justify-center items-center gap-1">
                                {discountedUnitPrice}{" "}
                                <MdDiscount className="text-lg" />
                              </span>
                            ) : (
                              ticket.price
                            )}
                          </p>

                          {qty > 0 && appliedPromo && eligibleUnits < qty && (
                            <p className="text-xs text-muted-foreground">
                              Discount applies to {eligibleUnits} of {qty}
                            </p>
                          )}
                        </div>

                        <p
                          className={
                            ticket.quantity === 0
                              ? "text-destructive font-bold"
                              : ""
                          }
                        >
                          {ticket.quantity === null
                            ? "Unlimited"
                            : ticket.quantity === 0
                              ? "Sold out"
                              : `Quantity left: ${ticket.quantity}`}
                        </p>
                      </div>

                      {ticket.type !== "SINGLE TICKET" &&
                        ticket.available_until && (
                          <p className="text-sm">
                            Sales end on{" "}
                            {formatSingleDateTime(ticket.available_until).date}
                          </p>
                        )}
                    </div>
                  </div>
                );
              })}
            </>
          )}

          <div className="rounded-2xl mt-5">
            {/* Subtotal */}
            <div className="flex justify-between items-center text-sm text-muted-foreground mb-2">
              <p>Subtotal</p>
              <p>
                <span className="font-medium">{ticketList[0]?.currency}</span>
                {typeof subTotal === "number" ? subTotal.toFixed(2) : "0.00"}
              </p>
            </div>

            {/* Fee (2%) */}
            <div className="flex justify-between items-center text-sm text-muted-foreground mb-2">
              <p>
                Fee <span className="text-xs text-muted-foreground">(2%)</span>
              </p>
              <p>
                <span className="font-medium">{ticketList[0]?.currency}</span>{" "}
                {typeof fee === "number" ? fee.toFixed(2) : "0.00"}
              </p>
            </div>

            {/* Divider */}
            <hr className="my-3 border-border" />

            {/* Total */}
            <div className="flex justify-between items-center text-base font-bold text-foreground">
              <p>Total</p>
              <p>
                <span className="text-primary">{ticketList[0]?.currency}</span>{" "}
                {typeof total === "number" ? total.toFixed(2) : "0.00"}
              </p>
            </div>
          </div>

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
