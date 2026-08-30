"use client";

import React, { useState } from "react";

import type { UserTicketType } from "@abonten/types/ticketType";
import dynamic from "next/dynamic";

// Dynamically imported so the PDF-generation library (@react-pdf/renderer)
// only loads once a user actually opens their ticket.
const TicketModal = dynamic(() => import("../organisms/TicketModal"), {
  ssr: false,
});

type ViewTicketBtnProps = {
  event: UserTicketType;
};

export default function ViewTicketBtn({ event }: ViewTicketBtnProps) {
  const [showTicket, setShowTicket] = useState(false);

  // const { transactionId } = useParams();

  const handleShowTicket = (state: boolean) => {
    setShowTicket(state);
  };

  return (
    <>
      {showTicket && (
        <TicketModal handleShowTicket={handleShowTicket} event={event} />
      )}

      <button
        type="button"
        onClick={() => handleShowTicket(true)}
        className="bg-primary text-primary-foreground text-sm px-4 py-2 rounded-lg"
      >
        View Ticket
      </button>
    </>
  );
}
