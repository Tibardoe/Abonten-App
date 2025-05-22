"use client";

import generateTicket from "@/actions/generateTicket";
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
};

export default function CheckoutBtn({
  eventId,
  btnText,
  eventTitle,
  date,
  time,
}: EventSlugPageProp) {
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);

  const [notification, setNotification] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);

  const handleCheckoutModal = (state: boolean) => {
    setShowCheckoutModal(state);
  };

  const handleRegistration = async () => {
    setLoading(true);

    const rawDate = date;

    const cleanedDateStr = rawDate.replace(/(\d+)(st|nd|rd|th)/, "$1");

    const parsedDate = new Date(cleanedDateStr);

    const endDate = new Date(parsedDate.getTime() + 24 * 60 * 60 * 1000);

    const response = await generateTicket(
      eventId,
      [{ type: "FREE", quantity: 1 }],
      endDate,
    );

    if (response.status !== 200) {
      setNotification(response.message);
      setLoading(false);
    }

    setNotification(response.message);
    setLoading(false);
    console.log("registered");
  };

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => {
        setNotification(null);
      }, 3000); // 3 seconds

      return () => clearTimeout(timer); // Cleanup
    }
  }, [notification]);

  return btnText === "Buy Ticket" ? (
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
  ) : (
    <>
      <Button
        className="font-bold rounded-full w-full p-6 text-lg"
        onClick={() => handleRegistration()}
        disabled={loading}
      >
        {loading ? "Registering..." : btnText}
      </Button>

      {notification !== null && <Notification notification={notification} />}
    </>
  );
}
