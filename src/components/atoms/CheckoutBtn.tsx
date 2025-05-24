"use client";

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
};

export default function CheckoutBtn({
  eventId,
  btnText,
  eventTitle,
  date,
  time,
  ticketSummary,
  promoCode,
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

    console.log(ticketQuantityAndType);

    const rawDate = date;

    const cleanedDateStr = rawDate.replace(/(\d+)(st|nd|rd|th)/, "$1");

    const parsedDate = new Date(cleanedDateStr);

    const endDate = new Date(parsedDate.getTime() + 24 * 60 * 60 * 1000);

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
            className="font-bold rounded-full w-full p-6 text-lg"
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
      actionButton = (
        <Button
          className="font-bold rounded-full w-full p-6 text-lg"
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
