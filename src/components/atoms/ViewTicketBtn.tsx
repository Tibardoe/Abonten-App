"use client";

import React, { useState } from "react";
// import { Button } from "../ui/button";

import type { UserTicketType } from "@/types/ticketType";
// import { useParams } from "next/navigation";
// import RecieptModal from "../organisms/RecieptModal";
import TicketModal from "../organisms/TicketModal";

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
        className="bg-mint text-white text-sm px-4 py-2 rounded-lg"
      >
        View Ticket
      </button>
    </>
  );
}
