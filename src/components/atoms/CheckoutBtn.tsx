"use client";

import { getTickets } from "@/actions/getTickets";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import CheckoutModal from "../organisms/CheckoutModal";
import { Button } from "../ui/button";

type EventSlugPageProp = {
  eventId: string;
  occurrenceId: string | null;
  btnText: string;
  eventTitle: string;
  date: string;
  time: string;
  soldOut?: boolean;
};

export default function CheckoutBtn({
  eventId,
  occurrenceId,
  btnText,
  eventTitle,
  date,
  time,
  soldOut,
}: EventSlugPageProp) {
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);

  const requireAuth = useRequireAuth();

  const queryClient = useQueryClient();

  const handleCheckoutModal = (state: boolean) => {
    setShowCheckoutModal(state);
  };

  // Warm the same query CheckoutModal uses, so by the time a user actually
  // clicks "Buy Ticket" the modal usually opens with data already cached
  // instead of showing a loading state.
  const prefetchTickets = () => {
    queryClient.prefetchQuery({
      queryKey: ["eventTickets", eventId],
      queryFn: () => getTickets(eventId),
      staleTime: 30_000,
    });
  };

  return soldOut ? (
    <Button
      className="font-bold rounded-lg w-full p-6 text-lg bg-muted text-muted-foreground cursor-not-allowed"
      disabled
    >
      Sold Out
    </Button>
  ) : (
    <>
      <Button
        className="font-bold rounded-lg w-full p-6 text-lg"
        onClick={async () => {
          if (await requireAuth()) handleCheckoutModal(true);
        }}
        onPointerEnter={prefetchTickets}
        onFocus={prefetchTickets}
      >
        {btnText}
      </Button>
      {showCheckoutModal && (
        <CheckoutModal
          handleCheckoutModal={handleCheckoutModal}
          eventId={eventId}
          occurrenceId={occurrenceId}
          btnText={btnText}
          eventTitle={eventTitle}
          date={date}
          time={time}
        />
      )}
    </>
  );
}
