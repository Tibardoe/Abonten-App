"use client";

import generateTicket from "@/actions/generateTicket";
import { getTickets } from "@/actions/getTickets";
import registerForFreeEvent from "@/actions/registerForFreeEvent";
import ticketPurchaseNotification from "@/actions/ticketPurchaseNotification";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { useQueryClient } from "@tanstack/react-query";
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
  checkoutId?: string;
  requireRegistration?: boolean;
  soldOut?: boolean;
};

export default function CheckoutBtn({
  eventId,
  btnText,
  eventTitle,
  date,
  time,
  checkoutId,
  requireRegistration,
  soldOut,
}: EventSlugPageProp) {
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);

  const [notification, setNotification] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);

  const requireAuth = useRequireAuth();

  const handleCheckoutModal = (state: boolean) => {
    setShowCheckoutModal(state);
  };

  const router = useRouter();

  const queryClient = useQueryClient();

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

  const getEventEndDate = () => {
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

    return new Date(endDatePlusOneDay.getTime() + 24 * 60 * 60 * 1000);
  };

  const handleResponse = async (response: {
    status: number;
    message?: string;
  }) => {
    if (
      response?.status !== 200 &&
      response.message === "Ticket for this event already bought"
    ) {
      setNotification(response?.message ?? "Something ocurred");
      router.push("/manage/my-events");

      setLoading(false);
      return;
    }

    if (response.status !== 200 && response.message) {
      setNotification(response.message);
      setLoading(false);

      return;
    }

    if (response.status === 200 && response.message) {
      setNotification(response.message);
      await ticketPurchaseNotification();

      setLoading(false);
      router.push("/manage/my-events");
    }
  };

  const handleFreeRegistration = async () => {
    if (!(await requireAuth())) return;

    setLoading(true);

    const response = await registerForFreeEvent(eventId, getEventEndDate());

    await handleResponse(response);
  };

  const handleMakePayment = async () => {
    if (!(await requireAuth())) return;

    if (!checkoutId) return;

    setLoading(true);

    const response = await generateTicket(checkoutId, getEventEndDate());

    await handleResponse(response);
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
      actionButton = soldOut ? (
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
      actionButton =
        requireRegistration && soldOut ? (
          <Button
            className="font-bold rounded-md w-full p-6 text-lg bg-muted text-muted-foreground cursor-not-allowed"
            disabled
          >
            Sold Out
          </Button>
        ) : (
          requireRegistration && (
            <Button
              className="font-bold rounded-md w-full p-6 text-lg"
              onClick={handleFreeRegistration}
              disabled={loading}
            >
              {loading ? "Registering..." : btnText}
            </Button>
          )
        );
      break;

    case "Make Payment":
      if (checkoutId) {
        actionButton = (
          <Button
            className="font-bold rounded-md w-full p-6 text-lg"
            onClick={handleMakePayment}
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
