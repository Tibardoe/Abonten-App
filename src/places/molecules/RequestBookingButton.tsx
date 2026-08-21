"use client";

import { useCurrentUser } from "@/hooks/useCurrentUser";
import RequestBookingModal from "@/places/organisms/RequestBookingModal";
import { useState } from "react";

type BookingService = {
  id: string;
  name: string;
};

type RequestBookingButtonProps = {
  placeId: string;
  placeName: string;
  ownerId: string;
  services: BookingService[];
};

/**
 * "Book" entry point on the public details page's primary actions row
 * (alongside Directions/Call/WhatsApp) -- visible only to a signed-in user
 * who is NOT the place's owner, same gating ClaimPlaceButton.tsx uses (an
 * owner has no reason to book their own place). Reservation REQUEST only,
 * per the confirmed milestone scope -- no in-app payment.
 */
export default function RequestBookingButton({
  placeId,
  placeName,
  ownerId,
  services,
}: RequestBookingButtonProps) {
  const { data: user } = useCurrentUser();
  const [showModal, setShowModal] = useState(false);

  if (!user || user.id === ownerId) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setShowModal(true)}
        className="flex items-center justify-center gap-2 bg-primary text-primary-foreground hover:bg-primary/90 py-2 md:py-3 rounded-lg transition-colors text-sm md:text-base"
      >
        Book
      </button>

      {showModal && (
        <RequestBookingModal
          placeId={placeId}
          placeName={placeName}
          services={services}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  );
}
