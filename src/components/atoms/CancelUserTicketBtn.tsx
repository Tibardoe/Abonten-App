"use client";

import cancelUserTicket from "@/actions/cancelUserTicket";
import React, { useEffect, useState } from "react";
import Notification from "./Notification";

type CancelTicketProp = {
  ticketId: string;
  transactionId: string | null;
  userId: string;
  eventId: string;
};

export default function CancelUserTicketBtn({
  ticketId,
  transactionId,
  userId,
  eventId,
}: CancelTicketProp) {
  const [notification, setNotification] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);

  const handleCancelTicket = async () => {
    setLoading(true);

    const response = await cancelUserTicket(
      ticketId,
      transactionId,
      userId,
      eventId,
    );

    if (response.status !== 200) {
      setNotification(response.message);

      setLoading(false);
    }

    setNotification(response.message);

    setLoading(false);
  };

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => {
        setNotification(null);
      }, 3000); // 3 seconds

      return () => clearTimeout(timer); // Cleanup
    }
  }, [notification]);

  return (
    <>
      <button
        type="button"
        className="bg-none text-red-500 border border-black text-sm px-4 py-2 rounded-lg"
        disabled={loading}
        onClick={handleCancelTicket}
      >
        {loading ? "Cancelling ticket..." : " Cancel Ticket"}
      </button>

      {notification && <Notification notification={notification} />}
    </>
  );
}
