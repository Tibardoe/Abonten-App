import { getTickets } from "@/actions/getTickets";
import type { TicketType } from "@/types/ticketType";
import { formatSingleDateTime } from "@/utils/dateFormatter";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { IoAddSharp } from "react-icons/io5";
import { TfiMinus } from "react-icons/tfi";

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
  btnText,
  eventTitle,
  time,
  date,
}: CheckoutProp) {
  const [tickets, setTickets] = useState<TicketType[]>([]);

  const [quantities, setQuantities] = useState<{
    [ticketType: string]: number;
  }>({});

  const [error, setError] = useState<string | null>(null);

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
    const qty = quantities[ticket.type] || 0;
    return acc + ticket.price * qty;
  }, 0);

  const handleData = () => {
    console.log("hi");
  };

  return (
    <div className="fixed top-0 left-0 w-full h-dvh bg-black bg-opacity-50 flex justify-center items-center z-10">
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
          {btnText !== "Register" && (
            <div className="flex flex-col text-sm gap-2">
              <span>Promo Code</span>
              <div className="flex gap-1 justify-between items-center border p-4 rounded-md">
                <input
                  type="text"
                  className="outline-none"
                  placeholder="Enter code"
                />

                <button type="button">Apply</button>
              </div>
            </div>
          )}

          {btnText === "Buy Ticket" &&
            tickets.map((ticket) => (
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
                      onClick={() =>
                        setQuantities((prev) => ({
                          ...prev,
                          [ticket.type]: Math.max(
                            (prev[ticket.type] || 0) - 1,
                            0,
                          ),
                        }))
                      }
                      className="w-8 h-8 grid place-items-center text-xl md:text-2xl bg-black bg-opacity-5 border text-black rounded-md"
                    >
                      <TfiMinus />
                    </button>

                    <span>{quantities[ticket.type] ?? 0}</span>

                    <button
                      type="button"
                      onClick={() =>
                        setQuantities((prev) => ({
                          ...prev,
                          [ticket.type]: (prev[ticket.type] || 0) + 1,
                        }))
                      }
                      className="w-8 h-8 grid place-items-center text-xl md:text-2xl bg-black text-white rounded-md"
                    >
                      <IoAddSharp />
                    </button>
                  </div>
                </div>

                <hr />

                <div className="flex flex-col items-start gap-2 px-4">
                  <p className="font-bold">
                    {ticket.currency} {ticket.price}
                  </p>

                  {ticket.type !== "SINGLE TICKET" &&
                    ticket.available_until && (
                      <p className="text-sm">
                        Sales end on{" "}
                        {formatSingleDateTime(ticket.available_until).date}
                      </p>
                    )}
                </div>
              </div>
            ))}

          {btnText === "Register" ? (
            <div className="flex flex-col gap-4">
              {/* You can replace this with your real registration form */}
              <input
                type="text"
                placeholder="Enter your name"
                className="border p-3 rounded-md"
              />
              <input
                type="email"
                placeholder="Enter your email"
                className="border p-3 rounded-md"
              />
              <button
                type="button"
                onClick={handleData}
                className="rounded-full p-4 font-bold text-white bg-black text-center"
              >
                Register
              </button>
            </div>
          ) : (
            <>
              <div className="flex justify-between items-center font-bold mt-5">
                <p>Total</p>
                <p>
                  {"GHS"} {total}
                </p>
              </div>

              <Link
                href={"#"}
                className="rounded-full p-4 font-bold text-white bg-black text-center mt-5"
              >
                Proceed
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
