"use client";

import { useState } from "react";
import CheckoutModal from "../organisms/CheckoutModal";
import { Button } from "../ui/button";

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

  const handleCheckoutModal = (state: boolean) => {
    setShowCheckoutModal(state);
  };
  return (
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
}
