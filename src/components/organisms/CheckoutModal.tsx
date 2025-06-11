import getPromoCode from "@/actions/getPromoCode";
import { getTickets } from "@/actions/getTickets";
import validateCheckout from "@/actions/validateCheckout";
import type { TicketType } from "@/types/ticketType";
import { formatSingleDateTime } from "@/utils/dateFormatter";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { IoAddSharp } from "react-icons/io5";
import { MdDiscount } from "react-icons/md";
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

export default function CheckoutModal({
  handleCheckoutModal,
  eventId,
  // btnText,
  eventTitle,
  time,
  date,
}: CheckoutProp) {
  const [tickets, setTickets] = useState<TicketType[]>([]);

  const [promoCode, setPromoCode] = useState<string | null>(null);

  const [discountAmount, setDiscountAmount] = useState<number | null>(null);

  const [isApplyingPromo, setIsApplyingPromo] = useState(false);

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

  useEffect(() => {
    const fetchTickets = async () => {
      const response = await getTickets(eventId);

      if (response.status !== 200 || !response.tickets) {
        setError(response.message ?? "Failed to fetch tickets");
        return;
      }

      setTickets(response.tickets);
    };

    fetchTickets();
  }, [eventId]);

  const total = tickets.reduce((acc, ticket) => {
    const qty = quantities[ticket.id] || 0;
    const price = discountAmount
      ? +(ticket.price - discountAmount * ticket.price).toFixed(2)
      : ticket.price;
    return acc + price * qty;
  }, 0);

  const handlePromoCode = async (promoCode: string) => {
    setIsApplyingPromo(true);
    const response = await getPromoCode(promoCode);

    if (response.status !== 200) {
      setError(response.message ?? "Failed to get promo code");
      setIsApplyingPromo(false);
      return;
    }

    setDiscountAmount(response.discountPercentage / 100);
    setIsApplyingPromo(false);
  };

  const removePromoCode = () => {
    setDiscountAmount(null);
    setPromoCode("");
  };

  const handleProceed = async () => {
    setIsProceeding(true);

    const response = await validateCheckout({ eventId, quantities, promoCode });

    if (
      response?.status !== 200 &&
      response.message ===
        "You already have a pending ticket checkout for this event"
    ) {
      setError(response?.message ?? "Something ocurred");
      router.push(`/wallet?checkoutId=${response.checkoutId}&type=ticket`);

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
      router.push(
        `/wallet?checkoutId=${response.checkoutSessionId}&type=ticket`,
      );
    }
  };

  return (
    <div className="fixed top-0 left-0 w-full h-dvh bg-black bg-opacity-50 flex justify-center items-center z-30">
      <div className="w-full h-full bg-white md:w-[60%] md:h-[90%] lg:w-[40%] md:rounded-xl py-5 space-y-5">
        {/* Header */}
        <div className="space-y-5">
          <div className="flex justify-between px-5">
            <div className="text-gray-500 flex flex-col items-center gap-2 w-full">
              <h1 className="text-xl md:text-2xl">
                {eventTitle.toUpperCase()}
              </h1>
              <p>
                {date} {time}
              </p>
            </div>

            <button
              type="button"
              onClick={() => handleCheckoutModal(false)}
              className="self-start"
            >
              <Image
                src="/assets/images/circularCancel.svg"
                alt="Cancel"
                width={30}
                height={30}
              />
            </button>
          </div>

          <hr />
        </div>

        <div className="flex flex-col gap-5 overflow-y-scroll h-[80%] px-5">
          <div className="flex flex-col text-sm gap-2">
            <span>Promo Code</span>

            <div className="space-y-2 flex flex-col">
              <div className="flex gap-5 justify-between items-center border p-4 rounded-md">
                <input
                  type="text"
                  className="outline-none w-full h-full"
                  placeholder="Enter code"
                  value={promoCode ?? ""}
                  onChange={(e) => setPromoCode(e.target.value)}
                />

                <button
                  type="button"
                  className="font-bold"
                  disabled={isApplyingPromo}
                  onClick={() => handlePromoCode(promoCode ?? "")}
                >
                  {isApplyingPromo ? "Loading..." : "Apply"}
                </button>
              </div>

              <button
                type="button"
                onClick={removePromoCode}
                className="self-end font-bold border border-black rounded-md p-2"
              >
                Remove
              </button>
            </div>
          </div>

          {/* Display tickets */}
          {tickets.map((ticket) => (
            <div
              key={ticket.type}
              className={`border-2 border-black rounded-md py-4 space-y-4 ${
                quantities[ticket.type] > 0
                  ? "border-opacity-100"
                  : "border-opacity-40"
              }`}
            >
              <div className="flex items-center justify-between px-4">
                <p>{ticket.type}</p>

                <div className="flex items-center gap-4">
                  <button
                    type="button"
                    disabled={(quantities[ticket.id] || 0) <= 0}
                    onClick={() =>
                      setQuantities((prev) => ({
                        ...prev,
                        [ticket.id]: Math.max((prev[ticket.id] || 0) - 1, 0),
                      }))
                    }
                    className="w-8 h-8 grid place-items-center text-xl md:text-2xl bg-black bg-opacity-5 border text-black rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <TfiMinus />
                  </button>

                  <span>{quantities[ticket.id] ?? 0}</span>

                  <button
                    type="button"
                    disabled={
                      (quantities[ticket.id] || 0) >= (ticket.quantity ?? 0)
                    }
                    onClick={() =>
                      setQuantities((prev) => ({
                        ...prev,
                        [ticket.id]: (prev[ticket.id] || 0) + 1,
                      }))
                    }
                    className="w-8 h-8 grid place-items-center text-xl md:text-2xl bg-black text-white rounded-md disabled:bg-opacity-50 disabled:cursor-not-allowed"
                  >
                    <IoAddSharp />
                  </button>
                </div>
              </div>

              <hr />

              <div className="flex flex-col items-start gap-2 px-4">
                <div className="flex justify-between items-center w-full font-bold">
                  <div className="flex flex-col">
                    <p className="flex items-center gap-2">
                      {ticket.currency} {""}
                      {discountAmount ? (
                        <span className="flex justify-center items-center gap-1">
                          {ticket.price - discountAmount * ticket.price}{" "}
                          <MdDiscount className="text-lg" />
                        </span>
                      ) : (
                        ticket.price
                      )}
                    </p>

                    <p className="text-xs text-gray-400">Fee +20USD</p>
                  </div>

                  <p>Quantity left: {ticket.quantity}</p>
                </div>

                {ticket.type !== "SINGLE TICKET" && ticket.available_until && (
                  <p className="text-sm">
                    Sales end on{" "}
                    {formatSingleDateTime(ticket.available_until).date}
                  </p>
                )}
              </div>
            </div>
          ))}

          <div className="flex justify-between items-center font-bold mt-5">
            <p>Total</p>
            <p>
              {"GHS"} {total}
            </p>
          </div>

          <button
            type="button"
            onClick={handleProceed}
            disabled={isProceeding}
            className="rounded-full p-4 font-bold text-white bg-black text-center mt-5"
          >
            {isProceeding ? "Loading..." : "Proceed to Payment"}
          </button>
        </div>
      </div>

      {error && <Notification notification={error} />}
    </div>
  );
}
