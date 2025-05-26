"use client";

import deleteCheckout from "@/actions/deleteCheckout";
import generateTicket from "@/actions/generateTicket";
import type { TicketData } from "@/types/ticketType";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import CheckoutModal from "../organisms/CheckoutModal";
import { Button } from "../ui/button";
import Notification from "./Notification";

type EventSlugPageProp = {
  eventId: string;
  btnText: string;
  eventTitle: string;
  date: string;
  time: string;
  ticketSummary?: TicketData[];
  promoCode?: string;
  checkoutId?: string;
  checkoutType?: "ticket" | "subscription";
  requireRegistration?: boolean;
};

export default function CheckoutBtn({
  eventId,
  btnText,
  eventTitle,
  date,
  time,
  ticketSummary,
  promoCode,
  checkoutId,
  checkoutType,
  requireRegistration,
}: EventSlugPageProp) {
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);

  const [notification, setNotification] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);

  const handleCheckoutModal = (state: boolean) => {
    setShowCheckoutModal(state);
  };

  const router = useRouter();

  const handleRegistration = async (ticketQuantityAndType: TicketData[]) => {
    setLoading(true);

    const rawDate = date;

    // Step 1: Extract the end date string
    let endDateStr = rawDate.includes("-")
      ? rawDate.split("-")[1].trim()
      : rawDate.trim();

    // Step 2: Remove ordinal suffixes
    endDateStr = endDateStr.replace(/(\d+)(st|nd|rd|th)/, "$1");

    // Step 3: Parse end date
    const parsedEndDate = new Date(endDateStr);

    // Step 4: Add 24 hours (in milliseconds)
    const endDatePlusOneDay = new Date(
      parsedEndDate.getTime() + 24 * 60 * 60 * 1000,
    );

    const endDate = new Date(endDatePlusOneDay.getTime() + 24 * 60 * 60 * 1000);

    const response = await generateTicket(
      eventId,
      ticketQuantityAndType,
      promoCode,
      endDate,
    );

    if (response.status !== 200 && response.message) {
      setNotification(response.message);
      setLoading(false);

      return;
    }

    if (response.status === 200 && response.message) {
      setNotification(response.message);

      if (checkoutId && checkoutType) {
        const deleteCheckoutResponse = await deleteCheckout(
          checkoutId,
          checkoutType,
        );

        if (deleteCheckoutResponse.status !== 200) {
          setNotification(deleteCheckoutResponse.message);
        }
      }

      setLoading(false);
      router.push("/manage/my-events");
    }
  };

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => {
        setNotification(null);
      }, 3000); // 3 seconds

      return () => clearTimeout(timer); // Cleanup
    }
  }, [notification]);

  let actionButton: React.ReactNode = null;

  switch (btnText) {
    case "Buy Ticket":
      actionButton = (
        <>
          <Button
            className="font-bold rounded-lg w-full p-6 text-lg"
            onClick={() => handleCheckoutModal(true)}
          >
            {btnText}
          </Button>
          {showCheckoutModal && (
            <CheckoutModal
              handleCheckoutModal={handleCheckoutModal}
              eventId={eventId}
              btnText={btnText}
              eventTitle={eventTitle}
              date={date}
              time={time}
            />
          )}
        </>
      );
      break;

    case "Register":
      actionButton = requireRegistration && (
        <Button
          className="font-bold rounded-lg w-full p-6 text-lg"
          onClick={() => handleRegistration([{ type: "Free", quantity: 1 }])}
          disabled={loading}
        >
          {loading ? "Registering..." : btnText}
        </Button>
      );
      break;

    case "Make Payment":
      if (ticketSummary) {
        actionButton = (
          <Button
            className="font-bold rounded-full w-full p-6 text-lg"
            onClick={() => handleRegistration(ticketSummary)}
            disabled={loading}
          >
            {loading ? "Please wait..." : btnText}
          </Button>
        );
      }
      break;
  }

  return (
    <>
      {actionButton}
      {notification && <Notification notification={notification} />}
    </>
  );
}
